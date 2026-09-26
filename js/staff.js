// Coupon desk for the barbershop staff: log in with the PIN, check a code, mark it as used.

const $ = s => document.querySelector(s);
const API = (typeof window.CANI_API === 'string' ? window.CANI_API : '');
let token = sessionStorage.getItem('cani-staff') || '';
let current = null;

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Staff-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/staff/login') { logout(); throw new Error('Please log in again'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function show(loggedIn) {
  $('#loginBox').hidden = loggedIn;
  $('#checkBox').hidden = !loggedIn;
  $('#statsBox').hidden = !loggedIn;
  $('#logout').hidden = !loggedIn;
  if (loggedIn) { loadStats(); $('#code').focus(); }
}

function logout() { token = ''; sessionStorage.removeItem('cani-staff'); show(false); }

async function login() {
  $('#loginMsg').textContent = '';
  try {
    const r = await call('POST', '/api/staff/login', { pin: $('#pin').value });
    token = r.token;
    sessionStorage.setItem('cani-staff', token);
    $('#pin').value = '';
    show(true);
    if (location.hash.length > 1) { $('#code').value = decodeURIComponent(location.hash.slice(1)); lookup(); }
  } catch (e) { $('#loginMsg').textContent = e.message; }
}

function fmtCode(v) {
  const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^CANI/, '').slice(0, 8);
  return raw ? 'CANI-' + raw.slice(0, 4) + (raw.length > 4 ? '-' + raw.slice(4) : '') : '';
}

function renderResult(c, err) {
  const box = $('#result');
  if (err) { box.innerHTML = `<div class="result error"><div class="big-status">❌ ${err}</div></div>`; return; }
  const when = t => new Date(t).toLocaleString();
  const status = { active: '✅ Valid – give the reward', used: '⛔ Already used', expired: '⌛ Expired' }[c.status];
  box.innerHTML = `<div class="result ${c.status}">
      <div class="big-status">${status}</div>
      <div class="reward">${c.icon} ${c.name}</div>
      <div class="meta">${c.desc || ''}</div>
      <div class="meta mono">${c.code} · player ${c.player}</div>
      <div class="meta">Issued ${when(c.createdAt)} · valid until ${when(c.expiresAt)}${c.usedAt ? ` · used ${when(c.usedAt)}` : ''}</div>
      ${c.status === 'active' ? '<button class="btn primary" id="useBtn">Mark as used</button>' : ''}
    </div>`;
  const b = $('#useBtn');
  if (b) b.onclick = useCoupon;
}

async function lookup() {
  const code = fmtCode($('#code').value);
  $('#code').value = code;
  if (code.length < 14) { renderResult(null, 'Enter the full code, like CANI-AB12-CD34'); return; }
  try { current = (await call('POST', '/api/staff/lookup', { code })).coupon; renderResult(current); }
  catch (e) { current = null; renderResult(null, e.message); }
}

async function useCoupon() {
  if (!current) return;
  const b = $('#useBtn');
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Tap again to confirm'; return; }
  try { current = (await call('POST', '/api/staff/use', { code: current.code })).coupon; renderResult(current); loadStats(); }
  catch (e) { renderResult(null, e.message); }
}

async function loadStats() {
  try {
    const r = await call('GET', '/api/staff/recent');
    $('#sUsed').textContent = r.usedToday; $('#sIssued').textContent = r.issued; $('#sPlayers').textContent = r.players;
    $('#recent').innerHTML = r.recent.map(c => `<div><span>${c.icon} ${c.name}</span><span class="mono">${c.code}</span><span>${new Date(c.usedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('') || '<div><span>No coupons used yet.</span></div>';
  } catch (e) { /* shown on next action */ }
}

// Camera QR scanning where the browser supports it (Chrome on Android, for example)
let scanning = false;
async function scan() {
  const video = $('#video');
  if (scanning) { stopScan(); return; }
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream; video.hidden = false; await video.play();
    scanning = true; $('#scanBtn').textContent = '✖ Stop camera';
    const tick = async () => {
      if (!scanning) return;
      const codes = await detector.detect(video).catch(() => []);
      const hit = codes.map(c => c.rawValue).find(v => /CANI-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(v));
      if (hit) { $('#code').value = hit.match(/CANI-[A-Z0-9]{4}-[A-Z0-9]{4}/)[0]; stopScan(); lookup(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  } catch (e) { renderResult(null, 'Camera not available. Type the code instead.'); stopScan(); }
}
function stopScan() {
  scanning = false;
  const video = $('#video');
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  video.srcObject = null; video.hidden = true;
  $('#scanBtn').textContent = '📷 Scan QR';
}

$('#loginBtn').onclick = login;
$('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('#lookupBtn').onclick = lookup;
$('#code').addEventListener('keydown', e => { if (e.key === 'Enter') lookup(); });
$('#code').addEventListener('input', e => { e.target.value = fmtCode(e.target.value); });
$('#scanBtn').onclick = scan;
$('#scanBtn').hidden = !('BarcodeDetector' in window && navigator.mediaDevices);
$('#logout').onclick = logout;
window.addEventListener('hashchange', () => { if (token && location.hash.length > 1) { $('#code').value = decodeURIComponent(location.hash.slice(1)); lookup(); } });
show(!!token);
if (token && location.hash.length > 1) { $('#code').value = decodeURIComponent(location.hash.slice(1)); lookup(); }
