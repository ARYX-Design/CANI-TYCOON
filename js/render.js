// Scene rendering: floor, walls, furniture, people, overlays

const Renderer = {
  canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
  cam: { x: 0, y: 0, zoom: 1 },
  hover: null,   // hovered tile {x,y}
  hoverAgent: null,

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
    this.drawPlaque(ctx, st, n);
    this.drawFloor(ctx, st, n);
    this.drawWalls(ctx, st, n, t);
    this.drawWallDecor(ctx, st, n, t);
    this.drawBuildHighlight(ctx);
    this.drawSelection(ctx, t);

    // depth-sorted entities
    const list = [];
    for (const it of s.items) list.push({ d: it.x + it.y + 1, fn: () => this.drawItem(ctx, it, t) });
    for (const p of [...Game.customers, ...Game.barbers]) list.push({ d: p.x + p.y + 0.02, fn: () => { const q = iso(p.x, p.y); drawPerson(ctx, p, q.x, q.y, t); } });
    list.sort((a, b) => a.d - b.d);
    list.forEach(e => e.fn());

    this.drawLights(ctx, st, n, t);
    this.drawGhost(ctx, t);
    for (const p of Game.particles) { ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, p.life); ctx.fillRect(p.x, p.y, 2, 1.5); }
    ctx.globalAlpha = 1;
    this.drawSparkles(ctx);
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
    // ambient occlusion where the floor meets the walls
    const ao = (p0, p1, poly4) => {
      const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      g.addColorStop(0, 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      poly(ctx, poly4, g);
    };
    ao(iso(0, n / 2), iso(0.7, n / 2), [iso(0, 0), iso(0, n), iso(0.7, n), iso(0.7, 0)]);
    ao(iso(n / 2, 0), iso(n / 2, 0.7), [iso(0, 0), iso(n, 0), iso(n, 0.7), iso(0, 0.7)]);
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
    // soft light falloff: brighter near the top of the walls
    for (const face of [[iso(0, 0, 0), iso(0, n, 0), iso(0, n, H), iso(0, 0, H)], [iso(0, 0, 0), iso(n, 0, 0), iso(n, 0, H), iso(0, 0, H)]]) {
      const g = ctx.createLinearGradient(0, face[2].y, 0, face[0].y);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.6, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.16)');
      poly(ctx, face, g);
    }
    // baseboard
    poly(ctx, [iso(0, 0, 0), iso(0, n, 0), iso(0, n, 4), iso(0, 0, 4)], shade(dark, -0.35));
    poly(ctx, [iso(0, 0, 0), iso(n, 0, 0), iso(n, 0, 4), iso(0, 0, 4)], shade(dark, -0.3));

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

  // name plate on the front of the diorama
  drawPlaque(ctx, st, n) {
    ctx.save();
    const len = Math.hypot(TW / 2, TH / 2);
    const o = iso(n / 2 - 1.6, n, -4);
    ctx.transform(TW / 2 / len, TH / 2 / len, 0, 1, o.x, o.y);
    roundRect(ctx, 0, 2, len * 3.2, 14, 3, '#15172a', 'rgba(241,196,83,0.6)');
    ctx.font = '600 9px Fredoka, sans-serif';
    ctx.fillStyle = '#f1c453'; ctx.textAlign = 'center';
    ctx.fillText(`CANI · ${st.name.toUpperCase()}`, len * 1.6, 12);
    ctx.restore();
  },

  drawWallDecor(ctx, st, n, t) {
    if (st.floor === 'concrete') {
      // pegboard with tools and a strip light
      ctx.save();
      const len = wallTransform(ctx, 'right', 1.6, 0);
      const w = len * 1.5;
      roundRect(ctx, 0, -74, w, 34, 2, '#c8a36a', 'rgba(0,0,0,0.3)');
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 4; x < w; x += 5) for (let y = -70; y < -42; y += 5) ctx.fillRect(x, y, 1, 1);
      ctx.strokeStyle = '#6c757d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(10, -60, 4, 0, Math.PI * 2); ctx.arc(10, -52, 4, 0, Math.PI * 2); ctx.stroke();   // scissors
      ctx.fillStyle = '#343a40'; ctx.fillRect(22, -68, 7, 16); ctx.fillStyle = '#adb5bd'; ctx.fillRect(22, -70, 7, 3);  // clipper
      ctx.fillStyle = '#e63946'; ctx.fillRect(36, -66, 3, 20); ctx.fillStyle = '#212529'; ctx.fillRect(34, -48, 7, 2);    // comb
      ctx.fillStyle = '#4ea8de'; roundRect(ctx, 44, -64, 6, 14, 2, '#4ea8de');                                            // spray bottle
      roundRect(ctx, 2, -92, w - 4, 5, 2, '#f8f9fa', 'rgba(0,0,0,0.3)');                                                   // strip light
      ctx.restore();
      return;
    }
    // hairstyle poster next to the door
    ctx.save();
    const len = wallTransform(ctx, 'right', n - 2.9, 0);
    const w = len * 0.72;
    roundRect(ctx, 0, -86, w, 50, 2, st.trim);
    roundRect(ctx, 2.5, -83.5, w - 5, 45, 1, '#f7f1e3');
    ctx.fillStyle = '#1b1b1f'; ctx.font = 'bold 6px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('STYLES', w / 2, -76);
    const heads = [[w * 0.3, -64, '#1c1410', 0], [w * 0.7, -64, '#a0692f', 1], [w * 0.3, -48, '#6b4226', 2], [w * 0.7, -48, '#1c1410', 3]];
    for (const [hx, hy, col, k] of heads) {
      circle(ctx, hx, hy, 4.5, '#e8b894');
      ctx.fillStyle = col;
      ctx.beginPath();
      if (k === 0) ctx.arc(hx, hy - 1, 4.8, Math.PI, 0);
      else if (k === 1) { ctx.arc(hx, hy - 1, 4.8, Math.PI, 0); ctx.ellipse(hx + 1.5, hy - 5.5, 3, 2, 0.3, 0, Math.PI * 2); }
      else if (k === 2) ctx.arc(hx, hy - 2, 4.8, Math.PI * 1.1, Math.PI * 1.9);
      else { ctx.arc(hx, hy - 1, 4.8, Math.PI, 0); ctx.arc(hx, hy + 3, 3.8, 0.1, Math.PI - 0.1); }
      ctx.fill();
      ctx.fillStyle = '#e8b894'; ctx.fillRect(hx - 2, hy + 4, 4, 3);
    }
    ctx.restore();
  },

  // wall lamps that glow warmer as the evening comes
  drawLights(ctx, st, n, t) {
    const hour = Game.state.time / 60;
    const k = 0.35 + clamp((hour - 16) / 3, 0, 1) * 0.55;
    const lamps = [];
    if (st.floor === 'concrete') lamps.push({ x: 2.35, y: 0, z: 90, r: 120, col: '220,235,255' });
    else {
      for (let mx = 2; mx < n - 3; mx += 2) lamps.push({ x: mx - 0.5, y: 0, z: 80, r: 90, col: '255,196,120' });
      for (let wy = 2.8; wy + 0.2 < n - 5; wy += 3) lamps.push({ x: 0, y: wy + 1.4, z: 80, r: 90, col: '255,196,120' });
    }
    ctx.save();
    for (const l of lamps) {
      const p = iso(l.x, l.y, l.z);
      if (st.floor !== 'concrete') {
        // brass sconce
        roundRect(ctx, p.x - 3, p.y - 2, 6, 9, 2, '#b08d57', 'rgba(0,0,0,0.3)');
        ellipse(ctx, p.x, p.y - 3, 5, 3, `rgba(${l.col},0.95)`);
      }
      ctx.globalCompositeOperation = 'lighter';
      const flick = 1 + Math.sin(t * 7 + l.x * 3) * 0.02;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, l.r * flick);
      g.addColorStop(0, `rgba(${l.col},${0.22 * k})`);
      g.addColorStop(1, `rgba(${l.col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, l.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  },

  drawSelection(ctx, t) {
    const a = Game.selected;
    if (!a) return;
    const p = iso(a.x, a.y);
    ctx.save();
    ctx.strokeStyle = '#f1c453'; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 15, 7.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },

  drawSparkles(ctx) {
    for (const s of Game.sparkles) {
      const r = 3.5 * Math.min(1, s.life * 1.5);
      ctx.globalAlpha = Math.min(1, s.life * 1.6);
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r * 0.3, s.y - r * 0.3); ctx.lineTo(s.x + r, s.y);
      ctx.lineTo(s.x + r * 0.3, s.y + r * 0.3); ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - r * 0.3, s.y + r * 0.3);
      ctx.lineTo(s.x - r, s.y); ctx.lineTo(s.x - r * 0.3, s.y - r * 0.3); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  // the frontmost person under a screen point
  pickAgent(sx, sy) {
    const w = this.toWorld(sx, sy);
    let best = null;
    for (const a of [...Game.customers, ...Game.barbers]) {
      if ((a.alpha ?? 1) < 0.5) continue;
      const p = iso(a.x, a.y, a.sitting ? 3 : 0);
      if (w.x > p.x - 13 && w.x < p.x + 13 && w.y > p.y - 56 && w.y < p.y + 5) {
        if (!best || a.x + a.y > best.x + best.y) best = a;
      }
    }
    return best;
  },

  drawItem(ctx, it, t) {
    const fn = ItemSprites[it.type];
    if (UI.tool && UI.tool.mode === 'sell' && this.hover && this.hover.x === it.x && this.hover.y === it.y) {
      tileDiamond(ctx, it.x, it.y, 'rgba(230,57,70,0.45)');
    }
    const c = iso(it.x + 0.5, it.y + 0.5);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 26);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 26, 13, 0, 0, Math.PI * 2); ctx.fill();
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
    const hovered = this.hoverAgent;
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
      if (UI.showNames || b === hovered || b === Game.selected) {
        const p = iso(b.x, b.y, 66);
        nameTag(ctx, `✂ ${b.data.name}`, p.x, p.y, b.owner ? '#f1c453' : '#fff');
      }
    }
    for (const c of Game.customers) {
      if (c !== hovered && c !== Game.selected) continue;
      const p = iso(c.x, c.y, (c.sitting ? 17 : 14) + 50);
      nameTag(ctx, `${ORIGINS[c.origin].flag} ${c.name}`, p.x, p.y - 10, '#fff');
    }
    for (const a of [...Game.customers, ...Game.barbers]) {
      if (!a.say || a.say.delay > 0 || (a.alpha ?? 1) < 0.5) continue;
      const p = iso(a.x, a.y, (a.sitting ? 17 : 14) + 52);
      speechBubble(ctx, a.say.text, p.x + 10, p.y - 12, Math.min(1, a.say.life * 2));
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

function nameTag(ctx, text, x, y, color) {
  ctx.font = '600 8.5px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 8;
  roundRect(ctx, x - w / 2, y - 8, w, 11, 5, 'rgba(15,16,30,0.75)');
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 0.5);
}

function speechBubble(ctx, text, x, y, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 9px Fredoka, sans-serif';
  ctx.textAlign = 'left';
  const w = ctx.measureText(text).width + 12, h = 15;
  roundRect(ctx, x, y - h, w, h, 7, '#ffffff', 'rgba(20,20,40,0.5)');
  ctx.beginPath(); ctx.moveTo(x + 5, y - 1); ctx.lineTo(x - 2, y + 5); ctx.lineTo(x + 11, y - 1); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.fillStyle = '#1d1a2b';
  ctx.fillText(text, x + 6, y - 4.5);
  ctx.restore();
}

function serviceIcon(sv) {
  return { buzz: '⚡', classic: '✂️', beard: '🧔', fade: '💈', wash: '🚿', shave: '🪒', color: '🎨', signature: '⭐', royal: '👑', vip: '🌟' }[sv.id] || '✂️';
}
