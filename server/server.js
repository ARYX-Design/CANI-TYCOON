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
//
// Sign-in codes (players must sign in with a phone number or email before they can get a coupon):
//   RESEND_API_KEY, MAIL_FROM                               email codes via resend.com
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM       SMS codes via twilio.com
//   AUTH_DEV=1                                              testing only: no sending, the code is shown in the game

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
const AUTH_DEV = process.env.AUTH_DEV === '1';
const MAIL = process.env.RESEND_API_KEY && process.env.MAIL_FROM ? { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM } : null;
const SMS = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM
  ? { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, from: process.env.TWILIO_FROM } : null;

if (!/^\d{4,}$/.test(STAFF_PIN)) {
  console.error('Set STAFF_PIN to a number with at least 4 digits, e.g. STAFF_PIN=4821 node server/server.js');
  process.exit(1);
}

const REWARDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'rewards.json'), 'utf8'));
// one-time coin bonuses for following on Instagram (Instagram can't tell us who follows, so this is on trust)
const SOCIAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'social.json'), 'utf8'));

// ---------- tiny JSON database ----------

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { players: {}, coupons: {}, log: [], contacts: {} };
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
// a player can be signed in on several devices: one token per device
for (const p of Object.values(db.players)) { if (!p.tokenHashes) p.tokenHashes = p.tokenHash ? [p.tokenHash] : []; delete p.tokenHash; }
const byToken = new Map();
for (const p of Object.values(db.players)) for (const h of p.tokenHashes) byToken.set(h, p);
const pendingCodes = new Map();   // contact -> { hash, expires, tries }
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
  const owner = db.players[c.playerId];
  return { code: c.code, rewardId: c.rewardId, name: r.name, icon: r.icon, desc: r.desc, cost: c.cost, createdAt: c.createdAt, expiresAt: c.expiresAt, usedAt: c.usedAt || null, status, player: c.playerId.slice(0, 6), contact: owner && owner.contact ? mask(owner.contact) : '' };
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

function readJson(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let size = 0, data = '';
    req.on('data', ch => { size += ch.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else data += ch; });
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

// ---------- phone / email sign-in ----------

function normalizeContact(raw) {
  const v = String(raw || '').trim();
  if (v.includes('@')) {
    const e = v.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120) throw { code: 400, error: 'That email address looks wrong' };
    return { type: 'email', value: e };
  }
  let d = v.replace(/[\s().-]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (!/^\+\d{8,15}$/.test(d)) throw { code: 400, error: 'Enter the phone number with the country code, e.g. +386 40 123 456' };
  return { type: 'phone', value: d };
}

function mask(contact) {
  if (contact.includes('@')) {
    const [u, dom] = contact.split('@');
    return `${u[0]}${'•'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${dom}`;
  }
  return contact.slice(0, 4) + ' ••• ' + contact.slice(-3);
}

async function sendCode(c, code) {
  const text = `Your CANI Barber sign-in code is ${code}. It expires in 10 minutes.`;
  if (c.type === 'email' && MAIL) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MAIL.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL.from, to: [c.value], subject: `CANI sign-in code: ${code}`, text }),
    });
    if (!r.ok) throw new Error('email ' + r.status + ' ' + await r.text());
    return true;
  }
  if (c.type === 'phone' && SMS) {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SMS.sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${SMS.sid}:${SMS.token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: c.value, From: SMS.from, Body: text }),
    });
    if (!r.ok) throw new Error('sms ' + r.status + ' ' + await r.text());
    return true;
  }
  if (AUTH_DEV) { console.log(`[dev] sign-in code for ${c.value}: ${code}`); return true; }
  return false;
}

function issueToken(p) {
  const token = crypto.randomBytes(24).toString('hex');
  const h = sha(token);
  p.tokenHashes.push(h);
  if (p.tokenHashes.length > 10) byToken.delete(p.tokenHashes.shift());   // keep the 10 newest devices
  byToken.set(h, p);
  return token;
}

function playerState(p) {
  const earnedToday = p.earnDay === today() ? p.earnedToday : 0;
  const coupons = Object.values(db.coupons).filter(c => c.playerId === p.id).sort((a, b) => b.createdAt - a.createdAt).map(couponView);
  return { id: p.id, balance: p.balance, earnedToday, cap: DAILY_CAP, coupons, signedIn: !!p.contact, contact: p.contact ? mask(p.contact) : '', bonuses: Object.keys(p.bonuses || {}) };
}

// ---------- game saves (one file per player, so the database stays small) ----------

const SAVE_DIR = path.join(DATA_DIR, 'saves');
const MAX_SAVE = 400000;
fs.mkdirSync(SAVE_DIR, { recursive: true });
const saveFile = id => path.join(SAVE_DIR, id.replace(/[^\w-]/g, '') + '.json');

function readSave(p) {
  try { return JSON.parse(fs.readFileSync(saveFile(p.id), 'utf8')); } catch (e) { return null; }
}
function writeSave(p, save) {
  const f = saveFile(p.id), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(save));
  fs.renameSync(tmp, f);
}

// ---------- API ----------

const api = {
  'GET /api/health': () => ({ ok: true, rewards: REWARDS.length }),
  'GET /api/rewards': () => ({ rewards: REWARDS, social: SOCIAL, cap: DAILY_CAP, signIn: { email: !!MAIL || AUTH_DEV, phone: !!SMS || AUTH_DEV } }),

  'POST /api/players': (req) => {
    if (limited('reg:' + ip(req), 5, 3600e3)) throw { code: 429, error: 'Too many new players from this network. Try again later.' };
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    db.players[id] = { id, tokenHashes: [sha(token)], balance: 0, earnedToday: 0, earnDay: today(), createdAt: Date.now(), lastEarnAt: 0 };
    byToken.set(sha(token), db.players[id]);
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

  // Step 1: send a 6-digit code to a phone number or email
  'POST /api/auth/start': async (req, p, body) => {
    const c = normalizeContact(body.contact);
    if (limited('code:' + c.value, 3, 900e3)) throw { code: 429, error: 'Too many codes for this contact. Wait 15 minutes.' };
    if (limited('codeip:' + ip(req), 10, 3600e3)) throw { code: 429, error: 'Too many codes from this network. Try again later.' };
    if (c.type === 'email' && !MAIL && !AUTH_DEV) throw { code: 503, error: 'Email sign-in is not set up on this server yet' };
    if (c.type === 'phone' && !SMS && !AUTH_DEV) throw { code: 503, error: 'SMS sign-in is not set up on this server yet' };
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    pendingCodes.set(c.value, { hash: sha(c.value + ':' + code), expires: Date.now() + 600e3, tries: 0 });
    try { await sendCode(c, code); }
    catch (e) { console.error('sending code failed:', e.message); throw { code: 502, error: 'Could not send the code. Check the number or email and try again.' }; }
    return { sent: true, type: c.type, to: mask(c.value), ...(AUTH_DEV ? { devCode: code } : {}) };
  },

  // Step 2: check the code. This device joins the account (a new contact turns this player into the account).
  'POST /api/auth/verify': (req, p, body) => {
    const c = normalizeContact(body.contact);
    const pend = pendingCodes.get(c.value);
    if (!pend || pend.expires < Date.now()) throw { code: 400, error: 'The code expired. Ask for a new one.' };
    if (++pend.tries > 5) { pendingCodes.delete(c.value); throw { code: 429, error: 'Too many wrong codes. Ask for a new one.' }; }
    if (sha(c.value + ':' + String(body.code || '').trim()) !== pend.hash) throw { code: 400, error: 'Wrong code' };
    pendingCodes.delete(c.value);
    let account = db.contacts[c.value] && db.players[db.contacts[c.value]];
    let merged = 0;
    if (!account) {
      if (p.contact) throw { code: 409, error: 'This device is signed in to another account. Sign out first.' };
      account = p;                     // this device's progress becomes the account
      account.contact = c.value;
      db.contacts[c.value] = account.id;
    } else if (account !== p && !p.contact) {
      // coins earned on this device before signing in are added, within the account's daily cap
      if (account.earnDay !== today()) { account.earnDay = today(); account.earnedToday = 0; }
      account.bonuses = { ...(p.bonuses || {}), ...(account.bonuses || {}) };
      merged = Math.max(0, Math.min(p.balance, DAILY_CAP - account.earnedToday));
      account.balance += merged;
      account.earnedToday += merged;
      p.balance = 0;
    }
    const token = issueToken(account);
    save();
    return { token, merged, ...playerState(account) };
  },

  // Sign this device out: its token stops working; the game starts a new guest player
  'POST /api/auth/logout': (req, p) => {
    const m = /^Bearer (\w{20,})$/.exec(req.headers.authorization || '');
    const h = sha(m[1]);
    p.tokenHashes = p.tokenHashes.filter(x => x !== h);
    byToken.delete(h);
    save();
    return { ok: true };
  },

  // Each signed-in player's shop is kept on the server, so the same account continues on any device
  'GET /api/save': (req, p) => {
    if (!p.contact) return { save: null };
    const s = readSave(p);
    return { save: s ? s.save : null, savedAt: s ? s.savedAt : 0 };
  },
  'POST /api/save': (req, p, body) => {
    if (!p.contact) throw { code: 403, error: 'Sign in to save your shop online' };
    if (limited('save:' + p.id, 12, 60e3)) throw { code: 429, error: 'Saving too often' };
    const save = body.save;
    if (!save || typeof save !== 'object' || save.version !== 1 || !Array.isArray(save.items)) throw { code: 400, error: 'Not a game save' };
    const savedAt = Math.min(Date.now(), Math.floor(+body.savedAt) || Date.now());
    const old = readSave(p);
    if (old && old.savedAt > savedAt) return { ok: false, stale: true, savedAt: old.savedAt };   // a newer save from another device wins
    writeSave(p, { savedAt, save });
    return { ok: true, savedAt };
  },

  // "New game": forget the online save too
  'POST /api/save/delete': (req, p) => {
    try { fs.unlinkSync(saveFile(p.id)); } catch (e) { /* no save */ }
    return { ok: true };
  },

  // "I followed on Instagram": once per player/account, on top of the daily cap
  'POST /api/bonus': (req, p, body) => {
    const s = SOCIAL.find(x => x.id === body.id);
    if (!s) throw { code: 404, error: 'Unknown bonus' };
    p.bonuses = p.bonuses || {};
    if (p.bonuses[s.id]) throw { code: 409, error: 'You already got this bonus' };
    p.bonuses[s.id] = Date.now();
    p.balance += s.coins;
    save();
    return { added: s.coins, ...playerState(p) };
  },

  'POST /api/redeem': (req, p, body) => {
    if (!p.contact) throw { code: 403, error: 'Sign in with your phone number or email to get real coupons' };
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

const PLAYER_ROUTES = new Set(['GET /api/save', 'POST /api/save', 'POST /api/save/delete', 'GET /api/me', 'POST /api/earn', 'POST /api/redeem', 'POST /api/bonus', 'POST /api/auth/start', 'POST /api/auth/verify', 'POST /api/auth/logout']);
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
    const body = req.method === 'POST' ? await readJson(req, route === 'POST /api/save' ? MAX_SAVE : 10000) : {};
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

server.listen(PORT, () => {
  console.log(`CANI server on http://localhost:${PORT}  (staff page: /staff.html, daily coin cap ${DAILY_CAP})`);
  console.log(`Sign-in: email ${MAIL ? 'via Resend' : AUTH_DEV ? 'dev mode' : 'OFF'}, SMS ${SMS ? 'via Twilio' : AUTH_DEV ? 'dev mode' : 'OFF'}`);
});
