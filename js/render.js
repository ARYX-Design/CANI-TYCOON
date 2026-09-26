// Scene rendering: floor, walls, furniture, people, overlays

const Renderer = {
  canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
  cam: { x: 0, y: 0, zoom: 1 },
  hover: null,   // hovered tile {x,y}

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
  },

  fitCamera() {
    const n = gridSize();
    const roomW = n * TW + 40, roomH = n * TH + WALL_H + 80;
    const availH = this.h - 150, availW = this.w - 20;
    this.cam.zoom = clamp(Math.min(availW / roomW, availH / roomH), 0.45, 1.8);
    const c = iso(n / 2, n / 2, WALL_H / 3);
    this.cam.x = -c.x * this.cam.zoom;
    this.cam.y = -c.y * this.cam.zoom + 10;
  },

  toWorld(sx, sy) {
    return { x: (sx - this.w / 2 - this.cam.x) / this.cam.zoom, y: (sy - this.h / 2 - this.cam.y) / this.cam.zoom };
  },

  tileAt(sx, sy) {
    const w = this.toWorld(sx, sy);
    const t = screenToTile(w.x, w.y);
    return { x: Math.floor(t.x), y: Math.floor(t.y) };
  },

  draw() {
    const ctx = this.ctx, s = Game.state, t = Game.t;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(ctx);
    ctx.save();
    ctx.translate(this.w / 2 + this.cam.x, this.h / 2 + this.cam.y);
    ctx.scale(this.cam.zoom, this.cam.zoom);

    const st = stage(), n = st.size;
    // floating diorama slab
    box(ctx, -0.25, -0.25, n + 0.25, n + 0.25, -22, 22, '#3d405b', { top: '#3d405b', left: '#2e3148', right: '#23263a' });
    this.drawFloor(ctx, st, n);
    this.drawWalls(ctx, st, n, t);
    this.drawBuildHighlight(ctx);

    // depth-sorted entities
    const list = [];
    for (const it of s.items) list.push({ d: it.x + it.y + 1, fn: () => this.drawItem(ctx, it, t) });
    for (const p of [...Game.customers, ...Game.barbers]) list.push({ d: p.x + p.y + 0.02, fn: () => { const q = iso(p.x, p.y); drawPerson(ctx, p, q.x, q.y, t); } });
    list.sort((a, b) => a.d - b.d);
    list.forEach(e => e.fn());

    this.drawGhost(ctx, t);
    for (const p of Game.particles) { ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, p.life); ctx.fillRect(p.x, p.y, 2, 1.5); }
    ctx.globalAlpha = 1;
    this.drawOverlays(ctx, t);
    ctx.restore();
    this.drawDaylight(ctx);
  },

  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#1d2340');
    g.addColorStop(1, '#3b2f4f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    // subtle dots
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < this.w; x += 28) for (let y = 0; y < this.h; y += 28) ctx.fillRect(x, y, 2, 2);
  },

  drawFloor(ctx, st, n) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const h = hash2(x, y);
      let fill, stroke = 'rgba(0,0,0,0.08)';
      switch (st.floor) {
        case 'concrete': fill = shade('#9ea3a8', (h - 0.5) * 0.08); break;
        case 'checker': fill = (x + y) % 2 ? '#2b2d31' : '#f1f1ee'; stroke = 'rgba(0,0,0,0.12)'; break;
        case 'wood': fill = shade('#b98352', (h - 0.5) * 0.14 + (x % 2 ? 0.03 : -0.03)); stroke = 'rgba(80,40,10,0.25)'; break;
        case 'darkwood': fill = shade('#5b3d2b', (h - 0.5) * 0.14 + (y % 2 ? 0.04 : -0.02)); stroke = 'rgba(0,0,0,0.3)'; break;
        default: fill = (x + y) % 2 ? '#ece8df' : '#dcd6ca'; stroke = 'rgba(160,130,60,0.35)';
      }
      tileDiamond(ctx, x, y, fill, stroke);
      if (st.floor === 'wood' || st.floor === 'darkwood') {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        const a = iso(x, y + 0.5), b = iso(x + 1, y + 0.5);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      if (st.floor === 'marble' && h > 0.75) {
        ctx.strokeStyle = 'rgba(150,140,120,0.35)';
        ctx.beginPath();
        const a = iso(x + 0.2, y + 0.3), b = iso(x + 0.6, y + 0.5), c = iso(x + 0.8, y + 0.9);
        ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(b.x, b.y, c.x, c.y); ctx.stroke();
      }
    }
    if (st.floor === 'concrete') {
      const p = iso(3.4, 3.8);
      ellipse(ctx, p.x, p.y, 16, 6, 'rgba(40,40,50,0.25)');   // oil stain
      const q = iso(1.2, 4.6);
      ellipse(ctx, q.x, q.y, 7, 3, 'rgba(40,40,50,0.18)');
    }
    // door mat
    const d = doorTile();
    poly(ctx, [iso(d.x + 0.12, d.y + 0.1), iso(d.x + 0.88, d.y + 0.1), iso(d.x + 0.88, d.y + 0.7), iso(d.x + 0.12, d.y + 0.7)], '#8b2c2c');
  },

  drawWalls(ctx, st, n, t) {
    const wall = st.wall, dark = st.wallDark;
    const H = WALL_H;
    // left wall (plane x=0), right wall (plane y=0)
    box(ctx, -0.25, -0.25, 0.25, n + 0.25, 0, H, wall, { right: shade(wall, -0.08), left: shade(wall, -0.3), top: shade(wall, -0.35) });
    box(ctx, 0, -0.25, n, 0.25, 0, H, wall, { left: wall, right: shade(wall, -0.3), top: shade(wall, -0.35) });
    // wainscoting
    const wz = 30;
    poly(ctx, [iso(0, 0, 0), iso(0, n, 0), iso(0, n, wz), iso(0, 0, wz)], shade(dark, -0.08));
    poly(ctx, [iso(0, 0, 0), iso(n, 0, 0), iso(n, 0, wz), iso(0, 0, wz)], dark);
    ctx.strokeStyle = st.trim; ctx.lineWidth = 2;
    ctx.beginPath();
    let a = iso(0, n, wz), b = iso(0, 0, wz), c = iso(n, 0, wz);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();

    if (st.floor === 'concrete') {
      // corrugated garage door panel on the left wall
      const y0 = 1.2, y1 = n - 0.4;
      poly(ctx, [iso(0, y0, 0), iso(0, y1, 0), iso(0, y1, 78), iso(0, y0, 78)], '#b3b8bf', 'rgba(0,0,0,0.2)');
      ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1;
      for (let z = 6; z < 78; z += 6) { a = iso(0, y0, z); b = iso(0, y1, z); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    } else {
      // windows onto the street
      for (let wy = 1.2; wy + 1.6 < n - 5; wy += 3) this.drawWindow(ctx, wy, 1.6, t, st);   // keep clear of the sign
    }

    // shop sign
    ctx.save();
    const signAt = st.floor === 'concrete' ? n - 0.9 : n - 0.6;
    wallTransform(ctx, 'left', signAt, 0);
    if (st.floor === 'concrete') {
      ctx.font = 'bold 30px "Permanent Marker", "Fredoka", cursive';
      ctx.fillStyle = '#d62828';
      ctx.fillText("CANI'S", 14, -36);
      ctx.font = 'bold 11px "Fredoka", sans-serif';
      ctx.fillStyle = '#1b1b1b';
      ctx.fillText('BARBER SHOP', 30, -20);
    } else {
      const glow = st.trim;
      roundRect(ctx, 10, -H + 8, 150, 38, 6, 'rgba(10,10,20,0.85)');
      ctx.shadowColor = glow; ctx.shadowBlur = 10 + Math.sin(t * 3) * 3;
      ctx.font = 'bold 26px "Fredoka", sans-serif';
      ctx.fillStyle = glow === '#e63946' ? '#ff5d6c' : glow;
      ctx.fillText('CANI', 22, -H + 37);
      ctx.shadowBlur = 0;
      ctx.font = 'bold 10px "Fredoka", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('BARBER CO.', 92, -H + 33);
    }
    ctx.restore();

    // clock on the right wall
    ctx.save();
    wallTransform(ctx, 'right', 0.6, 0);
    const cx = 18, cy = -72;
    circle(ctx, cx, cy, 13, '#fff', '#333');
    const tm = Game.state.time;
    const hA = ((tm / 60) % 12) / 12 * Math.PI * 2 - Math.PI / 2;
    const mA = (tm % 60) / 60 * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(hA) * 7, cy + Math.sin(hA) * 7); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(mA) * 10, cy + Math.sin(mA) * 10); ctx.stroke();
    ctx.restore();

    // mirrors along the right wall (from Corner Shop onwards)
    if (st.floor !== 'concrete') {
      for (let mx = 2; mx < n - 3; mx += 2) {
        ctx.save();
        const len = wallTransform(ctx, 'right', mx + 0.2, 0);
        roundRect(ctx, 0, -84, len * 0.6, 44, 6, st.trim);
        const g = ctx.createLinearGradient(0, -82, len * 0.6, -42);
        g.addColorStop(0, '#dff3ff'); g.addColorStop(0.5, '#a9cbe0'); g.addColorStop(1, '#e8f6ff');
        roundRect(ctx, 3, -81, len * 0.6 - 6, 38, 4, g);
        ctx.restore();
      }
    }

    // entrance door on the right wall
    const d = doorTile();
    const x0 = d.x + 0.12, x1 = d.x + 0.88, dh = 66;
    poly(ctx, [iso(x0 - 0.04, 0, 0), iso(x1 + 0.04, 0, 0), iso(x1 + 0.04, 0, dh + 4), iso(x0 - 0.04, 0, dh + 4)], st.trim);
    poly(ctx, [iso(x0, 0, 0), iso(x1, 0, 0), iso(x1, 0, dh), iso(x0, 0, dh)], '#5c3d2e');
    poly(ctx, [iso(x0 + 0.1, 0, 26), iso(x1 - 0.1, 0, 26), iso(x1 - 0.1, 0, dh - 6), iso(x0 + 0.1, 0, dh - 6)], '#9fd3f2');
    ctx.save();
    wallTransform(ctx, 'right', d.x + 0.3, 0);
    roundRect(ctx, 2, -52, 22, 9, 2, '#fff');
    ctx.font = 'bold 6px sans-serif'; ctx.fillStyle = Game.state.time < CLOSE_TIME ? '#2a9d8f' : '#d62828';
    ctx.fillText(Game.state.time < CLOSE_TIME ? 'OPEN' : 'CLOSED', 4, -45.5);
    ctx.restore();
  },

  drawWindow(ctx, wy, len, t, st) {
    const z0 = 38, z1 = 82;
    poly(ctx, [iso(0, wy + len + 0.05, z0 - 3), iso(0, wy - 0.05, z0 - 3), iso(0, wy - 0.05, z1 + 3), iso(0, wy + len + 0.05, z1 + 3)], st.trim);
    const a = iso(0, wy, z1), b = iso(0, wy + len, z0);
    const g = ctx.createLinearGradient(0, a.y, 0, b.y);
    const hour = Game.state.time / 60;
    const evening = clamp((hour - 16) / 3, 0, 1);
    g.addColorStop(0, evening > 0.5 ? '#f4a261' : '#8ecae6');
    g.addColorStop(1, evening > 0.5 ? '#6d597a' : '#d7f0fa');
    poly(ctx, [iso(0, wy + len, z0), iso(0, wy, z0), iso(0, wy, z1), iso(0, wy + len, z1)], g);
    // passers-by silhouettes
    const px = ((t * 0.12 + wy * 0.37) % 1);
    const p = iso(0, wy + len - px * len, z0 + 2);
    ctx.fillStyle = 'rgba(40,50,70,0.35)';
    ctx.fillRect(p.x - 3, p.y - 18, 6, 18);
    circle(ctx, p.x, p.y - 22, 4, 'rgba(40,50,70,0.35)');
    ctx.strokeStyle = st.trim; ctx.lineWidth = 2;
    const m1 = iso(0, wy + len / 2, z0), m2 = iso(0, wy + len / 2, z1);
    ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
  },

  drawItem(ctx, it, t) {
    const fn = ItemSprites[it.type];
    if (UI.tool && UI.tool.mode === 'sell' && this.hover && this.hover.x === it.x && this.hover.y === it.y) {
      tileDiamond(ctx, it.x, it.y, 'rgba(230,57,70,0.45)');
    }
    if (fn) fn.call(ItemSprites, ctx, it.x, it.y, t);
  },

  drawBuildHighlight(ctx) {
    if (!UI.tool || !this.hover) return;
    const { x, y } = this.hover;
    if (!inBounds(x, y)) return;
    if (UI.tool.mode === 'place') {
      const ok = canPlace(UI.tool.type, x, y).ok;
      tileDiamond(ctx, x, y, ok ? 'rgba(80,220,120,0.35)' : 'rgba(230,57,70,0.4)', ok ? '#50dc78' : '#e63946');
    }
  },

  drawGhost(ctx, t) {
    if (!UI.tool || UI.tool.mode !== 'place' || !this.hover) return;
    const { x, y } = this.hover;
    if (!inBounds(x, y) || itemAt(x, y)) return;
    ctx.globalAlpha = 0.6;
    ItemSprites[UI.tool.type].call(ItemSprites, ctx, x, y, t);
    ctx.globalAlpha = 1;
  },

  drawOverlays(ctx, t) {
    for (const c of Game.customers) {
      if ((c.state === 'waiting' || c.state === 'enter') && c.alpha > 0.5) {
        const p = iso(c.x, c.y, (c.sitting ? 14 : 0) + 52);
        const f = clamp(c.patience / c.maxPatience, 0, 1);
        roundRect(ctx, p.x - 11, p.y - 3, 22, 5, 2, 'rgba(0,0,0,0.55)');
        roundRect(ctx, p.x - 10, p.y - 2, 20 * f, 3, 1.5, f > 0.5 ? '#52b788' : f > 0.25 ? '#f4a261' : '#e63946');
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(serviceIcon(c.service), p.x, p.y - 6);
      }
      if (c.state === 'atStation' && c.inService) {
        const p = iso(c.x, c.y, 76);
        roundRect(ctx, p.x - 18, p.y - 4, 36, 7, 3, 'rgba(0,0,0,0.6)');
        roundRect(ctx, p.x - 17, p.y - 3, 34 * clamp(c.progress, 0, 1), 5, 2.5, '#f1c453');
        ctx.font = 'bold 8px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.fillText(c.service.name, p.x, p.y - 7);
      }
    }
    for (const b of Game.barbers) {
      if (UI.showNames) {
        const p = iso(b.x, b.y, 58);
        ctx.font = 'bold 8px Fredoka, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(b.data.name, p.x + 0.5, p.y + 0.5);
        ctx.fillStyle = b.owner ? '#f1c453' : '#fff'; ctx.fillText(b.data.name, p.x, p.y);
      }
    }
    for (const f of Game.floaters) {
      ctx.globalAlpha = clamp(f.life / f.max * 1.5, 0, 1);
      ctx.textAlign = 'center';
      if (f.color) {
        ctx.font = 'bold 13px Fredoka, sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
      } else ctx.font = '15px sans-serif';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  },

  drawDaylight(ctx) {
    const hour = Game.state.time / 60;
    const k = clamp((hour - 17) / 3, 0, 1);
    if (k <= 0) return;
    ctx.fillStyle = `rgba(40,20,80,${k * 0.28})`;
    ctx.fillRect(0, 0, this.w, this.h);
  },
};

function serviceIcon(sv) {
  return { buzz: '⚡', classic: '✂️', beard: '🧔', fade: '💈', wash: '🚿', shave: '🪒', color: '🎨', signature: '⭐', royal: '👑', vip: '🌟' }[sv.id] || '✂️';
}
