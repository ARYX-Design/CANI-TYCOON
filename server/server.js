// CANI Barber Tycoon server for one computer or a host like Render: serves the game files and the rewards API
// (server/api.js). The same API also runs as a Neon Function (server/function.mjs) next to GitHub Pages.
//
//   STAFF_PIN=4821 node server/server.js
//
// Environment (API settings are listed in server/api.js):
//   PORT            port to listen on (default 8080)
//   DATABASE_URL    PostgreSQL connection string, e.g. from neon.tech (run "npm install" first)
//   DATA_DIR        without DATABASE_URL: where the data files are kept (default server/data)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { openData } = require('./data');
const { createApi } = require('./api');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

if (!/^\d{4,}$/.test(String(process.env.STAFF_PIN || ''))) {
  console.error('Set STAFF_PIN to a number with at least 4 digits, e.g. STAFF_PIN=4821 node server/server.js');
  process.exit(1);
}

const data = openData({ databaseUrl: process.env.DATABASE_URL || '', dataDir: DATA_DIR });
const handle = createApi(data);

// ---------- static files ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(ROOT, '.' + rel);
  const blocked = !file.startsWith(ROOT + path.sep) || rel.split('/').some(seg => seg.startsWith('.') || seg === 'node_modules')
    || file.startsWith(path.join(ROOT, 'server') + path.sep) || /^\/?package(-lock)?\.json$/.test(rel);
  if (blocked) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
}

// ---------- API: node's request -> web Request -> handler -> node's response ----------

async function serveApi(req, res) {
  const chunks = [];
  let size = 0;
  for await (const ch of req) { size += ch.length; if (size > 500000) { res.writeHead(413); return res.end(); } chunks.push(ch); }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
    method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const response = await handle(request, { ip });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/') || (req.method === 'OPTIONS' && url.pathname.startsWith('/api'))) {
    return serveApi(req, res).catch(e => { console.error(e); if (!res.headersSent) { res.writeHead(500); } res.end(); });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url.pathname);
});

// first start on an empty database: copy what the JSON files already hold (players, coupons, saves)
async function importOldFiles() {
  if (!process.env.DATABASE_URL || !fs.existsSync(path.join(DATA_DIR, 'db.json')) || !await data.isEmpty()) return;
  const files = openData({ dataDir: DATA_DIR });
  const { db, saves } = files.exportAll();
  if (!Object.keys(db.players).length) return;
  for (const kind of ['players', 'coupons', 'contacts', 'scores']) {
    for (const [id, rec] of Object.entries(db[kind] || {})) await data.put(kind, id, kind === 'contacts' && typeof rec === 'string' ? { playerId: rec } : rec);
  }
  for (const entry of db.log || []) await data.log(entry);
  for (const id of saves) { const rec = await files.readSave(id); if (rec) await data.writeSave(id, rec); }
  console.log(`Moved ${Object.keys(db.players).length} players, ${Object.keys(db.coupons).length} coupons and ${saves.length} saves from ${DATA_DIR} into the database`);
}

async function start() {
  try { await data.init(); await importOldFiles(); }
  catch (e) {
    console.error(`Could not open the data store (${data.kind}): ${e.message}`);
    process.exit(1);
  }
  server.listen(PORT, () => {
    const e = process.env;
    console.log(`CANI server on http://localhost:${PORT}  (staff page: /staff.html, daily coin cap ${+e.DAILY_COIN_CAP || 40})`);
    console.log(`Data: ${data.kind}`);
    console.log(`Sign-in: email ${e.RESEND_API_KEY ? 'via Resend' : e.AUTH_DEV === '1' ? 'dev mode' : 'OFF'}, SMS ${e.TWILIO_ACCOUNT_SID ? 'via Twilio' : e.AUTH_DEV === '1' ? 'dev mode' : 'OFF'}`);
  });
}

// write pending file changes before stopping (Ctrl+C, or the host restarting the server)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try { await data.close(); } catch (e) { console.error('closing the data store failed:', e.message); }
    process.exit(0);
  });
}

start();
