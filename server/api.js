// The CANI rewards API as one web-standard handler: (Request) => Promise<Response>.
// It keeps nothing in memory between requests – every request reads and writes the data store (server/data.js)
// – so it runs the same as a Neon Function (several copies at once, stopped when idle) and inside server.js.
//
// Settings (environment):
//   STAFF_PIN        PIN for the coupon desk (4+ digits). Without it the staff desk is switched off.
//   DAILY_COIN_CAP   most coins one player can earn per day (default 40)
//   ALLOWED_ORIGIN   comma-separated sites that may call the API from a browser, e.g. https://aryx-design.github.io
//   TZ               time zone for "per day" limits, e.g. Europe/Ljubljana
//   RESEND_API_KEY + MAIL_FROM                          email sign-in codes (resend.com)
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM  SMS sign-in codes (twilio.com)
//   AUTH_DEV=1       testing only: codes are not sent, the game shows them

const crypto = require('crypto');
const REWARDS = require('./rewards.json');
// one-time coin bonuses for following on Instagram (Instagram can't tell us who follows, so this is on trust)
const SOCIAL = require('./social.json');

const MAX_EARN_PER_CALL = 25;
const MIN_EARN_INTERVAL_MS = 4000;
const MAX_SAVE = 400000;
const DAY = 24 * 3600 * 1000;

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const today = () => new Date().toLocaleDateString('sv-SE');     // YYYY-MM-DD in the server's time zone
const fail = (code, error) => { throw { code, error }; };

function createApi(data, env = process.env) {
  const STAFF_PIN = String(env.STAFF_PIN || '');
  const STAFF_ON = /^\d{4,}$/.test(STAFF_PIN);
  const STAFF_KEY = sha('cani-staff:' + STAFF_PIN + ':' + (env.STAFF_SECRET || ''));
  const DAILY_CAP = +env.DAILY_COIN_CAP || 40;
  const ORIGINS = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  const AUTH_DEV = env.AUTH_DEV === '1';
  const MAIL = env.RESEND_API_KEY && env.MAIL_FROM ? { key: env.RESEND_API_KEY, from: env.MAIL_FROM } : null;
  const SMS = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM
    ? { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM } : null;

  // ---------- helpers ----------

  const mask = contact => {
    if (contact.includes('@')) {
      const [u, dom] = contact.split('@');
      return `${u[0]}${'•'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${dom}`;
    }
    return contact.slice(0, 4) + ' ••• ' + contact.slice(-3);
  };

  function normalizeContact(raw) {
    const v = String(raw || '').trim();
    if (v.includes('@')) {
      const e = v.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120) fail(400, 'That email address looks wrong');
      return { type: 'email', value: e };
    }
    let d = v.replace(/[\s().-]/g, '');
    if (d.startsWith('00')) d = '+' + d.slice(2);
    if (!/^\+\d{8,15}$/.test(d)) fail(400, 'Enter the phone number with the country code, e.g. +386 40 123 456');
    return { type: 'phone', value: d };
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
      return;
    }
    if (c.type === 'phone' && SMS) {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SMS.sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${SMS.sid}:${SMS.token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: c.value, From: SMS.from, Body: text }),
      });
      if (!r.ok) throw new Error('sms ' + r.status + ' ' + await r.text());
      return;
    }
    if (AUTH_DEV) console.log(`[dev] sign-in code for ${c.value}: ${code}`);
  }

  async function couponView(c, owner) {
    const r = REWARDS.find(x => x.id === c.rewardId) || { name: c.rewardId, icon: '🎟️' };
    const status = c.usedAt ? 'used' : Date.now() > c.expiresAt ? 'expired' : 'active';
    if (owner === undefined) owner = await data.get('players', c.playerId);
    return { code: c.code, rewardId: c.rewardId, name: r.name, icon: r.icon, desc: r.desc, cost: c.cost, createdAt: c.createdAt, expiresAt: c.expiresAt,
      usedAt: c.usedAt || null, status, player: c.playerId.slice(0, 6), contact: owner && owner.contact ? mask(owner.contact) : '' };
  }

  async function playerState(p) {
    const earnedToday = p.earnDay === today() ? p.earnedToday : 0;
    const mine = (await data.couponsOf(p.id)).sort((a, b) => b.createdAt - a.createdAt);
    const coupons = await Promise.all(mine.map(c => couponView(c, p)));
    return { id: p.id, balance: p.balance, earnedToday, cap: DAILY_CAP, coupons, signedIn: !!p.contact, contact: p.contact ? mask(p.contact) : '', bonuses: Object.keys(p.bonuses || {}) };
  }

  async function newCouponCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
    for (;;) {
      const s = Array.from(crypto.randomBytes(8), x => A[x % A.length]).join('');
      const code = `CANI-${s.slice(0, 4)}-${s.slice(4)}`;
      if (!await data.get('coupons', code)) return code;
    }
  }

  function newToken(p) {
    const token = crypto.randomBytes(24).toString('hex');
    p.tokenHashes = [...(p.tokenHashes || []), sha(token)].slice(-10);   // keep the 10 newest devices
    return token;
  }

  // staff desk logins are signed with a key made from the PIN, so no session list is kept anywhere
  const staffToken = exp => `${exp}.${crypto.createHmac('sha256', STAFF_KEY).update(String(exp)).digest('hex')}`;
  function staffOk(req) {
    const t = req.headers.get('x-staff-token') || '';
    const [exp] = t.split('.');
    if (!STAFF_ON || !(+exp > Date.now())) return false;
    const want = staffToken(+exp);
    return t.length === want.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(want));
  }

  const limit = async (key, max, windowMs, msg) => { if (await data.hit(key, max, windowMs)) fail(429, msg || 'Slow down'); };

  // ---------- routes ----------

  const api = {
    'GET /api/health': async () => ({ ok: true, rewards: REWARDS.length, store: data.kind }),
    'GET /api/rewards': async () => ({ rewards: REWARDS, social: SOCIAL, cap: DAILY_CAP, signIn: { email: !!MAIL || AUTH_DEV, phone: !!SMS || AUTH_DEV } }),

    'POST /api/players': async (req, ctx) => {
      // per network (a shop's Wi-Fi has many players); when the host hides addresses, one overall ceiling
      if (ctx.ip) await limit('reg:' + ctx.ip, 20, 3600e3, 'Too many new players from this network. Try again later.');
      else await limit('reg:all', 500, 3600e3, 'Too many new players right now. Try again later.');
      const id = crypto.randomUUID();
      const p = { id, tokenHashes: [], balance: 0, earnedToday: 0, earnDay: today(), createdAt: Date.now(), lastEarnAt: 0 };
      const token = newToken(p);
      await data.put('players', id, p);
      return { id, token, ...await playerState(p) };
    },

    'GET /api/me': async (req, ctx) => playerState(ctx.player),

    // The game reports coins as they are earned. The server keeps the real balance and caps it per day.
    'POST /api/earn': async (req, ctx, body) => {
      const amount = Math.floor(+body.amount);
      if (!(amount > 0)) fail(400, 'amount must be a positive number');
      let accepted = 0;
      const p = await data.update('players', ctx.player.id, p => {
        const now = Date.now();
        if (now - (p.lastEarnAt || 0) < MIN_EARN_INTERVAL_MS) fail(429, 'Slow down');
        if (p.earnDay !== today()) { p.earnDay = today(); p.earnedToday = 0; }
        accepted = Math.max(0, Math.min(amount, MAX_EARN_PER_CALL, DAILY_CAP - p.earnedToday));
        p.balance += accepted;
        p.earnedToday += accepted;
        p.lastEarnAt = now;
      });
      return { accepted, ...await playerState(p) };
    },

    // Step 1: send a 6-digit code to a phone number or email
    'POST /api/auth/start': async (req, ctx, body) => {
      const c = normalizeContact(body.contact);
      await limit('code:' + c.value, 3, 900e3, 'Too many codes for this contact. Wait 15 minutes.');
      await limit('codeip:' + (ctx.ip || 'all'), ctx.ip ? 10 : 300, 3600e3, 'Too many codes from this network. Try again later.');
      if (c.type === 'email' && !MAIL && !AUTH_DEV) fail(503, 'Email sign-in is not set up on this server yet');
      if (c.type === 'phone' && !SMS && !AUTH_DEV) fail(503, 'SMS sign-in is not set up on this server yet');
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      await data.put('authcodes', c.value, { hash: sha(c.value + ':' + code), expires: Date.now() + 600e3, tries: 0 });
      try { await sendCode(c, code); }
      catch (e) { console.error('sending code failed:', e.message); fail(502, 'Could not send the code. Check the number or email and try again.'); }
      return { sent: true, type: c.type, to: mask(c.value), ...(AUTH_DEV ? { devCode: code } : {}) };
    },

    // Step 2: check the code. This device joins the account (a new contact turns this player into the account).
    'POST /api/auth/verify': async (req, ctx, body) => {
      const c = normalizeContact(body.contact);
      const pend = await data.update('authcodes', c.value, pc => { pc.tries = (pc.tries || 0) + 1; });
      if (!pend || pend.expires < Date.now()) fail(400, 'The code expired. Ask for a new one.');
      if (pend.tries > 5) { await data.del('authcodes', c.value); fail(429, 'Too many wrong codes. Ask for a new one.'); }
      if (sha(c.value + ':' + String(body.code || '').trim()) !== pend.hash) fail(400, 'Wrong code');
      await data.del('authcodes', c.value);

      const p = ctx.player;
      const link = await data.get('contacts', c.value);
      const accountId = typeof link === 'string' ? link : link && link.playerId;
      let merged = 0, token = '';
      if (!accountId || !await data.get('players', accountId)) {
        if (p.contact) fail(409, 'This device is signed in to another account. Sign out first.');
        // this device's progress becomes the account
        const account = await data.update('players', p.id, a => { a.contact = c.value; token = newToken(a); });
        await data.put('contacts', c.value, { playerId: p.id });
        return { token, merged, ...await playerState(account) };
      }
      let deviceBalance = 0, deviceBonuses = {};
      if (accountId !== p.id && !p.contact) {
        // coins earned on this device before signing in are added, within the account's daily cap
        await data.update('players', p.id, d => { deviceBalance = d.balance; deviceBonuses = d.bonuses || {}; d.balance = 0; });
      }
      const account = await data.update('players', accountId, a => {
        if (deviceBalance || Object.keys(deviceBonuses).length) {
          if (a.earnDay !== today()) { a.earnDay = today(); a.earnedToday = 0; }
          a.bonuses = { ...deviceBonuses, ...(a.bonuses || {}) };
          merged = Math.max(0, Math.min(deviceBalance, DAILY_CAP - a.earnedToday));
          a.balance += merged;
          a.earnedToday += merged;
        }
        token = newToken(a);
      });
      return { token, merged, ...await playerState(account) };
    },

    // Sign this device out: its token stops working; the game starts a new guest player
    'POST /api/auth/logout': async (req, ctx) => {
      await data.update('players', ctx.player.id, p => { p.tokenHashes = (p.tokenHashes || []).filter(x => x !== ctx.tokenHash); });
      return { ok: true };
    },

    // Each signed-in player's shop is kept on the server, so the same account continues on any device
    'GET /api/save': async (req, ctx) => {
      if (!ctx.player.contact) return { save: null };
      const s = await data.readSave(ctx.player.id);
      return { save: s ? s.save : null, savedAt: s ? s.savedAt : 0 };
    },
    'POST /api/save': async (req, ctx, body) => {
      if (!ctx.player.contact) fail(403, 'Sign in to save your shop online');
      await limit('save:' + ctx.player.id, 12, 60e3, 'Saving too often');
      const save = body.save;
      if (!save || typeof save !== 'object' || save.version !== 1 || !Array.isArray(save.items)) fail(400, 'Not a game save');
      const savedAt = Math.min(Date.now(), Math.floor(+body.savedAt) || Date.now());
      const old = await data.readSave(ctx.player.id);
      if (old && old.savedAt > savedAt) return { ok: false, stale: true, savedAt: old.savedAt };   // a newer save from another device wins
      await data.writeSave(ctx.player.id, { savedAt, save });
      return { ok: true, savedAt };
    },
    // "New game": forget the online save too
    'POST /api/save/delete': async (req, ctx) => {
      await data.deleteSave(ctx.player.id);
      return { ok: true };
    },

    // Leaderboard: each player reports their shop's numbers; everyone sees the top 50
    'POST /api/score': async (req, ctx, body) => {
      await limit('score:' + ctx.player.id, 6, 60e3);
      const num = (v, max) => Math.max(0, Math.min(max, Math.floor(+v) || 0));
      const name = String(body.name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
      if (!name) fail(400, 'Pick a name for the leaderboard');
      await data.put('scores', ctx.player.id, {
        name, earned: num(body.earned, 1e9), served: num(body.served, 1e7), day: num(body.day, 1e5),
        stage: num(body.stage, 10), updatedAt: Date.now(),
      });
      return { ok: true };
    },
    'GET /api/leaderboard': async (req, ctx) => {
      const by = new URL(req.url).searchParams.get('by');
      const key = ['earned', 'served', 'day'].includes(by) ? by : 'earned';
      const { rows, players } = await data.topScores(key, 50);
      const row = (r, i) => ({ rank: i + 1, name: r.name, earned: r.earned, served: r.served, day: r.day, stage: r.stage, me: r.id === ctx.player.id });
      const out = rows.map(row);
      let me = out.find(r => r.me) || null;
      if (!me) {
        const mine = await data.get('scores', ctx.player.id);
        if (mine) me = row({ ...mine, id: ctx.player.id }, await data.scoreRank(key, mine));
      }
      return { by: key, players, rows: out, me };
    },

    // "I followed on Instagram": once per player/account, on top of the daily cap
    'POST /api/bonus': async (req, ctx, body) => {
      const s = SOCIAL.find(x => x.id === body.id);
      if (!s) fail(404, 'Unknown bonus');
      const p = await data.update('players', ctx.player.id, p => {
        p.bonuses = p.bonuses || {};
        if (p.bonuses[s.id]) fail(409, 'You already got this bonus');
        p.bonuses[s.id] = Date.now();
        p.balance += s.coins;
      });
      return { added: s.coins, ...await playerState(p) };
    },

    'POST /api/redeem': async (req, ctx, body) => {
      if (!ctx.player.contact) fail(403, 'Sign in with your phone number or email to get real coupons');
      const r = REWARDS.find(x => x.id === body.rewardId);
      if (!r) fail(404, 'Unknown reward');
      const recent = (await data.couponsOf(ctx.player.id)).filter(c => c.rewardId === r.id && Date.now() - c.createdAt < 30 * DAY).length;
      if (recent >= (r.limitPer30Days || 1)) fail(400, `You can get ${r.name} ${r.limitPer30Days || 1}× per 30 days`);
      const code = await newCouponCode();
      // the balance check and the payment happen together, so a double tap can't pay twice
      const p = await data.update('players', ctx.player.id, p => {
        if (p.balance < r.cost) fail(400, `You need ${r.cost} coins for ${r.name}`);
        p.balance -= r.cost;
      });
      const coupon = { code, playerId: p.id, rewardId: r.id, cost: r.cost, createdAt: Date.now(), expiresAt: Date.now() + (r.validDays || 30) * DAY };
      await data.put('coupons', code, coupon);
      await data.log({ at: Date.now(), type: 'issued', code });
      return { coupon: await couponView(coupon, p), ...await playerState(p) };
    },

    'POST /api/staff/login': async (req, ctx, body) => {
      if (!STAFF_ON) fail(503, 'The staff desk is not set up (STAFF_PIN is missing)');
      await limit('pin:' + (ctx.ip || 'all'), 5, 600e3, 'Too many attempts. Wait 10 minutes.');
      const ok = crypto.timingSafeEqual(Buffer.from(sha(String(body.pin || ''))), Buffer.from(sha(STAFF_PIN)));
      if (!ok) fail(401, 'Wrong PIN');
      return { token: staffToken(Date.now() + 12 * 3600e3) };
    },

    'POST /api/staff/lookup': async (req, ctx, body) => {
      const c = await data.get('coupons', String(body.code || '').toUpperCase().trim());
      if (!c) fail(404, 'No coupon with this code');
      return { coupon: await couponView(c) };
    },

    'POST /api/staff/use': async (req, ctx, body) => {
      const code = String(body.code || '').toUpperCase().trim();
      if (!await data.get('coupons', code)) fail(404, 'No coupon with this code');
      const c = await data.update('coupons', code, c => {
        if (c.usedAt) fail(409, `Already used on ${new Date(c.usedAt).toLocaleString()}`);
        if (Date.now() > c.expiresAt) fail(409, 'This coupon has expired');
        c.usedAt = Date.now();
      });
      await data.log({ at: Date.now(), type: 'used', code });
      return { coupon: await couponView(c) };
    },

    'GET /api/staff/recent': async () => {
      const s = await data.staffStats(today());
      return { ...s, recent: await Promise.all(s.recent.map(c => couponView(c))) };
    },
  };

  const PLAYER_ROUTES = new Set(['POST /api/score', 'GET /api/leaderboard', 'GET /api/save', 'POST /api/save', 'POST /api/save/delete', 'GET /api/me', 'POST /api/earn', 'POST /api/redeem', 'POST /api/bonus', 'POST /api/auth/start', 'POST /api/auth/verify', 'POST /api/auth/logout']);
  const STAFF_ROUTES = new Set(['POST /api/staff/lookup', 'POST /api/staff/use', 'GET /api/staff/recent']);

  // ---------- the handler ----------

  function cors(req) {
    const origin = (req.headers.get('origin') || '').replace(/\/$/, '');
    if (!origin || !(ORIGINS.includes(origin) || ORIGINS.includes('*'))) return {};
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Staff-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' };
  }
  const json = (req, status, obj) => new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors(req) },
  });

  return async function handle(req, extra = {}) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    // the API lives under /api/…; a Neon Function URL has no prefix, so both "/api/me" and "/me" work
    const pathName = url.pathname.startsWith('/api/') ? url.pathname : '/api' + (url.pathname === '/' ? '/health' : url.pathname);
    const route = `${req.method} ${pathName}`;
    const fn = api[route];
    if (!fn) return json(req, 404, { error: 'Not found' });
    try {
      const ctx = { ip: extra.ip || (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() };
      if (PLAYER_ROUTES.has(route)) {
        const m = /^Bearer (\w{20,})$/.exec(req.headers.get('authorization') || '');
        ctx.tokenHash = m ? sha(m[1]) : '';
        ctx.player = m ? await data.playerByToken(ctx.tokenHash) : null;
        if (!ctx.player) return json(req, 401, { error: 'Unknown player' });
        await limit('p:' + ctx.player.id, 60, 60e3);
      }
      if (STAFF_ROUTES.has(route) && !staffOk(req)) return json(req, 401, { error: 'Staff login required' });
      let body = {};
      if (req.method === 'POST') {
        const text = await req.text();
        if (text.length > (route === 'POST /api/save' ? MAX_SAVE : 10000)) return json(req, 400, { error: 'Bad request' });
        try { body = text ? JSON.parse(text) : {}; } catch (e) { return json(req, 400, { error: 'Bad request' }); }
      }
      return json(req, 200, await fn(req, ctx, body));
    } catch (e) {
      if (e && e.code && e.error) return json(req, e.code, { error: e.error });
      console.error(e);
      return json(req, 500, { error: 'Server error' });
    }
  };
}

module.exports = { createApi };
