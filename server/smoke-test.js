// End-to-end check of the server against its data store (used by .github/workflows/neon.yml).
// Starts the server, signs a player in, earns and redeems coins, saves a shop, posts a leaderboard score,
// uses the coupon at the staff desk, restarts the server and checks that everything is still there.
//
//   DATABASE_URL='postgresql://…' node server/smoke-test.js      (or without DATABASE_URL to test the file store)
//
// It adds a test account ("Smoke Test") to the database, so point it at a throwaway Neon branch (the workflow
// does), never at the shop's real database.

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cani-smoke-'));
const env = { ...process.env, PORT: String(PORT), STAFF_PIN: '4821', AUTH_DEV: '1', DAILY_COIN_CAP: '500', DATA_DIR };

let server = null, log = '';
function startServer() {
  return new Promise((resolve, reject) => {
    log = '';
    server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = d => { log += d; if (/CANI server on/.test(log)) setTimeout(resolve, 100); };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.on('exit', code => reject(new Error(`server exited (${code}):\n${log}`)));
    setTimeout(() => reject(new Error('server did not start in 60 s:\n' + log)), 60000);
  });
}
function stopServer() {
  return new Promise(resolve => {
    server.removeAllListeners('exit');
    server.on('exit', resolve);
    server.kill('SIGTERM');           // the server writes pending changes before it stops
  });
}

async function call(method, route, body, headers = {}) {
  const res = await fetch(BASE + route, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${data.error || ''}`);
  return data;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check(ok, what) {
  if (!ok) throw new Error('FAILED: ' + what);
  console.log('  ok  ' + what);
}

(async () => {
  const email = `smoke-${Date.now()}@example.com`;
  await startServer();
  const store = (log.match(/Data: ([^·\n]+)/) || [])[1] || '?';
  console.log(`Server started, data: ${store.trim()}`);
  if (process.env.DATABASE_URL) check(/PostgreSQL/.test(store), 'the server uses the PostgreSQL database');

  const guest = await call('POST', '/api/players');
  const start = await call('POST', '/api/auth/start', { contact: email }, { Authorization: 'Bearer ' + guest.token });
  const me = await call('POST', '/api/auth/verify', { contact: email, code: start.devCode }, { Authorization: 'Bearer ' + guest.token });
  const auth = { Authorization: 'Bearer ' + me.token };
  check(me.signedIn, 'sign in with an email code');

  for (let i = 0; i < 3; i++) { await call('POST', '/api/earn', { amount: 25 }, auth); await sleep(4100); }
  const coupon = (await call('POST', '/api/redeem', { rewardId: 'coffee' }, auth)).coupon;
  check(coupon && /^CANI-/.test(coupon.code), 'earn coins and redeem a free coffee coupon');

  const save = { version: 1, items: [{ id: 1, type: 'barberChair', x: 2, y: 2, rot: 1 }], day: 9, money: 4242, stage: 1 };
  await call('POST', '/api/save', { save, savedAt: Date.now() }, auth);
  await call('POST', '/api/score', { name: 'Smoke Test', earned: 123456, served: 77, day: 9, stage: 1 }, auth);
  const staff = await call('POST', '/api/staff/login', { pin: '4821' });
  await call('POST', '/api/staff/use', { code: coupon.code }, { 'X-Staff-Token': staff.token });
  check(true, 'save a shop, post a score and use the coupon at the staff desk');

  await stopServer();
  await startServer();
  console.log('Server restarted');
  const again = await call('GET', '/api/me', null, auth);
  check(again.signedIn && again.balance === 75 - 60, 'the account and coin balance are still there');
  check(again.coupons.some(c => c.code === coupon.code && c.status === 'used'), 'the coupon is still marked as used');
  const online = await call('GET', '/api/save', null, auth);
  check(online.save && online.save.money === 4242 && online.save.items[0].rot === 1, 'the saved shop is still there');
  const board = await call('GET', '/api/leaderboard?by=earned', null, auth);
  check(board.me && board.me.name === 'Smoke Test' && board.me.earned === 123456, 'the leaderboard score is still there');

  await stopServer();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('All good ✅');
})().catch(async e => {
  console.error(e.message);
  if (server) { server.removeAllListeners('exit'); server.kill('SIGKILL'); }
  process.exit(1);
});
