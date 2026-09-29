// Start screen: every player signs in and gets their own shop.
//   - Players on this device: pick your name (with an optional 4-digit PIN), or make a new player.
//   - With the rewards server: sign in with a phone number or email; the shop is saved online and
//     continues on any device.

const Account = { current: null };
const PROFILES_KEY = 'cani-profiles';

function profiles() {
  try { const l = JSON.parse(localStorage.getItem(PROFILES_KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
let _profiles = null;
function profileList() { return _profiles || (_profiles = profiles()); }
function saveProfiles() {
  if (Account.current) {
    const i = profileList().findIndex(p => p.id === Account.current.id);
    if (i >= 0) _profiles[i] = Account.current;
  }
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profileList())); } catch (e) { /* storage unavailable */ }
}
function forgetProfile(id) {
  _profiles = profileList().filter(p => p.id !== id);
  try {
    localStorage.removeItem(saveKey(id));
    localStorage.removeItem(TOKEN_BASE + ':' + id);
    localStorage.removeItem(PENDING_BASE + ':' + id);
  } catch (e) { /* ignore */ }
  saveProfiles();
}

// A light lock so brothers and sisters don't play each other's shop (not real security)
function pinHash(id, pin) {
  let h = 2166136261;
  for (const ch of id + ':' + pin) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

const escapeHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// saves made before there were players become "Player 1"
function migrateOldSave() {
  if (profileList().length) return;
  let old = null;
  try { old = localStorage.getItem(SAVE_KEY); } catch (e) { return; }
  if (!old) return;
  const p = { id: 'p' + Date.now().toString(36), name: 'Player 1', createdAt: Date.now() };
  try {
    localStorage.setItem(saveKey(p.id), old);
    for (const base of [TOKEN_BASE, PENDING_BASE]) {
      const v = localStorage.getItem(base);
      if (v !== null) localStorage.setItem(base + ':' + p.id, v);
    }
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { return; }
  _profiles = [p];
  saveProfiles();
}

// the server offers username + password accounts (always, on current servers)
const usePassword = () => !!(Cloud.signIn && Cloud.signIn.password);

function profileSummary(p) {
  const s = readLocalSave(p.id);
  if (!s) return p.contact ? 'Saved online' : 'New shop';
  const st = STAGES[s.stage] || STAGES[0];
  return `${st.name} · Day ${s.day} · ${fmt(s.money)}`;
}

// Shows the start screen and resolves with the chosen player
function accountGate() {
  migrateOldSave();
  window.__caniWaiting = true;          // the boot watchdog should not fire while someone is choosing
  const box = $('#accountGate'), card = $('#gateCard');
  box.hidden = false;
  return new Promise(resolve => {
    const head = `<div class="gate-logo"><img src="${LOGO.src}" alt="CANI Barbershop"><span>Barber Tycoon</span><small>created by xardiig</small></div>`;
    const enter = p => {
      p.lastPlayed = Date.now();
      Account.current = p;
      saveProfiles();
      box.hidden = true;
      window.__caniWaiting = false;
      resolve(p);
    };

    const list = (err = '') => {
      const ps = profileList().slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
      card.innerHTML = `${head}
        <h2>Who's playing?</h2>
        <div class="gate-list">${ps.map(p => `
          <div class="gate-player" data-g="pick" data-id="${p.id}" role="button" tabindex="0">
            <span class="gate-avatar">${escapeHtml((p.name || '?').trim().charAt(0).toUpperCase())}</span>
            <span class="gate-main"><b>${escapeHtml(p.name)}${p.pin ? ' 🔒' : ''}${p.contact ? ' ☁️' : ''}</b><small>${escapeHtml(profileSummary(p))}</small></span>
            <button class="gate-del" data-g="del" data-id="${p.id}" aria-label="Remove ${escapeHtml(p.name)}" title="Remove from this device">✕</button>
          </div>`).join('') || '<p class="muted">No players yet on this device.</p>'}
        </div>
        <div class="field-error">${err}</div>
        <div class="gate-btns">
          <button class="btn ${Cloud.available ? '' : 'primary'}" data-g="new">＋ New player</button>
          ${Cloud.available ? `<button class="btn primary" data-g="signin">🔐 ${usePassword() ? 'Log in / create account' : 'Sign in with phone or email'}</button>` : ''}
        </div>
        <p class="gate-note">${Cloud.available
          ? 'Sign in to keep your shop online – continue on any phone or computer, and get real coupons. Players without sign-in are saved on this device only.'
          : 'Each player has their own shop, saved on this device.'}</p>`;
    };

    const newPlayer = (err = '') => {
      card.innerHTML = `${head}
        <h2>New player</h2>
        <label class="field-label" for="gName">Your name</label>
        <input class="field" id="gName" maxlength="16" autocomplete="nickname" placeholder="e.g. Luka">
        <label class="field-label" for="gPin">PIN (optional, 4 digits)</label>
        <input class="field code" id="gPin" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off">
        <div class="field-error">${err}</div>
        <div class="gate-btns"><button class="btn" data-g="back">Back</button><button class="btn primary" data-g="create">Start my shop ✂️</button></div>`;
      $('#gName').focus();
      $('#gPin').oninput = e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); };
    };

    const askPin = (p, err = '') => {
      card.innerHTML = `${head}
        <h2>🔒 ${escapeHtml(p.name)}</h2>
        <label class="field-label" for="gPinIn">Enter your PIN</label>
        <input class="field code" id="gPinIn" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off">
        <div class="field-error">${err}</div>
        <div class="gate-btns"><button class="btn" data-g="back">Back</button><button class="btn primary" data-g="unlock" data-id="${p.id}">Play</button></div>`;
      const inp = $('#gPinIn');
      inp.focus();
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); if (inp.value.length === 4) unlock(p); };
    };
    const unlock = p => {
      if (pinHash(p.id, $('#gPinIn').value) === p.pin) enter(p);
      else askPin(p, 'Wrong PIN');
    };

    // username + password account (no email or SMS service needed)
    let username = '';
    const passwordForm = (err = '') => {
      const codes = Cloud.signIn && (Cloud.signIn.email || Cloud.signIn.phone);
      card.innerHTML = `${head}
        <h2>🔐 Your CANI account</h2>
        <p class="gate-note">Log in to continue your shop on any phone or computer. New here? Pick a username and password, then tap <b>Create account</b>.</p>
        <label class="field-label" for="gUser">Username</label>
        <input class="field" id="gUser" maxlength="16" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. luka_kranj" value="${escapeHtml(username)}">
        <label class="field-label" for="gPass">Password</label>
        <input class="field" id="gPass" type="password" maxlength="100" autocomplete="current-password" placeholder="at least 6 characters">
        <div class="field-error">${err}</div>
        <div class="gate-btns">
          <button class="btn" data-g="back">Back</button>
          <button class="btn" data-g="register">＋ Create account</button>
          <button class="btn primary" data-g="login">Log in</button>
        </div>
        ${codes ? '<p class="gate-note"><a href="#" data-g="codesignin">📧 Use a phone or email code instead</a></p>' : ''}`;
      (username ? $('#gPass') : $('#gUser')).focus();
    };
    async function passwordAuth(mode) {
      username = $('#gUser').value.trim();
      const password = $('#gPass').value;
      if (!username || !password) return passwordForm('Type a username and a password');
      busy(true);
      try {
        // signing in needs a (temporary) player token
        if (!Cloud.token) Cloud.token = (await api('POST', '/api/players')).token;
        signedIn(await api('POST', mode === 'register' ? '/api/auth/register' : '/api/auth/login', { username, password }));
      } catch (e) { passwordForm(e.message); }
    }
    // an account session was opened (password or code): remember it on this device and play
    function signedIn(r) {
      const id = 'acct-' + r.id;
      let p = profileList().find(x => x.id === id);
      if (!p) { p = { id, name: r.contact, createdAt: Date.now() }; profileList().push(p); }
      p.contact = r.contact;
      Account.current = p;
      store(tokenKey(), r.token);
      Cloud.token = r.token;
      enter(p);
    }

    // phone / email sign-in with a 6-digit code (same as in the Rewards tab)
    let contact = '';
    const signIn = (err = '') => usePassword() ? passwordForm(err) : codeSignIn(err);
    const codeSignIn = (err = '') => {
      card.innerHTML = `${head}
        <h2>🔐 Sign in</h2>
        <p class="gate-note">We'll send you a 6-digit code. Your shop is saved to your account.</p>
        <label class="field-label" for="gContact">Phone (with country code) or email</label>
        <input class="field" id="gContact" autocomplete="username" inputmode="email" placeholder="+386 40 123 456 or you@mail.com" value="${escapeHtml(contact)}">
        <div class="field-error">${err}</div>
        <div class="gate-btns"><button class="btn" data-g="${usePassword() ? 'signin' : 'back'}">Back</button><button class="btn primary" data-g="send">Send code</button></div>`;
      $('#gContact').focus();
    };
    const codeStep = (to, devCode, err = '') => {
      card.innerHTML = `${head}
        <h2>📨 Enter your code</h2>
        <p class="gate-note">We sent a 6-digit code to <b>${escapeHtml(to)}</b>.</p>
        ${devCode ? `<p class="tip">Test mode: your code is <b>${devCode}</b></p>` : ''}
        <input class="field code" id="gCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••">
        <div class="field-error">${err}</div>
        <div class="gate-btns"><button class="btn" data-g="codesignin">Back</button><button class="btn primary" data-g="verify" data-to="${escapeHtml(to)}">Sign in</button></div>`;
      const inp = $('#gCode');
      inp.focus();
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); if (inp.value.length === 6) verify(to); };
    };
    const busy = on => card.querySelectorAll('button').forEach(b => { b.disabled = on; });
    async function send() {
      contact = $('#gContact').value.trim();
      if (!contact) return codeSignIn('Type your phone number or email');
      busy(true);
      try {
        // signing in needs a (temporary) player token
        if (!Cloud.token) Cloud.token = (await api('POST', '/api/players')).token;
        const r = await api('POST', '/api/auth/start', { contact });
        codeStep(r.to, r.devCode);
      } catch (e) { codeSignIn(e.message); }
    }
    async function verify(to) {
      const code = $('#gCode').value;
      if (code.length !== 6) return;
      busy(true);
      try {
        signedIn(await api('POST', '/api/auth/verify', { contact, code }));
      } catch (e) { codeStep(to, '', e.message); }
    }

    card.onclick = e => {
      const b = e.target.closest('[data-g]');
      if (!b || b.disabled) return;
      if (b.tagName === 'A') e.preventDefault();
      const g = b.dataset.g;
      if (g === 'del') {
        e.stopPropagation();
        const p = profileList().find(x => x.id === b.dataset.id);
        if (!p) return;
        if (b.dataset.sure) { forgetProfile(p.id); list(); return; }
        b.dataset.sure = '1';
        b.textContent = 'Delete?';
        b.classList.add('sure');
        setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = '✕'; b.classList.remove('sure'); } }, 3000);
        return;
      }
      if (g === 'pick') {
        const p = profileList().find(x => x.id === b.dataset.id);
        if (!p) return;
        if (p.pin) askPin(p); else enter(p);
      }
      if (g === 'new') newPlayer();
      if (g === 'back') list();
      if (g === 'signin') signIn();
      if (g === 'codesignin') codeSignIn();
      if (g === 'login' || g === 'register') passwordAuth(g);
      if (g === 'send') send();
      if (g === 'verify') verify(b.dataset.to);
      if (g === 'unlock') unlock(profileList().find(x => x.id === b.dataset.id));
      if (g === 'create') {
        const name = $('#gName').value.trim().replace(/\s+/g, ' ');
        const pin = $('#gPin').value;
        if (!name) return newPlayer('Type your name');
        if (profileList().some(x => x.name.toLowerCase() === name.toLowerCase())) return newPlayer('That name is taken on this device');
        if (pin && pin.length !== 4) return newPlayer('The PIN needs 4 digits (or leave it empty)');
        const p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, createdAt: Date.now() };
        if (pin) p.pin = pinHash(p.id, pin);
        profileList().push(p);
        enter(p);
      }
    };
    card.onkeydown = e => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      if (e.target.id === 'gName' || e.target.id === 'gPin') card.querySelector('[data-g="create"]').click();
      if (e.target.id === 'gContact') send();
      if (e.target.id === 'gUser') $('#gPass').focus();
      if (e.target.id === 'gPass') passwordAuth('login');
      if (e.target.id === 'gPinIn') card.querySelector('[data-g="unlock"]').click();
      if (e.target.classList.contains('gate-player')) e.target.click();
    };
    list();
  });
}

// The chosen player's shop: the newest of this device's copy and the online copy
async function loadProfileSave(p) {
  const local = readLocalSave(p.id);
  if (!p.contact || !Cloud.available) return loadGame(local);
  Cloud.token = load(tokenKey());
  const online = await cloudFetchSave();
  if (online && (!local || (online.savedAt || 0) > (local.savedAt || 0))) return loadGame(online.save);
  return loadGame(local);
}

// Menu → Switch player: save, then show the start screen again
function switchPlayer() {
  saveGame();
  cloudPushSave(saveData(), true).finally(() => { Game.noSave = true; location.reload(); });
}
