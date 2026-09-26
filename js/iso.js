// Isometric projection helpers and drawing primitives

const TW = 64;   // tile width in px
const TH = 32;   // tile height in px
const WALL_H = 96;

// View rotation around the room centre (3D view only). Everything that maps tiles to the screen goes
// through iso()/screenToTile(), so taps, labels and effects follow the rotated camera automatically.
const VIEW = { angle: 0, target: 0, cx: 0, cy: 0, spin: 0 };

function iso(x, y, z = 0) {
  if (VIEW.angle) {
    const c = Math.cos(VIEW.angle), s = Math.sin(VIEW.angle), dx = x - VIEW.cx, dy = y - VIEW.cy;
    x = VIEW.cx + c * dx + s * dy;
    y = VIEW.cy - s * dx + c * dy;
  }
  return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 - z };
}

function screenToTile(wx, wy) {
  const a = wx / (TW / 2);
  const b = wy / (TH / 2);
  let x = (a + b) / 2, y = (b - a) / 2;
  if (VIEW.angle) {
    const c = Math.cos(VIEW.angle), s = Math.sin(VIEW.angle), dx = x - VIEW.cx, dy = y - VIEW.cy;
    x = VIEW.cx + c * dx - s * dy;
    y = VIEW.cy + s * dx + c * dy;
  }
  return { x, y };
}

function shade(hex, amt) {
  // amt in [-1, 1]; negative darkens, positive lightens
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  const n = parseInt(c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// Draws an iso box. Footprint (x0,y0,w,d) in tile units, z0/h in pixels.
function box(ctx, x0, y0, w, d, z0, h, color, opts = {}) {
  const top = opts.top || shade(color, 0.18);
  const left = opts.left || color;
  const right = opts.right || shade(color, -0.22);
  const edge = opts.edge === undefined ? 'rgba(0,0,0,0.18)' : opts.edge;
  poly(ctx, [iso(x0, y0 + d, z0), iso(x0 + w, y0 + d, z0), iso(x0 + w, y0 + d, z0 + h), iso(x0, y0 + d, z0 + h)], left, edge);
  poly(ctx, [iso(x0 + w, y0, z0), iso(x0 + w, y0 + d, z0), iso(x0 + w, y0 + d, z0 + h), iso(x0 + w, y0, z0 + h)], right, edge);
  poly(ctx, [iso(x0, y0, z0 + h), iso(x0 + w, y0, z0 + h), iso(x0 + w, y0 + d, z0 + h), iso(x0, y0 + d, z0 + h)], top, edge);
}

function tileDiamond(ctx, x, y, fill, stroke, z = 0) {
  poly(ctx, [iso(x, y, z), iso(x + 1, y, z), iso(x + 1, y + 1, z), iso(x, y + 1, z)], fill, stroke);
}

function ellipse(ctx, cx, cy, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function circle(ctx, cx, cy, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// Deterministic pseudo random for a tile (for floor texture variation)
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Sets a transform so that drawing in (u, v) pixel coords lands flat on a back wall.
// wall 'left'  : plane x=0, text runs from larger y towards smaller y
// wall 'right' : plane y=0, text runs along +x
function wallTransform(ctx, wall, along, z) {
  const len = Math.hypot(TW / 2, TH / 2);
  if (wall === 'left') {
    const o = iso(0, along, z);
    ctx.transform(TW / 2 / len, -TH / 2 / len, 0, 1, o.x, o.y);
  } else {
    const o = iso(along, 0, z);
    ctx.transform(TW / 2 / len, TH / 2 / len, 0, 1, o.x, o.y);
  }
  return len; // pixels per tile along the wall
}

// The CANI Barbershop logo as a round badge; `glow` adds a warm halo (lit sign)
function drawLogoBadge(ctx, x, y, size, glow) {
  ctx.save();
  if (glow) { ctx.shadowColor = 'rgba(226,194,122,0.85)'; ctx.shadowBlur = glow; }
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#050505'; ctx.fill();
  ctx.shadowBlur = 0;
  if (typeof LOGO !== 'undefined' && logoReady(LOGO)) ctx.drawImage(LOGO, x, y, size, size);
  else {
    ctx.fillStyle = '#c9a24f'; ctx.font = `bold ${size * 0.3}px Fredoka, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('CANI', x + size / 2, y + size * 0.58);
  }
  ctx.strokeStyle = 'rgba(201,162,79,0.9)'; ctx.lineWidth = Math.max(1, size / 30);
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Paint one TV commercial into a w×h canvas (t makes the ticker scroll)
function paintAd(ctx, w, h, ad, t) {
  ctx.fillStyle = ad.bg; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.3, h * 0.3, 10, w * 0.5, h * 0.5, w * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const k = (t % 6) / 6;                          // progress through this ad
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(h * 0.34)}px serif`;
  ctx.fillText(ad.icon, w * 0.5, h * 0.3 + Math.sin(t * 3) * 3);
  ctx.fillStyle = ad.fg;
  ctx.font = `bold ${Math.round(h * 0.13)}px Fredoka, sans-serif`;
  ctx.fillText(ad.brand, w / 2, h * 0.62);
  ctx.globalAlpha = Math.min(1, k * 4);
  ctx.font = `${Math.round(h * 0.075)}px Fredoka, sans-serif`;
  ctx.fillText(ad.line, w / 2, h * 0.76);
  ctx.globalAlpha = 1;
  // ticker
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, h * 0.86, w, h * 0.14);
  ctx.fillStyle = '#ffd60a'; ctx.font = `bold ${Math.round(h * 0.07)}px Fredoka, sans-serif`; ctx.textAlign = 'left';
  const tick = 'AKCIJA · NOVO · POPUST · AKCIJA · NOVO · POPUST · ';
  const off = (t * 40) % (w * 1.2);
  ctx.fillText(tick + tick, -off, h * 0.93);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `${Math.round(h * 0.06)}px sans-serif`;
  ctx.fillText('OGLAS', w - 6, h * 0.08);
}
