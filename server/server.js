// CANI Barber Tycoon server: serves the game and runs the real-world rewards (coins -> coupons).
// No dependencies. Node 18+.
//
//   STAFF_PIN=4821 node server/server.js
//
// Environment:
//   PORT            port to listen on (default 8080)
//   STAFF_PIN       PIN for the staff page (required, at least 4 digits)
//   DAILY_COIN_CAP  most coins one player can earn per day (default 40)
//   DATA_DIR        where the database file is kept (default server/data)
//   ALLOWED_ORIGIN  extra origin allowed to call the API (optional, e.g. https://cani.example.com)
//   TZ              time zone used for "per day" limits, e.g. Europe/Ljubljana

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.PORT || 8080;
const STAFF_PIN = String(process.env.STAFF_PIN || '');
const DAILY_CAP = +process.env.DAILY_COIN_CAP || 40;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const MAX_EARN_PER_CALL = 25;
const MIN_EARN_INTERVAL_MS = 4000;

if (!/^\d{4,}$/.test(STAFF_PIN)) {
  console.error('Set STAFF_PIN to a number with at least 4 digits, e.g. STAFF_PIN=4821 node server/server.js');
  process.exit(1);
}

const REWARDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'rewards.json'), 'utf8'));

// ---------- tiny JSON database ----------

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { players: {}, coupons: {}, log: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { /* first run */ }

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
}

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const byToken = new Map(Object.values(db.players).map(p => [p.tokenHash, p]));
const today = () => new Date().toLocaleDateString('sv-SE');     // YYYY-MM-DD in the server's time zone
const DAY = 24 * 3600 * 1000;

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
  let code;
  do {
    const b = crypto.randomBytes(8);
    const s = Array.from(b, x => A[x % A.length]).join('');
    code = `CANI-${s.slice(0, 4)}-${s.slice(4)}`;
  } while (db.coupons[code]);
  return code;
}

function couponView(c) {
  const r = REWARDS.find(x => x.id === c.rewardId) || { name: c.rewardId, icon: '🎟️' };
  const status = c.usedAt ? 'used' : Date.now() > c.expiresAt ? 'expired' : 'active';
  return { code: c.code, rewardId: c.rewardId, name: r.name, icon: r.icon, desc: r.desc, cost: c.cost, createdAt: c.createdAt, expiresAt: c.expiresAt, usedAt: c.usedAt || null, status, player: c.playerId.slice(0, 6) };
}

// ---------- rate limiting ----------

const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

const staffSessions = new Map();   // token -> expiry

// ---------- HTTP helpers ----------

function send(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0, data = '';
    req.on('data', ch => { size += ch.length; if (size > 10000) { reject(new Error('too_large')); req.destroy(); } else data += ch; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}

function ip(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; }

function playerFrom(req) {
  const m = /^Bearer (\w{20,})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  return byToken.get(sha(m[1])) || null;
}

function staffOk(req) {
  const t = req.headers['x-staff-token'];
  const exp = t && staffSessions.get(t);
  return exp && exp > Date.now();
}

function playerState(p) {
  const earnedToday = p.earnDay === today() ? p.earnedToday : 0;
  const coupons = Object.values(db.coupons).filter(c => c.playerId === p.id).sort((a, b) => b.createdAt - a.createdAt).map(couponView);
  return { id: p.id, balance: p.balance, earnedToday, cap: DAILY_CAP, coupons };
}

// ---------- API ----------

const api = {
  'GET /api/health': () => ({ ok: true, rewards: REWARDS.length }),
  'GET /api/rewards': () => ({ rewards: REWARDS, cap: DAILY_CAP }),

  'POST /api/players': (req) => {
    if (limited('reg:' + ip(req), 5, 3600e3)) throw { code: 429, error: 'Too many new players from this network. Try again later.' };
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    db.players[id] = { id, tokenHash: sha(token), balance: 0, earnedToday: 0, earnDay: today(), createdAt: Date.now(), lastEarnAt: 0 };
    byToken.set(db.players[id].tokenHash, db.players[id]);
    save();
    return { id, token, ...playerState(db.players[id]) };
  },

  'GET /api/me': (req, p) => playerState(p),

  // The game reports coins as they are earned. The server keeps the real balance and caps it per day.
  'POST /api/earn': (req, p, body) => {
    const amount = Math.floor(+body.amount);
    if (!(amount > 0)) throw { code: 400, error: 'amount must be a positive number' };
    const now = Date.now();
    if (now - p.lastEarnAt < MIN_EARN_INTERVAL_MS) throw { code: 429, error: 'Slow down' };
    if (p.earnDay !== today()) { p.earnDay = today(); p.earnedToday = 0; }
    const accepted = Math.max(0, Math.min(amount, MAX_EARN_PER_CALL, DAILY_CAP - p.earnedToday));
    p.balance += accepted;
    p.earnedToday += accepted;
    p.lastEarnAt = now;
    save();
    return { accepted, ...playerState(p) };
  },

  'POST /api/redeem': (req, p, body) => {
    const r = REWARDS.find(x => x.id === body.rewardId);
    if (!r) throw { code: 404, error: 'Unknown reward' };
    if (p.balance < r.cost) throw { code: 400, error: `You need ${r.cost} coins for ${r.name}` };
    const recent = Object.values(db.coupons).filter(c => c.playerId === p.id && c.rewardId === r.id && Date.now() - c.createdAt < 30 * DAY).length;
    if (recent >= (r.limitPer30Days || 1)) throw { code: 400, error: `You can get ${r.name} ${r.limitPer30Days || 1}× per 30 days` };
    p.balance -= r.cost;
    const code = newCode();
    db.coupons[code] = { code, playerId: p.id, rewardId: r.id, cost: r.cost, createdAt: Date.now(), expiresAt: Date.now() + (r.validDays || 30) * DAY };
    db.log.push({ at: Date.now(), type: 'issued', code });
    save();
    return { coupon: couponView(db.coupons[code]), ...playerState(p) };
  },

  'POST /api/staff/login': (req, _p, body) => {
    if (limited('pin:' + ip(req), 5, 600e3)) throw { code: 429, error: 'Too many attempts. Wait 10 minutes.' };
    const ok = crypto.timingSafeEqual(Buffer.from(sha(String(body.pin || ''))), Buffer.from(sha(STAFF_PIN)));
    if (!ok) throw { code: 401, error: 'Wrong PIN' };
    const token = crypto.randomBytes(24).toString('hex');
    staffSessions.set(token, Date.now() + 12 * 3600e3);
    return { token };
  },

  'POST /api/staff/lookup': (req, _p, body) => {
    const c = db.coupons[String(body.code || '').toUpperCase().trim()];
    if (!c) throw { code: 404, error: 'No coupon with this code' };
    return { coupon: couponView(c) };
  },

  'POST /api/staff/use': (req, _p, body) => {
    const c = db.coupons[String(body.code || '').toUpperCase().trim()];
    if (!c) throw { code: 404, error: 'No coupon with this code' };
    const v = couponView(c);
    if (v.status === 'used') throw { code: 409, error: `Already used on ${new Date(c.usedAt).toLocaleString()}` };
    if (v.status === 'expired') throw { code: 409, error: 'This coupon has expired' };
    c.usedAt = Date.now();
    db.log.push({ at: Date.now(), type: 'used', code: c.code });
    save();
    return { coupon: couponView(c) };
  },

  'GET /api/staff/recent': () => {
    const t = today();
    const coupons = Object.values(db.coupons);
    const usedToday = coupons.filter(c => c.usedAt && new Date(c.usedAt).toLocaleDateString('sv-SE') === t);
    const recent = coupons.filter(c => c.usedAt).sort((a, b) => b.usedAt - a.usedAt).slice(0, 15).map(couponView);
    return { usedToday: usedToday.length, issued: coupons.length, players: Object.keys(db.players).length, recent };
  },
};

const PLAYER_ROUTES = new Set(['GET /api/me', 'POST /api/earn', 'POST /api/redeem']);
const STAFF_ROUTES = new Set(['POST /api/staff/lookup', 'POST /api/staff/use', 'GET /api/staff/recent']);

async function handleApi(req, res, route) {
  const fn = api[route];
  if (!fn) return send(res, 404, { error: 'Not found' });
  try {
    let p = null;
    if (PLAYER_ROUTES.has(route)) {
      p = playerFrom(req);
      if (!p) return send(res, 401, { error: 'Unknown player' });
      if (limited('p:' + p.id, 60, 60e3)) return send(res, 429, { error: 'Slow down' });
    }
    if (STAFF_ROUTES.has(route) && !staffOk(req)) return send(res, 401, { error: 'Staff login required' });
    const body = req.method === 'POST' ? await readJson(req) : {};
    send(res, 200, await fn(req, p, body));
  } catch (e) {
    if (e && e.code && e.error) send(res, e.code, { error: e.error });
    else if (e && (e.message === 'bad_json' || e.message === 'too_large')) send(res, 400, { error: 'Bad request' });
    else { console.error(e); send(res, 500, { error: 'Server error' }); }
  }
}

// ---------- static files ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(ROOT, '.' + rel);
  const blocked = !file.startsWith(ROOT + path.sep) || rel.split('/').some(seg => seg.startsWith('.')) || file.startsWith(path.join(ROOT, 'server') + path.sep);
  if (blocked) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (ALLOWED_ORIGIN && req.headers.origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Staff-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, `${req.method} ${url.pathname}`);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => console.log(`CANI server on http://localhost:${PORT}  (staff page: /staff.html, daily coin cap ${DAILY_CAP})`));
