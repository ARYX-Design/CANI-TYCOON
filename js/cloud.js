// Real-world rewards: the server keeps each player's coin balance and issues coupon codes
// that the barbershop checks and marks as used on the staff page (staff.html).

const Cloud = {
  online: false,
  base: null,
  token: null,
  me: null,          // { id, balance, earnedToday, cap, coupons }
  rewards: [],
  cap: 0,
  pending: 0,        // coins earned in the game but not yet confirmed by the server
  capNoticeDay: '',
};

const TOKEN_KEY = 'cani-player-token';
const PENDING_KEY = 'cani-pending-coins';

function store(key, val) { try { if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, String(val)); } catch (e) { /* ignore */ } }
function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

async function api(method, path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(Cloud.base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(Cloud.token ? { Authorization: 'Bearer ' + Cloud.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  } finally { clearTimeout(timer); }
}

async function cloudInit() {
  const base = typeof CANI_CONFIG !== 'undefined' ? CANI_CONFIG.apiBase : null;
  if (base === null || (base === '' && !/^https?:$/.test(location.protocol))) return;
  Cloud.base = base;
  try {
    const r = await api('GET', '/api/rewards');
    Cloud.rewards = r.rewards;
    Cloud.cap = r.cap;
  } catch (e) { return; }   // no server here: stay offline
  Cloud.token = load(TOKEN_KEY);
  Cloud.pending = Math.max(0, +load(PENDING_KEY) || 0);
  try {
    if (Cloud.token) Cloud.me = await api('GET', '/api/me');
  } catch (e) { if (e.status === 401) Cloud.token = null; else return; }
  if (!Cloud.token) {
    try {
      const r = await api('POST', '/api/players');
      Cloud.token = r.token;
      store(TOKEN_KEY, r.token);
      Cloud.me = r;
      // coins earned before the server was reachable are sent once (still capped per day)
      Cloud.pending += Game.state.coins;
    } catch (e) { return; }
  }
  Cloud.online = true;
  syncCoinDisplay();
  setInterval(flushCoins, 8000);
  if (UI.panel === 'rewards') renderPanel();
}

function syncCoinDisplay() {
  if (Cloud.online && Cloud.me) Game.state.coins = Cloud.me.balance + Cloud.pending;
}

// called whenever the game awards coins
function cloudEarn(n) {
  if (!Cloud.online) return;
  Cloud.pending += n;
  store(PENDING_KEY, Cloud.pending);
}

async function flushCoins() {
  if (!Cloud.online || Cloud.flushing || Cloud.pending <= 0) return;
  Cloud.flushing = true;
  Cloud.lastFlush = Date.now();
  const amount = Math.min(25, Cloud.pending);
  Cloud.pending -= amount;
  try {
    const r = await api('POST', '/api/earn', { amount });
    Cloud.me = r;
    if (r.accepted < amount) {
      // over today's cap: drop what the server refused, and everything still pending
      Cloud.pending = 0;
      const d = new Date().toDateString();
      if (Cloud.capNoticeDay !== d) { Cloud.capNoticeDay = d; toast(`⭐ Daily limit reached (${r.cap} coins per day). Come back tomorrow for more!`, 4000, 'hint'); }
    }
  } catch (e) {
    Cloud.pending += amount;   // try again later
  } finally {
    Cloud.flushing = false;
    store(PENDING_KEY, Cloud.pending);
    syncCoinDisplay();
  }
}

async function redeemReward(id) {
  const r = Cloud.rewards.find(x => x.id === id);
  if (!Cloud.online || !r) return;
  // make sure every coin earned so far has reached the server (it accepts one update every few seconds)
  if (Cloud.pending > 0) toast('⭐ Syncing your coins…', 2500);
  for (let i = 0; i < 4 && Cloud.pending > 0; i++) {
    while (Cloud.flushing) await new Promise(res => setTimeout(res, 200));
    if (Date.now() - (Cloud.lastFlush || 0) < 4200) await new Promise(res => setTimeout(res, 4200 - (Date.now() - Cloud.lastFlush)));
    await flushCoins();
  }
  try {
    const res = await api('POST', '/api/redeem', { rewardId: id });
    Cloud.me = res;
    syncCoinDisplay();
    sfx('fanfare');
    renderPanel();
    showCoupon(res.coupon.code);
  } catch (e) {
    sfx('error');
    toast(e.message, 3000, 'warn');
  }
}

async function refreshMe() {
  if (!Cloud.online) return;
  try { Cloud.me = await api('GET', '/api/me'); syncCoinDisplay(); } catch (e) { /* offline for now */ }
}

function qrSvg(text) {
  if (typeof qrcode !== 'function') return '';
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

function staffUrl(code) {
  const base = Cloud.base || location.origin;
  return `${base.replace(/\/$/, '')}/staff.html#${code}`;
}

// Full-screen coupon to show at the counter
function showCoupon(code) {
  const c = Cloud.me && Cloud.me.coupons.find(x => x.code === code);
  if (!c) return;
  const exp = new Date(c.expiresAt).toLocaleDateString();
  showModal(`<div class="coupon-show ${c.status}">
      <div class="coupon-brand">CANI <span>Barber Shop</span></div>
      <div class="coupon-reward">${c.icon} ${c.name}</div>
      ${c.status === 'active' ? `<div class="coupon-qr">${qrSvg(staffUrl(c.code))}</div>` : `<div class="coupon-stamp">${c.status === 'used' ? 'USED' : 'EXPIRED'}</div>`}
      <div class="coupon-code">${c.code}</div>
      <p>${c.status === 'active' ? `Show this at the counter. Valid until <b>${exp}</b>. One use only.` : c.status === 'used' ? `Used on ${new Date(c.usedAt).toLocaleDateString()}.` : `Expired on ${exp}.`}</p>
    </div>`, [{ label: 'Close', cls: 'primary' }]);
}
