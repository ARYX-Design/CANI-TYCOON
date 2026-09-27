// Where the server keeps its data.
//
//   DATABASE_URL set  -> PostgreSQL, e.g. a free Neon database (neon.tech). Survives redeploys and works on hosts
//                        without a permanent disk (Render, Railway, Fly.io, ...).
//   otherwise         -> JSON files in DATA_DIR (db.json + saves/), fine for one computer in the shop.
//
// The server keeps everything in memory and writes changes back (the PostgreSQL store only writes the records
// that changed). Run ONE server process per database.

const fs = require('fs');
const path = require('path');

const KINDS = ['players', 'coupons', 'contacts', 'scores', 'log'];
const EMPTY = () => ({ players: {}, coupons: {}, log: [], contacts: {}, scores: {} });

// ---------- JSON files ----------

function fileStore(dataDir) {
  const DB_FILE = path.join(dataDir, 'db.json');
  const SAVE_DIR = path.join(dataDir, 'saves');
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  const saveFile = id => path.join(SAVE_DIR, id.replace(/[^\w-]/g, '') + '.json');
  const writeAtomic = (f, text) => { fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f); };
  return {
    kind: `files in ${dataDir}`,
    async load() {
      try { return { ...EMPTY(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { return EMPTY(); }
    },
    async flush(db) { writeAtomic(DB_FILE, JSON.stringify(db)); },
    async readSave(id) { try { return JSON.parse(fs.readFileSync(saveFile(id), 'utf8')); } catch (e) { return null; } },
    async writeSave(id, rec) { writeAtomic(saveFile(id), JSON.stringify(rec)); },
    async deleteSave(id) { try { fs.unlinkSync(saveFile(id)); } catch (e) { /* no save */ } },
  };
}

// ---------- PostgreSQL (Neon) ----------

function pgStore(url) {
  let Pool;
  try { ({ Pool } = require('pg')); }
  catch (e) { throw new Error('DATABASE_URL is set but the "pg" package is missing. Run "npm install" first.'); }
  const pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
  pool.on('error', e => console.error('database connection error:', e.message));   // Neon closes idle connections
  const flushed = new Map();          // "kind\tid" -> the JSON last written, so only changes are sent
  const host = (() => { try { return new URL(url).hostname; } catch (e) { return 'database'; } })();

  const records = db => {
    const out = new Map();
    for (const kind of KINDS) {
      const src = db[kind] || (kind === 'log' ? [] : {});
      const entries = Array.isArray(src) ? src.map((v, i) => [String(i).padStart(8, '0'), v]) : Object.entries(src);
      for (const [id, v] of entries) out.set(kind + '\t' + id, JSON.stringify(v));
    }
    return out;
  };

  return {
    kind: `PostgreSQL at ${host}`,
    async load() {
      await pool.query(`CREATE TABLE IF NOT EXISTS cani_records (
          kind text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (kind, id))`);
      await pool.query(`CREATE TABLE IF NOT EXISTS cani_saves (
          player_id text PRIMARY KEY, saved_at bigint NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      const db = EMPTY();
      const { rows } = await pool.query('SELECT kind, id, data FROM cani_records ORDER BY kind, id');
      for (const r of rows) {
        if (!KINDS.includes(r.kind)) continue;
        if (r.kind === 'log') db.log.push(r.data); else db[r.kind][r.id] = r.data;
        flushed.set(r.kind + '\t' + r.id, JSON.stringify(r.data));
      }
      return db;
    },
    async flush(db) {
      const now = records(db);
      const upserts = [], deletes = [];
      for (const [key, json] of now) if (flushed.get(key) !== json) upserts.push([key, json]);
      for (const key of flushed.keys()) if (!now.has(key)) deletes.push(key);
      if (!upserts.length && !deletes.length) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < upserts.length; i += 200) {
          const chunk = upserts.slice(i, i + 200);
          const params = [], values = chunk.map(([key, json], j) => {
            const [kind, id] = key.split('\t');
            params.push(kind, id, json);
            return `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3}::jsonb, now())`;
          });
          await client.query(`INSERT INTO cani_records (kind, id, data, updated_at) VALUES ${values.join(', ')}
            ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, params);
        }
        for (const key of deletes) {
          const [kind, id] = key.split('\t');
          await client.query('DELETE FROM cani_records WHERE kind = $1 AND id = $2', [kind, id]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { client.release(); }
      // remember what is stored now (only after the transaction went through)
      for (const [key, json] of upserts) flushed.set(key, json);
      for (const key of deletes) flushed.delete(key);
    },
    async readSave(id) {
      const { rows } = await pool.query('SELECT saved_at, data FROM cani_saves WHERE player_id = $1', [id]);
      return rows[0] ? { savedAt: +rows[0].saved_at, save: rows[0].data } : null;
    },
    async writeSave(id, rec) {
      await pool.query(`INSERT INTO cani_saves (player_id, saved_at, data) VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (player_id) DO UPDATE SET saved_at = EXCLUDED.saved_at, data = EXCLUDED.data, updated_at = now()`,
      [id, rec.savedAt, JSON.stringify(rec.save)]);
    },
    async deleteSave(id) { await pool.query('DELETE FROM cani_saves WHERE player_id = $1', [id]); },
    async close() { await pool.end(); },
  };
}

module.exports = function openStore({ dataDir, databaseUrl }) {
  return databaseUrl ? pgStore(databaseUrl) : fileStore(dataDir);
};
