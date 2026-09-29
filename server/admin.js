// Admin menu for the shop owner (run from GitHub Actions → "Admin menu", or locally with DATABASE_URL set).
//
//   ACTION=players DATABASE_URL=… node server/admin.js
//
// ACTION: overview | players | player | give-money | set-money | give-coins | rename | reset-password
//         | remove-from-leaderboard | delete-account | table | sql
// USERNAME: the account (for player actions)   AMOUNT: a number   VALUE: text (new name, password, SQL…)
// TABLE: players | accounts | scores | coupons | saves | log (for ACTION=table)
// Results are printed and, on GitHub, written as tables to the run's summary page.

const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');

const env = process.env;
const ACTION = (env.ACTION || 'overview').trim();
const USERNAME = (env.USERNAME || '').trim();
const AMOUNT = (env.AMOUNT || '').trim();
const VALUE = env.VALUE || '';
const TABLE = (env.TABLE || 'players').trim();

if (!env.DATABASE_URL) { console.error('DATABASE_URL is missing'); process.exit(1); }
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
const q = (text, params) => pool.query(text, params);

// ---------- output: plain text in the log, markdown tables on the GitHub summary page ----------

const out = [];
const cell = v => String(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 300);
function title(t) { out.push(`\n### ${t}\n`); console.log(`\n== ${t}`); }
function say(t) { out.push(t + '\n'); console.log(t); }
function table(rows, cols) {
  if (!rows.length) return say('_(nothing)_');
  cols = cols || Object.keys(rows[0]);
  out.push('| ' + cols.join(' | ') + ' |', '|' + cols.map(() => ' --- ').join('|') + '|', ...rows.map(r => '| ' + cols.map(c => cell(r[c])).join(' | ') + ' |'), '');
  console.table(rows.map(r => Object.fromEntries(cols.map(c => [c, cell(r[c])]))));
}
function fail(msg) { const e = new Error(msg); e.userError = true; throw e; }
const num = () => { if (!/^-?\d{1,12}$/.test(AMOUNT)) fail('AMOUNT must be a whole number'); return +AMOUNT; };
const money = n => '$' + Math.round(+n || 0).toLocaleString('en-US');
const when = ms => (ms ? new Date(+ms).toISOString().replace('T', ' ').slice(0, 16) : '');
const STAGES = ['Garage', 'Corner Shop', 'Downtown Barbershop', 'Cani Studio', 'Cani Empire HQ', 'Ljubljana Flagship', 'Vienna Grand Salon', 'CANI Tower Dubai'];

// ---------- lookups ----------

async function findAccount(name) {
  if (!name) fail('USERNAME is empty');
  const { rows } = await q(`SELECT id, data FROM cani_records WHERE kind = 'contacts' AND lower(id) IN (lower('user:' || $1), lower($1)) LIMIT 1`, [name]);
  if (!rows[0]) fail(`No account called "${name}". Run the "players" action to see all accounts.`);
  const pid = typeof rows[0].data === 'string' ? rows[0].data : rows[0].data.playerId;
  const p = await q(`SELECT data FROM cani_records WHERE kind = 'players' AND id = $1`, [pid]);
  if (!p.rows[0]) fail(`The account "${name}" points to a missing player`);
  return { contact: p.rows[0].data.contact || rows[0].id, pid, player: p.rows[0].data };
}
async function readSave(pid) {
  const { rows } = await q('SELECT saved_at, data FROM cani_saves WHERE player_id = $1', [pid]);
  return rows[0] ? { savedAt: +rows[0].saved_at, save: rows[0].data } : null;
}
// write a changed shop a minute "in the future", so it wins over the copy on the player's phone
async function writeSave(pid, save) {
  const savedAt = Math.max(Date.now() + 60000, (save.savedAt || 0) + 1);
  save.savedAt = savedAt;
  await q(`UPDATE cani_saves SET data = $2::jsonb, saved_at = $3, updated_at = now() WHERE player_id = $1`, [pid, JSON.stringify(save), savedAt]);
}
async function updatePlayer(pid, fn) {
  const { rows } = await q(`SELECT data FROM cani_records WHERE kind = 'players' AND id = $1`, [pid]);
  const p = rows[0].data;
  fn(p);
  await q(`UPDATE cani_records SET data = $2::jsonb, updated_at = now() WHERE kind = 'players' AND id = $1`, [pid, JSON.stringify(p)]);
  return p;
}
const label = contact => (contact.startsWith('user:') ? contact.slice(5) : contact);

async function accountsRows() {
  const { rows } = await q(`
    SELECT c.id AS contact, p.data AS player, s.data AS save, s.saved_at, sc.data AS score
    FROM cani_records c
    JOIN cani_records p ON p.kind = 'players' AND p.id = COALESCE(c.data->>'playerId', c.data #>> '{}')
    LEFT JOIN cani_saves s ON s.player_id = p.id
    LEFT JOIN cani_records sc ON sc.kind = 'scores' AND sc.id = p.id
    WHERE c.kind = 'contacts'
    ORDER BY COALESCE((s.data->'stats'->>'earned')::numeric, 0) DESC`);
  return rows.map(r => ({
    account: label(r.player.contact || r.contact), 'board name': r.score ? r.score.name : '', coins: r.player.balance,
    money: r.save ? money(r.save.money) : '(no online save)', day: r.save ? r.save.day : '',
    location: r.save ? STAGES[r.save.stage] || r.save.stage : '', earned: r.save && r.save.stats ? money(r.save.stats.earned) : '',
    'last saved': when(r.saved_at), 'player id': r.player.id.slice(0, 8),
  }));
}

// ---------- actions ----------

const actions = {
  async overview() {
    title('Totals');
    const { rows } = await q(`SELECT kind, count(*)::int AS n FROM cani_records GROUP BY kind ORDER BY kind`);
    const saves = await q('SELECT count(*)::int AS n FROM cani_saves');
    table([...rows.map(r => ({ table: r.kind, rows: r.n })), { table: 'saves', rows: saves.rows[0].n }]);
    title('Leaderboard (top 20 by money earned)');
    const top = await q(`SELECT data FROM cani_records WHERE kind = 'scores' ORDER BY (data->>'earned')::numeric DESC LIMIT 20`);
    table(top.rows.map((r, i) => ({ '#': i + 1, name: r.data.name, earned: money(r.data.earned), served: r.data.served, day: r.data.day, location: STAGES[r.data.stage] || '', updated: when(r.data.updatedAt) })));
    await actions.players();
  },
  async players() {
    title('Accounts');
    table(await accountsRows());
    const guests = await q(`SELECT count(*)::int AS n FROM cani_records p WHERE p.kind = 'players' AND NOT (p.data ? 'contact')`);
    say(`Players without an account (saved on their own phone only): ${guests.rows[0].n}`);
  },
  async player() {
    const a = await findAccount(USERNAME);
    const s = await readSave(a.pid);
    title(`Account ${label(a.contact)}`);
    table([{ 'player id': a.pid, coins: a.player.balance, 'coins today': a.player.earnedToday, created: when(a.player.createdAt), devices: (a.player.tokenHashes || []).length }]);
    if (s) {
      const g = s.save;
      title('Shop');
      table([{ money: money(g.money), day: g.day, location: STAGES[g.stage] || g.stage, reputation: g.rep && (+g.rep).toFixed(2), barbers: (g.barbers || []).length,
        furniture: (g.items || []).length, served: g.stats && g.stats.served, earned: g.stats && money(g.stats.earned), 'unpaid bills': (g.bills || []).length, saved: when(s.savedAt) }]);
      title('Upgrades');
      table(Object.entries(g.upgrades || {}).filter(([, v]) => v).map(([k, v]) => ({ upgrade: k, level: v })));
    } else say('No shop saved online yet.');
    title('Coupons');
    const c = await q(`SELECT data FROM cani_records WHERE kind = 'coupons' AND data->>'playerId' = $1 ORDER BY (data->>'createdAt')::numeric DESC`, [a.pid]);
    table(c.rows.map(r => ({ code: r.data.code, reward: r.data.rewardId, created: when(r.data.createdAt), used: when(r.data.usedAt), expires: when(r.data.expiresAt) })));
  },
  async 'give-money'() { await changeMoney(m => m + num()); },
  async 'set-money'() { await changeMoney(() => num()); },
  async 'give-coins'() {
    const a = await findAccount(USERNAME);
    const n = num();
    const p = await updatePlayer(a.pid, p => { p.balance = Math.max(0, (p.balance || 0) + n); });
    title('Done'); say(`${label(a.contact)} now has ⭐ ${p.balance} Cani Coins (they see it after reloading the game).`);
  },
  async rename() {
    const a = await findAccount(USERNAME);
    const name = VALUE.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!name) fail('VALUE (the new name) is empty');
    const r = await q(`UPDATE cani_records SET data = jsonb_set(data, '{name}', to_jsonb($2::text)), updated_at = now() WHERE kind = 'scores' AND id = $1`, [a.pid, name]);
    title('Done'); say(r.rowCount ? `${label(a.contact)} is now "${name}" on the leaderboard.` : `${label(a.contact)} is not on the leaderboard yet.`);
  },
  async 'reset-password'() {
    const a = await findAccount(USERNAME);
    if (!a.contact.startsWith('user:')) fail('This account signs in with a phone or email code, not a password');
    if (VALUE.length < 6) fail('VALUE (the new password) needs at least 6 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    await updatePlayer(a.pid, p => { p.pass = { salt, hash: crypto.scryptSync(VALUE, salt, 32).toString('hex') }; });
    title('Done'); say(`New password set for ${label(a.contact)}. Tell them privately – it is not shown anywhere else.`);
  },
  async 'remove-from-leaderboard'() {
    const a = await findAccount(USERNAME);
    const r = await q(`DELETE FROM cani_records WHERE kind = 'scores' AND id = $1`, [a.pid]);
    title('Done'); say(r.rowCount ? `${label(a.contact)} was removed from the leaderboard (they come back when they play again).` : 'They were not on the leaderboard.');
  },
  async 'delete-account'() {
    const a = await findAccount(USERNAME);
    if (VALUE.trim().toLowerCase() !== 'delete') fail('To delete an account, type DELETE in the VALUE box');
    await q(`DELETE FROM cani_records WHERE (kind IN ('players', 'scores') AND id = $1) OR (kind = 'contacts' AND id = $2)`, [a.pid, a.contact]);
    await q('DELETE FROM cani_saves WHERE player_id = $1', [a.pid]);
    title('Done'); say(`The account ${label(a.contact)}, its shop and its leaderboard entry were deleted. Its coupons stay valid at the counter.`);
  },
  async table() {
    const limit = 200;
    const views = {
      players: [`SELECT id, data FROM cani_records WHERE kind = 'players' ORDER BY (data->>'createdAt')::numeric DESC LIMIT ${limit}`,
        r => ({ id: r.id.slice(0, 8), account: r.data.contact ? label(r.data.contact) : '', coins: r.data.balance, 'coins today': r.data.earnedToday, created: when(r.data.createdAt), devices: (r.data.tokenHashes || []).length })],
      accounts: [`SELECT id, data FROM cani_records WHERE kind = 'contacts' ORDER BY id LIMIT ${limit}`,
        r => ({ account: label(r.id), 'player id': String(typeof r.data === 'string' ? r.data : r.data.playerId).slice(0, 8) })],
      scores: [`SELECT id, data FROM cani_records WHERE kind = 'scores' ORDER BY (data->>'earned')::numeric DESC LIMIT ${limit}`,
        r => ({ name: r.data.name, earned: money(r.data.earned), served: r.data.served, day: r.data.day, location: STAGES[r.data.stage] || '', updated: when(r.data.updatedAt), 'player id': r.id.slice(0, 8) })],
      coupons: [`SELECT id, data FROM cani_records WHERE kind = 'coupons' ORDER BY (data->>'createdAt')::numeric DESC LIMIT ${limit}`,
        r => ({ code: r.id, reward: r.data.rewardId, cost: r.data.cost, created: when(r.data.createdAt), used: when(r.data.usedAt), expires: when(r.data.expiresAt), 'player id': String(r.data.playerId).slice(0, 8) })],
      saves: [`SELECT player_id, saved_at, data FROM cani_saves ORDER BY saved_at DESC LIMIT ${limit}`,
        r => ({ 'player id': r.player_id.slice(0, 8), money: money(r.data.money), day: r.data.day, location: STAGES[r.data.stage] || '', saved: when(r.saved_at) })],
      log: [`SELECT id, data FROM cani_records WHERE kind = 'log' ORDER BY id DESC LIMIT ${limit}`,
        r => ({ at: when(r.data.at), event: r.data.type, code: r.data.code })],
    };
    const v = views[TABLE];
    if (!v) fail(`TABLE must be one of: ${Object.keys(views).join(', ')}`);
    title(`Table: ${TABLE} (newest ${limit})`);
    table((await q(v[0])).rows.map(v[1]));
  },
  // any SELECT, in a read-only transaction (it cannot change anything)
  async sql() {
    if (!VALUE.trim()) fail('Put a SQL query in VALUE, e.g. SELECT kind, count(*) FROM cani_records GROUP BY kind');
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '20s'");
      const r = await client.query(VALUE);
      await client.query('ROLLBACK');
      title('Query result');
      // never show login secrets
      const clean = v => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v, (k, x) => (k === 'tokenHashes' || k === 'pass' || k === 'hash' ? '(hidden)' : x))) : v);
      table((r.rows || []).slice(0, 500).map(row => Object.fromEntries(Object.entries(row).map(([k, x]) => [k, clean(x)]))));
    } finally { client.release(); }
  },
};

async function changeMoney(fn) {
  const a = await findAccount(USERNAME);
  const s = await readSave(a.pid);
  if (!s) fail(`${label(a.contact)} has no shop saved online yet. They should open the game once while logged in.`);
  const before = +s.save.money || 0;
  s.save.money = Math.max(0, Math.round(fn(before)));
  await writeSave(a.pid, s.save);
  title('Done');
  say(`${label(a.contact)}: ${money(before)} → **${money(s.save.money)}**. They see it after reloading the game (an open game reloads by itself within about 20 seconds).`);
}

(async () => {
  const fn = actions[ACTION];
  if (!fn) fail(`Unknown ACTION "${ACTION}". Choose one of: ${Object.keys(actions).join(', ')}`);
  await fn();
})().catch(e => {
  title(e.userError ? 'Could not do that' : 'Error');
  say(e.userError ? e.message : String(e.stack || e));
  process.exitCode = 1;
}).finally(async () => {
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `## 💈 CANI admin: ${ACTION}\n` + out.join('\n') + '\n');
  await pool.end();
});
