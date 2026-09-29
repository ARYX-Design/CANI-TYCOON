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

// each player on this device has their own server token and not-yet-sent coins
const TOKEN_BASE = 'cani-player-token', PENDING_BASE = 'cani-pending-coins';
const profileKey = base => base + (typeof Account !== 'undefined' && Account.current ? ':' + Account.current.id : '');
const tokenKey = () => profileKey(TOKEN_BASE);
const pendingKey = () => profileKey(PENDING_BASE);

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

// Is there a rewards server? (checked once at start, before the sign-in screen)
async function cloudProbe() {
  const base = typeof CANI_CONFIG !== 'undefined' ? CANI_CONFIG.apiBase : null;
  if (base === null || (base === '' && !/^https?:$/.test(location.protocol))) return false;
  Cloud.base = base;
  try {
    const r = await api('GET', '/api/rewards');
    Cloud.rewards = r.rewards;
    Cloud.cap = r.cap;
    Cloud.signIn = r.signIn;
    if (Array.isArray(r.social)) Cloud.social = r.social;
    Cloud.available = true;
  } catch (e) { Cloud.available = false; }   // no server here: stay offline
  return Cloud.available;
}

async function cloudInit() {
  if (!Cloud.available) return;
  Cloud.token = load(tokenKey());
  Cloud.pending = Math.max(0, +load(pendingKey()) || 0);
  try {
    if (Cloud.token) Cloud.me = await api('GET', '/api/me');
  } catch (e) { if (e.status === 401) Cloud.token = null; else return; }
  if (!Cloud.token && Account.current && Account.current.contact) {
    // this account was signed out elsewhere: sign in again from the start screen
    toast('🔐 Please sign in again to keep saving online.', 4000, 'warn');
    Account.current.contact = '';
    saveProfiles();
  }
  if (!Cloud.token) {
    try {
      const r = await api('POST', '/api/players');
      Cloud.token = r.token;
      store(tokenKey(), r.token);
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
  store(pendingKey(), Cloud.pending);
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
    store(pendingKey(), Cloud.pending);
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

// the folder the game is served from, e.g. https://aryx-design.github.io/CANI-TYCOON/
const siteUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');

function staffUrl(code) {
  return `${siteUrl()}staff.html#${code}`;
}

// Full-screen coupon to show at the counter
function showCoupon(code) {
  const c = Cloud.me && Cloud.me.coupons.find(x => x.code === code);
  if (!c) return;
  const exp = new Date(c.expiresAt).toLocaleDateString();
  showModal(`<div class="coupon-show ${c.status}">
      <div class="coupon-brand"><img src="${LOGO.src}" alt="CANI Barbershop"></div>
      <div class="coupon-reward">${c.icon} ${c.name}</div>
      ${c.status === 'active' ? `<div class="coupon-qr">${qrSvg(staffUrl(c.code))}</div>` : `<div class="coupon-stamp">${c.status === 'used' ? 'USED' : 'EXPIRED'}</div>`}
      <div class="coupon-code">${c.code}</div>
      <p>${c.status === 'active' ? `Show this at the counter. Valid until <b>${exp}</b>. One use only.` : c.status === 'used' ? `Used on ${new Date(c.usedAt).toLocaleDateString()}.` : `Expired on ${exp}.`}</p>
    </div>`, [{ label: 'Close', cls: 'primary' }]);
}

// ---------- phone / email sign-in ----------

function openSignIn(afterId) {
  if (!Cloud.online) return;
  const m = $('#modal'), card = $('#modalCard');
  const opts = Cloud.signIn || { email: true, phone: true };
  const hint = opts.email && opts.phone ? 'phone number or email' : opts.phone ? 'phone number' : 'email';
  let contact = '';
  const step1 = (err = '') => {
    card.innerHTML = `<h2>🔐 Sign in</h2>
      <p>Real coupons are tied to your ${hint}, so only you can use them. We'll send you a 6-digit code.</p>
      <label class="field-label" for="signContact">Phone (with country code) or email</label>
      <input class="field" id="signContact" autocomplete="username" inputmode="email" placeholder="+386 40 123 456 or you@mail.com" value="${contact.replace(/"/g, '')}">
      <div class="field-error" id="signErr">${err}</div>
      <div class="modal-btns"><button class="btn danger" data-s="cancel">Cancel</button><button class="btn primary" data-s="send">Send code</button></div>`;
    const input = $('#signContact');
    input.focus();
    input.onkeydown = e => { if (e.key === 'Enter') send(); e.stopPropagation(); };
    card.querySelector('[data-s="send"]').onclick = send;
    card.querySelector('[data-s="cancel"]').onclick = close;
  };
  const step2 = (to, devCode, err = '') => {
    card.innerHTML = `<h2>📨 Enter your code</h2>
      <p>We sent a 6-digit code to <b>${to}</b>.</p>
      ${devCode ? `<p class="tip">Test mode: your code is <b>${devCode}</b></p>` : ''}
      <label class="field-label" for="signCode">Code</label>
      <input class="field code" id="signCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••">
      <div class="field-error" id="signErr">${err}</div>
      <div class="modal-btns"><button class="btn danger" data-s="back">Back</button><button class="btn primary" data-s="verify">Sign in</button></div>`;
    const input = $('#signCode');
    input.focus();
    input.onkeydown = e => { if (e.key === 'Enter') verify(); e.stopPropagation(); };
    input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); if (input.value.length === 6) verify(); };
    card.querySelector('[data-s="verify"]').onclick = verify;
    card.querySelector('[data-s="back"]').onclick = () => step1();
  };
  const busy = on => card.querySelectorAll('button').forEach(b => { b.disabled = on; });
  async function send() {
    contact = $('#signContact').value.trim();
    busy(true);
    try {
      const r = await api('POST', '/api/auth/start', { contact });
      step2(r.to, r.devCode);
    } catch (e) { step1(e.message); }
  }
  async function verify() {
    const code = $('#signCode').value;
    if (code.length !== 6) return;
    busy(true);
    try {
      const r = await api('POST', '/api/auth/verify', { contact, code });
      Cloud.token = r.token;
      store(tokenKey(), r.token);
      Cloud.me = r;
      syncCoinDisplay();
      close();
      await linkProfileToAccount(r);
      sfx('fanfare');
      toast(`✅ Signed in as ${r.contact}${r.merged ? ` · +⭐${r.merged} from this device` : ''}`, 3500);
      if (UI.panel === 'rewards') renderPanel();
      if (afterId) redeemConfirm(afterId);
    } catch (e) {
      const to = card.querySelector('b') ? card.querySelector('b').textContent : contact;
      step2(to, '', e.message);
    }
  }
  function close() { m.classList.add('hidden'); }
  step1();
  m.classList.remove('hidden');
}

async function signOut() {
  if (!Cloud.online) return;
  saveGame();
  await cloudPushSave(saveData(), true);
  try { await api('POST', '/api/auth/logout'); } catch (e) { /* token is dropped anyway */ }
  if (Account.current && Account.current.contact) {
    // an online account: forget it on this device and go back to the start screen
    store(tokenKey(), null);
    forgetProfile(Account.current.id);
    Game.noSave = true;
    location.reload();
    return;
  }
  store(tokenKey(), null);
  Cloud.token = null;
  Cloud.pending = 0;
  store(pendingKey(), 0);
  try {
    const r = await api('POST', '/api/players');
    Cloud.token = r.token;
    store(tokenKey(), r.token);
    Cloud.me = r;
  } catch (e) { Cloud.me = null; }
  syncCoinDisplay();
  toast('Signed out. Coins you earn now stay on this device until you sign in.', 3500);
  if (UI.panel === 'rewards') renderPanel();
}

function redeemConfirm(id) {
  const rw = Cloud.rewards.find(x => x.id === id);
  if (!rw) return;
  if (!Cloud.me || !Cloud.me.signedIn) { openSignIn(id); return; }
  showModal(`<h2>${rw.icon} ${rw.name}</h2><p>Exchange <b>⭐ ${rw.cost}</b> Cani Coins for this coupon? You'll get a code and QR to show at the counter.</p>`,
    [{ label: 'Cancel' }, { label: `Exchange ⭐ ${rw.cost}`, cls: 'primary', fn: () => redeemReward(rw.id) }]);
}

// ---------- Instagram follow bonus ----------
// Instagram doesn't let a game check who follows an account, so the bonus is on trust:
// the player opens the profile, and can claim the coins once afterwards.

function socialList() { return Cloud.online && Cloud.social ? Cloud.social : SOCIAL_REWARDS; }

function socialClaimed(id) {
  if (Cloud.online && Cloud.me) return (Cloud.me.bonuses || []).includes(id);
  return !!(Game.state.social && Game.state.social[id] === 'claimed');
}

function socialOpened(id) { return !!(Game.state.social && Game.state.social[id]); }

function markSocialOpened(id) {
  Game.state.social = Game.state.social || {};
  if (!Game.state.social[id]) Game.state.social[id] = 'opened';
  saveGame();
}

async function claimSocial(id) {
  const s = socialList().find(x => x.id === id);
  if (!s || socialClaimed(id)) return;
  if (Cloud.online) {
    try {
      const r = await api('POST', '/api/bonus', { id });
      Cloud.me = r;
      syncCoinDisplay();
    } catch (e) { toast(e.message, 2500, 'warn'); return; }
  } else {
    addCoins(s.coins);
  }
  Game.state.social[id] = 'claimed';
  saveGame();
  sfx('fanfare');
  toast(`📸 Thanks for following ${s.handle}! +⭐${s.coins}`, 3500, 'hint');
  if (UI.panel === 'rewards') renderPanel();
}

function socialCardsHTML() {
  return socialList().map(s => {
    const claimed = socialClaimed(s.id), opened = socialOpened(s.id);
    return `<div class="social-card">
      <div class="ig-icon">📸</div>
      <div class="card-main"><div class="card-title">${s.title}</div>
      <div class="card-desc">Follow <b>${s.handle}</b> on Instagram and get <b>⭐ ${s.coins}</b> once.</div></div>
      <div class="side">${claimed ? '<span class="badge">Claimed ✓</span>'
        : `<a class="ig-btn" href="${s.url}" target="_blank" rel="noopener" data-action="igOpen" data-id="${s.id}">Follow</a>
           <button class="btn small primary" data-action="igClaim" data-id="${s.id}" ${opened ? '' : 'disabled'} title="${opened ? '' : 'Tap Follow first'}">Claim ⭐ ${s.coins}</button>`}</div>
    </div>`;
  }).join('');
}

// ---------- online saves for signed-in players ----------

let lastPush = 0, pushTimer = null;
// send the shop to the server (at most every 20 s unless `now`)
function cloudPushSave(data, now) {
  if (!Cloud.online || !Cloud.me || !Cloud.me.signedIn || !data) return Promise.resolve();
  const wait = now ? 0 : Math.max(0, lastPush + 20000 - Date.now());
  clearTimeout(pushTimer);
  return new Promise(res => {
    pushTimer = setTimeout(async () => {
      lastPush = Date.now();
      try {
        const body = JSON.stringify({ save: data, savedAt: data.savedAt });
        // on page close a normal request may be cut off; keepalive survives (up to 64 KB)
        if (now && body.length < 60000) {
          await fetch(Cloud.base + '/api/save', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Cloud.token }, body });
        } else await api('POST', '/api/save', { save: data, savedAt: data.savedAt });
      } catch (e) { /* offline for a moment: the next save tries again */ }
      res();
    }, wait);
  });
}

async function cloudFetchSave() {
  if (!Cloud.token) return null;
  try { const r = await api('GET', '/api/save'); return r.save ? { save: r.save, savedAt: r.savedAt } : null; } catch (e) { return null; }
}

function cloudDeleteSave() {
  if (Cloud.online && Cloud.me && Cloud.me.signedIn) api('POST', '/api/save/delete').catch(() => {});
}

// Signed in from the Rewards tab: this player now belongs to the account. If the account already has a shop
// saved online (from another device), ask which one to keep.
async function linkProfileToAccount(r) {
  const p = Account.current;
  if (!p) return;
  p.contact = r.contact;
  saveProfiles();
  const online = await cloudFetchSave();
  if (!online) { cloudPushSave(saveData(), true); return; }
  const o = online.save, st = STAGES[o.stage] || STAGES[0];
  showModal(`<h2>☁️ This account already has a shop</h2>
    <p>Online: <b>${st.name}</b>, day ${o.day}, ${fmt(o.money)}.<br>On this device: <b>${stage().name}</b>, day ${Game.state.day}, ${fmt(Game.state.money)}.</p>
    <p>Which one do you want to keep playing?</p>`, [
    { label: '📱 Keep this one', fn: () => cloudPushSave(saveData(), true) },
    { label: '☁️ Load the online shop', cls: 'primary', fn: () => {
      try { localStorage.setItem(saveKey(p.id), JSON.stringify({ ...o, savedAt: Date.now() })); } catch (e) { /* ignore */ }
      Game.noSave = true;
      location.reload();
    } },
  ]);
}
