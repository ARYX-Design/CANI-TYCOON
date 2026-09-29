// Where the API keeps its data. Every call reads or writes the store directly, so any number of server copies
// (Neon Functions start several and stop them when idle) always see the same data.
//
//   openData({ databaseUrl })  -> PostgreSQL / Neon (tables cani_records, cani_saves, cani_hits)
//   openData({ dataDir })      -> JSON files for running on one computer without a database
//
// Records are JSON documents grouped by kind: players, coupons, contacts, scores, authcodes, log.

const fs = require('fs');
const path = require('path');

const ORDER = new Set(['earned', 'served', 'day']);

// ---------- PostgreSQL (Neon) ----------

function pgData(url) {
  let Pool;
  try { ({ Pool } = require('pg')); }
  catch (e) { throw new Error('DATABASE_URL is set but the "pg" package is missing. Run "npm install" first.'); }
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
  // Neon closes idle connections; without a listener that would crash the process
  pool.on('error', e => { if (!/terminated|ECONNRESET|EPIPE|ETIMEDOUT/i.test(e.message)) console.error('database connection error:', e.message); });
  const host = (() => { try { return new URL(url).hostname; } catch (e) { return 'database'; } })();
  const q = (text, params) => pool.query(text, params);
  let ready = null;

  const self = {
    kind: `PostgreSQL at ${host}`,
    init() {
      ready = ready || (async () => {
        await q(`CREATE TABLE IF NOT EXISTS cani_records (
            kind text NOT NULL, id text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (kind, id))`);
        await q(`CREATE TABLE IF NOT EXISTS cani_saves (
            player_id text PRIMARY KEY, saved_at bigint NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
        await q(`CREATE TABLE IF NOT EXISTS cani_hits (key text PRIMARY KEY, window_start bigint NOT NULL, count int NOT NULL)`);
        await q(`CREATE INDEX IF NOT EXISTS cani_player_tokens ON cani_records USING gin ((data->'tokenHashes')) WHERE kind = 'players'`);
        await q(`CREATE INDEX IF NOT EXISTS cani_coupon_owner ON cani_records ((data->>'playerId')) WHERE kind = 'coupons'`);
      })().catch(e => { ready = null; throw e; });
      return ready;
    },
    async get(kind, id) {
      await self.init();
      const { rows } = await q('SELECT data FROM cani_records WHERE kind = $1 AND id = $2', [kind, id]);
      return rows[0] ? rows[0].data : null;
    },
    async put(kind, id, data) {
      await self.init();
      await q(`INSERT INTO cani_records (kind, id, data) VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [kind, id, JSON.stringify(data)]);
    },
    async del(kind, id) {
      await self.init();
      await q('DELETE FROM cani_records WHERE kind = $1 AND id = $2', [kind, id]);
    },
    // read, change and write one record while holding its row lock, so two requests can't both spend the same coins
    async update(kind, id, fn) {
      await self.init();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT data FROM cani_records WHERE kind = $1 AND id = $2 FOR UPDATE', [kind, id]);
        if (!rows[0]) { await client.query('ROLLBACK'); return null; }
        const data = rows[0].data;
        fn(data);
        await client.query('UPDATE cani_records SET data = $3::jsonb, updated_at = now() WHERE kind = $1 AND id = $2', [kind, id, JSON.stringify(data)]);
        await client.query('COMMIT');
        return data;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { client.release(); }
    },
    async playerByToken(hash) {
      await self.init();
      const { rows } = await q(`SELECT data FROM cani_records WHERE kind = 'players' AND data->'tokenHashes' ? $1 LIMIT 1`, [hash]);
      return rows[0] ? rows[0].data : null;
    },
    async couponsOf(playerId) {
      await self.init();
      const { rows } = await q(`SELECT data FROM cani_records WHERE kind = 'coupons' AND data->>'playerId' = $1`, [playerId]);
      return rows.map(r => r.data);
    },
    async topScores(key, limit) {
      if (!ORDER.has(key)) throw new Error('bad order');
      await self.init();
      const { rows } = await q(`SELECT id, data FROM cani_records WHERE kind = 'scores'
        ORDER BY (data->>'${key}')::numeric DESC, (data->>'updatedAt')::numeric ASC LIMIT $1`, [limit]);
      const count = await q(`SELECT count(*)::int AS n FROM cani_records WHERE kind = 'scores'`);
      return { rows: rows.map(r => ({ ...r.data, id: r.id })), players: count.rows[0].n };
    },
    async scoreRank(key, sc) {
      if (!ORDER.has(key)) throw new Error('bad order');
      await self.init();
      const { rows } = await q(`SELECT count(*)::int AS n FROM cani_records WHERE kind = 'scores' AND ((data->>'${key}')::numeric > $1
        OR ((data->>'${key}')::numeric = $1 AND (data->>'updatedAt')::numeric < $2))`, [sc[key] || 0, sc.updatedAt || 0]);
      return rows[0].n;
    },
    // fixed-window counter: true when `key` was used more than `max` times in the current window
    async hit(key, max, windowMs) {
      await self.init();
      const now = Date.now();
      const { rows } = await q(`INSERT INTO cani_hits (key, window_start, count) VALUES ($1, $2, 1)
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN cani_hits.window_start < $3 THEN 1 ELSE cani_hits.count + 1 END,
          window_start = CASE WHEN cani_hits.window_start < $3 THEN EXCLUDED.window_start ELSE cani_hits.window_start END
        RETURNING count`, [key, now, now - windowMs]);
      if (Math.random() < 0.01) q('DELETE FROM cani_hits WHERE window_start < $1', [now - 2 * 86400e3]).catch(() => {});
      return rows[0].count > max;
    },
    async log(entry) {
      await self.put('log', String(entry.at).padStart(15, '0') + '-' + Math.random().toString(36).slice(2, 7), entry);
    },
    async staffStats(todayStr) {
      await self.init();
      const counts = await q(`SELECT kind, count(*)::int AS n FROM cani_records WHERE kind IN ('coupons', 'players') GROUP BY kind`);
      const n = Object.fromEntries(counts.rows.map(r => [r.kind, r.n]));
      const { rows } = await q(`SELECT data FROM cani_records WHERE kind = 'coupons' AND data->>'usedAt' IS NOT NULL
        ORDER BY (data->>'usedAt')::numeric DESC LIMIT 200`);
      const used = rows.map(r => r.data);
      return {
        usedToday: used.filter(c => new Date(c.usedAt).toLocaleDateString('sv-SE') === todayStr).length,
        issued: n.coupons || 0, players: n.players || 0, recent: used.slice(0, 15),
      };
    },
    async isEmpty() {
      await self.init();
      const { rows } = await q(`SELECT 1 FROM cani_records WHERE kind = 'players' LIMIT 1`);
      return !rows.length;
    },
    async readSave(id) {
      await self.init();
      const { rows } = await q('SELECT saved_at, data FROM cani_saves WHERE player_id = $1', [id]);
      return rows[0] ? { savedAt: +rows[0].saved_at, save: rows[0].data } : null;
    },
    async writeSave(id, rec) {
      await self.init();
      await q(`INSERT INTO cani_saves (player_id, saved_at, data) VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (player_id) DO UPDATE SET saved_at = EXCLUDED.saved_at, data = EXCLUDED.data, updated_at = now()`,
      [id, rec.savedAt, JSON.stringify(rec.save)]);
    },
    async deleteSave(id) { await self.init(); await q('DELETE FROM cani_saves WHERE player_id = $1', [id]); },
    async close() { await pool.end(); },
  };
  return self;
}

// ---------- JSON files (one server process) ----------

function fileData(dataDir) {
  const DB_FILE = path.join(dataDir, 'db.json');
  const SAVE_DIR = path.join(dataDir, 'saves');
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  const saveFile = id => path.join(SAVE_DIR, id.replace(/[^\w-]/g, '') + '.json');
  const writeAtomic = (f, text) => { fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f); };
  let db = { players: {}, coupons: {}, contacts: {}, scores: {}, authcodes: {}, log: [] };
  try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { /* first run */ }
  // older files kept the token list as a single tokenHash
  for (const p of Object.values(db.players)) { if (!p.tokenHashes) p.tokenHashes = p.tokenHash ? [p.tokenHash] : []; delete p.tokenHash; }
  const hits = new Map();
  let timer = null;
  const persist = () => { if (!timer) timer = setTimeout(() => { timer = null; writeAtomic(DB_FILE, JSON.stringify(db)); }, 200); };
  const table = kind => (db[kind] = db[kind] || {});
  const clone = v => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const sortScores = key => Object.entries(db.scores).map(([id, s]) => ({ ...s, id }))
    .sort((a, b) => b[key] - a[key] || a.updatedAt - b.updatedAt);

  return {
    kind: `files in ${dataDir}`,
    async init() {},
    async get(kind, id) { return clone(table(kind)[id]); },
    async put(kind, id, data) { table(kind)[id] = clone(data); persist(); },
    async del(kind, id) { delete table(kind)[id]; persist(); },
    async update(kind, id, fn) {
      if (!table(kind)[id]) return null;
      const data = clone(table(kind)[id]);
      fn(data);                       // throws before anything is stored when the change is refused
      table(kind)[id] = data;
      persist();
      return clone(data);
    },
    async playerByToken(hash) { return clone(Object.values(db.players).find(p => (p.tokenHashes || []).includes(hash))); },
    async couponsOf(playerId) { return clone(Object.values(db.coupons).filter(c => c.playerId === playerId)); },
    async topScores(key, limit) { const all = sortScores(key); return { rows: all.slice(0, limit), players: all.length }; },
    async scoreRank(key, sc) { return Object.values(db.scores).filter(s => s[key] > sc[key] || (s[key] === sc[key] && s.updatedAt < sc.updatedAt)).length; },
    async hit(key, max, windowMs) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
      arr.push(now);
      hits.set(key, arr);
      return arr.length > max;
    },
    async log(entry) { db.log.push(entry); persist(); },
    async staffStats(todayStr) {
      const coupons = Object.values(db.coupons);
      const used = coupons.filter(c => c.usedAt).sort((a, b) => b.usedAt - a.usedAt);
      return { usedToday: used.filter(c => new Date(c.usedAt).toLocaleDateString('sv-SE') === todayStr).length,
        issued: coupons.length, players: Object.keys(db.players).length, recent: clone(used.slice(0, 15)) };
    },
    async isEmpty() { return !Object.keys(db.players).length; },
    async readSave(id) { try { return JSON.parse(fs.readFileSync(saveFile(id), 'utf8')); } catch (e) { return null; } },
    async writeSave(id, rec) { writeAtomic(saveFile(id), JSON.stringify(rec)); },
    async deleteSave(id) { try { fs.unlinkSync(saveFile(id)); } catch (e) { /* no save */ } },
    async flush() { if (timer) { clearTimeout(timer); timer = null; writeAtomic(DB_FILE, JSON.stringify(db)); } },
    // everything, for copying the files into a new database
    exportAll() {
      const saves = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
      return { db: clone(db), saves };
    },
    async close() { await this.flush(); },
  };
}

function openData({ databaseUrl, dataDir }) {
  return databaseUrl ? pgData(databaseUrl) : fileData(dataDir);
}

module.exports = { openData };
