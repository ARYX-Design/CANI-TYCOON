// Procedural sprites: furniture and people

const ItemSprites = {
  barberChair(ctx, x, y, t, gold) {
    const seat = gold ? '#d4a82c' : '#c1272d';
    const metal = gold ? '#8a6d1c' : '#6c717a';
    box(ctx, x + 0.3, y + 0.3, 0.4, 0.4, 0, 3, shade(metal, -0.2));
    box(ctx, x + 0.42, y + 0.42, 0.16, 0.16, 3, 10, metal);
    box(ctx, x + 0.38, y + 0.78, 0.24, 0.16, 3, 4, metal);          // footrest
    box(ctx, x + 0.2, y + 0.22, 0.6, 0.58, 13, 8, seat);
    box(ctx, x + 0.14, y + 0.3, 0.08, 0.48, 17, 10, shade(seat, -0.25)); // arm
    box(ctx, x + 0.78, y + 0.3, 0.08, 0.48, 17, 10, shade(seat, -0.25)); // arm
    box(ctx, x + 0.2, y + 0.16, 0.6, 0.1, 21, 26, seat);            // back
    box(ctx, x + 0.36, y + 0.16, 0.28, 0.1, 47, 7, shade(seat, -0.1)); // headrest
    if (gold) {
      const p = iso(x + 0.5, y + 0.2, 60);
      ctx.font = '12px serif'; ctx.textAlign = 'center';
      ctx.fillText('👑', p.x, p.y);
    }
  },
  goldChair(ctx, x, y, t) { this.barberChair(ctx, x, y, t, true); },

  waitingChair(ctx, x, y) {
    const c = '#3a6ea5';
    for (const [lx, ly] of [[0.28, 0.3], [0.64, 0.3], [0.28, 0.66], [0.64, 0.66]]) box(ctx, x + lx, y + ly, 0.06, 0.06, 0, 11, '#333');
    box(ctx, x + 0.25, y + 0.27, 0.5, 0.48, 11, 5, c);
    box(ctx, x + 0.25, y + 0.22, 0.5, 0.08, 14, 18, shade(c, -0.1));
  },

  bench(ctx, x, y) {
    const c = '#7b4b2a';
    box(ctx, x + 0.12, y + 0.25, 0.76, 0.5, 0, 9, '#2d2d2d');
    box(ctx, x + 0.1, y + 0.23, 0.8, 0.52, 9, 6, c);
    box(ctx, x + 0.1, y + 0.18, 0.8, 0.1, 13, 18, shade(c, -0.1));
    for (let i = 0; i < 3; i++) {
      const p = iso(x + 0.23 + i * 0.27, y + 0.23, 26);
      circle(ctx, p.x, p.y, 1.2, '#e9c46a');
    }
  },

  plant(ctx, x, y, t) {
    box(ctx, x + 0.33, y + 0.33, 0.34, 0.34, 0, 14, '#b5651d');
    const p = iso(x + 0.5, y + 0.5, 14);
    const sway = Math.sin(t * 1.3 + x) * 1.2;
    const greens = ['#2d6a4f', '#40916c', '#52b788', '#74c69d'];
    const leaves = [[-7, -8, 8], [7, -9, 8], [0, -16, 9], [-4, -22, 7], [5, -21, 7], [0, -28, 6]];
    leaves.forEach((l, i) => circle(ctx, p.x + l[0] + sway * (i / 6), p.y + l[1], l[2], greens[i % 4]));
  },

  goldenPole(ctx, x, y, t) { this.barberPole(ctx, x, y, t, true); },

  neonSign(ctx, x, y, t) {
    box(ctx, x + 0.3, y + 0.35, 0.4, 0.3, 0, 5, '#2b2d42');
    const b = iso(x + 0.5, y + 0.5, 5);
    ctx.fillStyle = '#3d405b'; ctx.fillRect(b.x - 1.5, b.y - 34, 3, 34);
    const off = typeof utilityOff === 'function' && utilityOff('power');
    roundRect(ctx, b.x - 22, b.y - 58, 44, 24, 6, '#14101f', '#3d405b');
    const hue = 320 + Math.sin(t * 1.5) * 25;
    ctx.save();
    ctx.font = 'bold 15px Fredoka, sans-serif'; ctx.textAlign = 'center';
    if (!off) { ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 12; }
    ctx.fillStyle = off ? '#4a3a4f' : `hsl(${hue},100%,72%)`;
    ctx.fillText('CANI', b.x, b.y - 40);
    ctx.restore();
    if (!off) {
      ctx.strokeStyle = `hsla(${(hue + 160) % 360},100%,65%,0.9)`; ctx.lineWidth = 1.5;
      roundRect(ctx, b.x - 19, b.y - 55, 38, 18, 4); ctx.stroke();
    }
  },

  barberPole(ctx, x, y, t, gold) {
    box(ctx, x + 0.35, y + 0.35, 0.3, 0.3, 0, 6, gold ? '#8a6d1c' : '#444');
    const b = iso(x + 0.5, y + 0.5, 6);
    const w = 11, h = 46;
    ctx.save();
    roundRect(ctx, b.x - w / 2, b.y - h, w, h, 5, '#fff');
    ctx.clip();
    const off = (t * 14) % 16;
    for (let i = -4; i < 8; i++) {
      const yy = b.y - h + i * 8 + off;
      ctx.beginPath();
      ctx.moveTo(b.x - w, yy);
      ctx.lineTo(b.x + w, yy - 9);
      ctx.lineTo(b.x + w, yy - 5);
      ctx.lineTo(b.x - w, yy + 4);
      ctx.fillStyle = gold ? (i % 2 ? '#f1c453' : '#fff4c2') : i % 2 ? '#d62828' : '#1d4e89';
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(b.x - w / 2 + 2, b.y - h, 2, h);
    ctx.restore();
    circle(ctx, b.x, b.y - h - 2, 5, gold ? '#f1c453' : '#c0c0c0');
    if (gold && Math.sin(t * 3) > 0.6) { ctx.fillStyle = '#fff'; ctx.font = '9px serif'; ctx.textAlign = 'center'; ctx.fillText('✦', b.x + 8, b.y - h + 6); }
    circle(ctx, b.x - 1.5, b.y - h - 3.5, 1.5, '#fff');
  },

  register(ctx, x, y, t) {
    box(ctx, x + 0.1, y + 0.2, 0.8, 0.6, 0, 26, '#6b4f3a');
    box(ctx, x + 0.1, y + 0.2, 0.8, 0.6, 26, 3, '#3a2a1e');
    box(ctx, x + 0.3, y + 0.32, 0.4, 0.34, 29, 10, '#2f3136');
    box(ctx, x + 0.34, y + 0.34, 0.32, 0.06, 39, 9, '#1b1d20', { left: '#4dd599' });
    const p = iso(x + 0.5, y + 0.5, 60);
    ctx.font = 'bold 10px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#2d6a4f'; ctx.fillText('$', p.x, p.y + Math.sin(t * 2) * 1.5);
  },

  sink(ctx, x, y) {
    box(ctx, x + 0.15, y + 0.25, 0.7, 0.55, 0, 24, '#e9ecef');
    box(ctx, x + 0.15, y + 0.2, 0.7, 0.1, 24, 22, '#ced4da');
    const p = iso(x + 0.5, y + 0.52, 24);
    ellipse(ctx, p.x, p.y, 12, 6, '#adb5bd');
    ellipse(ctx, p.x, p.y + 1, 9, 4, '#8fb8de');
    const f = iso(x + 0.5, y + 0.28, 38);
    ctx.strokeStyle = '#8a8f96'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(f.x, f.y + 6); ctx.lineTo(f.x, f.y); ctx.lineTo(f.x + 5, f.y + 3); ctx.stroke();
  },

  tv(ctx, x, y, t) {
    box(ctx, x + 0.15, y + 0.3, 0.7, 0.45, 0, 16, '#3d2c22');
    box(ctx, x + 0.45, y + 0.45, 0.1, 0.1, 16, 5, '#222');
    const ad = currentAd(t);
    const off = typeof utilityOff === 'function' && utilityOff('power');
    box(ctx, x + 0.1, y + 0.45, 0.8, 0.06, 21, 32, '#111', { left: off ? '#050505' : ad.bg });
    if (!off) {
      const p = iso(x + 0.5, y + 0.51, 37);
      ctx.font = '11px serif'; ctx.textAlign = 'center';
      ctx.fillText(ad.icon, p.x, p.y + 1);
      ctx.fillStyle = ad.fg; ctx.font = 'bold 4px Fredoka, sans-serif';
      ctx.fillText(ad.brand.slice(0, 14), p.x, p.y + 8);
    }
  },

  coffee(ctx, x, y, t) {
    box(ctx, x + 0.12, y + 0.2, 0.76, 0.6, 0, 24, '#495057');
    box(ctx, x + 0.3, y + 0.3, 0.4, 0.35, 24, 22, '#adb5bd');
    box(ctx, x + 0.3, y + 0.3, 0.4, 0.35, 46, 3, '#212529');
    const p = iso(x + 0.5, y + 0.66, 28);
    roundRect(ctx, p.x - 3, p.y - 6, 6, 6, 1, '#fff');
    for (let i = 0; i < 2; i++) {
      const s = (t * 0.8 + i * 0.5) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - s)})`;
      circle(ctx, p.x + Math.sin(s * 6 + i) * 2, p.y - 8 - s * 14, 2 + s * 2, ctx.fillStyle);
    }
  },

  colorStation(ctx, x, y) {
    box(ctx, x + 0.12, y + 0.2, 0.76, 0.55, 0, 22, '#f1f3f5');
    box(ctx, x + 0.12, y + 0.18, 0.76, 0.1, 22, 30, '#dee2e6');
    const cols = ['#e63946', '#f4a261', '#2a9d8f', '#8338ec', '#ffbe0b'];
    cols.forEach((c, i) => box(ctx, x + 0.18 + i * 0.13, y + 0.45, 0.07, 0.07, 22, 10, c));
    const m = iso(x + 0.5, y + 0.23, 40);
    ellipse(ctx, m.x, m.y, 10, 8, '#bde0fe');
  },

  jukebox(ctx, x, y, t) {
    box(ctx, x + 0.2, y + 0.25, 0.6, 0.5, 0, 44, '#8d0801');
    const p = iso(x + 0.5, y + 0.75, 30);
    const hue = (t * 90) % 360;
    ellipse(ctx, p.x, p.y, 10, 11, `hsl(${hue},80%,60%)`);
    ellipse(ctx, p.x, p.y, 6, 7, '#fcefb4');
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      const q = iso(x + 0.5, y + 0.5, 58 + (t * 10) % 8);
      ctx.fillText('♪', q.x + 6, q.y);
    }
  },

  arcade(ctx, x, y, t) {
    box(ctx, x + 0.2, y + 0.25, 0.6, 0.5, 0, 62, '#3c096c');
    box(ctx, x + 0.2, y + 0.75, 0.6, 0.08, 26, 6, '#240046');
    const s = iso(x + 0.5, y + 0.75, 44);
    roundRect(ctx, s.x - 11, s.y - 10, 22, 14, 2, '#10002b');
    ctx.fillStyle = `hsl(${(t * 120) % 360},90%,60%)`;
    ctx.fillRect(s.x - 8 + Math.sin(t * 3) * 5, s.y - 6, 4, 4);
    ctx.fillStyle = '#ffd60a'; ctx.fillRect(s.x + 2, s.y - 2 + Math.cos(t * 4) * 2, 3, 3);
    const l = iso(x + 0.5, y + 0.75, 64);
    ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff4d6d';
    ctx.fillText('ARCADE', l.x, l.y);
  },

  aquarium(ctx, x, y, t) {
    box(ctx, x + 0.08, y + 0.2, 0.84, 0.6, 0, 16, '#343a40');
    box(ctx, x + 0.1, y + 0.22, 0.8, 0.56, 16, 30, 'rgba(72,149,239,0.55)', {
      top: 'rgba(173,216,255,0.6)', left: 'rgba(72,149,239,0.55)', right: 'rgba(40,110,200,0.55)', edge: 'rgba(255,255,255,0.4)',
    });
    for (let i = 0; i < 3; i++) {
      const fx = 0.2 + ((t * 0.15 + i * 0.33) % 1) * 0.6;
      const p = iso(x + fx, y + 0.78, 24 + i * 6);
      ctx.fillStyle = ['#ff9f1c', '#ff595e', '#ffca3a'][i];
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    }
  },

  statue(ctx, x, y, t) {
    box(ctx, x + 0.2, y + 0.2, 0.6, 0.6, 0, 20, '#adb5bd');
    const p = iso(x + 0.5, y + 0.5, 20);
    const g = '#e0b62c', gd = '#b8901c';
    roundRect(ctx, p.x - 8, p.y - 30, 16, 26, 5, g);
    roundRect(ctx, p.x - 3, p.y - 30, 6, 26, 2, gd);
    circle(ctx, p.x, p.y - 38, 8, g);
    ctx.fillStyle = gd; ctx.fillRect(p.x + 8, p.y - 44, 3, 18);   // raised scissors arm
    ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.fillText('✂', p.x + 10, p.y - 46);
    const sparkle = Math.sin(t * 3) > 0.7;
    if (sparkle) { ctx.fillStyle = '#fff'; ctx.fillText('✦', p.x - 6, p.y - 40); }
  },
};

// Classic 2D view for furniture without its own drawing: a plinth with the item's icon
function genericItemSprite(ctx, x, y, t, type) {
  const def = ITEMS[type] || {};
  const tall = def.seat ? 14 : def.station ? 20 : 26;
  box(ctx, x + 0.2, y + 0.2, 0.6, 0.6, 0, tall, def.decor >= 8 ? '#c9a24f' : '#5c5f6b');
  const p = iso(x + 0.5, y + 0.5, tall + 12);
  ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.icon || '✨', p.x, p.y + Math.sin(t * 2 + x) * 1.5);
  ctx.textBaseline = 'alphabetic';
}

// ---------- People ----------

const OUTLINE = 'rgba(28,20,38,0.7)';
const LONG_BACK = new Set([3, 10, 11, 13, 14]);   // styles with hair behind the body

function drawPerson(ctx, p, sx, sy, t) {
  const alpha = p.alpha === undefined ? 1 : p.alpha;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  const dir = p.dir || 1;
  const sitting = p.sitting;
  const walking = p.moving && !sitting;
  const phase = (p.walkT || 0) * 10;
  const bob = walking ? Math.abs(Math.sin(phase)) * 1.6 : Math.sin(t * 2 + (p.id || 0)) * 0.4;
  const hip = sy - (sitting ? 17 : 14) - bob;
  const top = hip - 18;                  // top of the torso
  const hx = sx, hy = top - 8;           // head centre

  // soft contact shadow
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
  sg.addColorStop(0, 'rgba(0,0,0,0.35)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.ellipse(sx, sy, 12, 5, 0, 0, Math.PI * 2); ctx.fill();

  if (LONG_BACK.has(p.hairStyle)) drawHairBack(ctx, p, hx, hy, dir);

  drawLegs(ctx, p, sx, sy, hip, dir, sitting, walking, phase);

  // torso with light from the upper left
  roundRect(ctx, sx - 8.5, top, 17, 20, 6, p.shirt, OUTLINE);
  ctx.save();
  roundRect(ctx, sx - 8.5, top, 17, 20, 6);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(sx + 3, top, 7, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(sx - 8.5, top, 3, 20);
  if (p.stripes) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; for (let k = 3; k < 20; k += 5) ctx.fillRect(sx - 9, top + k, 18, 1.6); }
  ctx.restore();
  // neckline
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  if (p.female) ctx.arc(sx + dir, top + 0.5, 3.5, 0, Math.PI);
  else { ctx.moveTo(sx - 2.5 + dir, top); ctx.lineTo(sx + 2.5 + dir, top); ctx.lineTo(sx + dir, top + 4); }
  ctx.fill();

  if (p.barber) drawApron(ctx, p, sx, top);
  if (p.cape) drawCape(ctx, p, sx, top);
  else drawArms(ctx, p, sx, top, dir, walking, phase, t);

  // neck + head
  ctx.fillStyle = shade(p.skin, -0.12); ctx.fillRect(hx - 2.5, hy + 5, 5, 4);
  circle(ctx, hx - dir * 6.3, hy + 1.5, 2.2, p.skin, OUTLINE);           // ear
  ctx.beginPath(); ctx.arc(hx, hy, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = p.skin; ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';                                    // jaw shading
  ctx.beginPath(); ctx.arc(hx, hy, 8.5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill();
  drawFace(ctx, p, hx, hy, dir);
  drawHairFront(ctx, p, hx, hy, dir);
  drawBeard(ctx, p, hx, hy, dir);
  if (p.towel) {
    roundRect(ctx, hx - 9.5, hy - 10, 19, 10, 5, '#f8f9fa', OUTLINE);
    ctx.fillStyle = '#dee2e6'; ctx.fillRect(hx - 8, hy - 5, 16, 1.2);
  }
  ctx.restore();
}

function drawLegs(ctx, p, sx, sy, hip, dir, sitting, walking, phase) {
  const legCol = p.dress ? shade(p.skin, -0.05) : p.pants;
  const shoe = p.shoes || '#2a2230';
  if (sitting) {
    roundRect(ctx, sx - 6 + dir * 2, hip - 1, 6, 5, 2, legCol, OUTLINE);
    roundRect(ctx, sx + 0.5 + dir * 2, hip - 1, 6, 5, 2, legCol, OUTLINE);
    roundRect(ctx, sx - 5.5 + dir * 4, hip + 2, 4.5, 11, 2, legCol, OUTLINE);
    roundRect(ctx, sx + 1 + dir * 4, hip + 2, 4.5, 11, 2, legCol, OUTLINE);
    roundRect(ctx, sx - 6.5 + dir * 5, hip + 12, 6, 3.5, 1.5, shoe, OUTLINE);
    roundRect(ctx, sx + 0.5 + dir * 5, hip + 12, 6, 3.5, 1.5, shoe, OUTLINE);
  } else {
    const s = walking ? Math.sin(phase) * 3 : 0;
    roundRect(ctx, sx - 5.5, hip, 5, sy - hip - 2 + s * 0.4, 2, legCol, OUTLINE);
    roundRect(ctx, sx + 0.5, hip, 5, sy - hip - 2 - s * 0.4, 2, legCol, OUTLINE);
    roundRect(ctx, sx - 6.5 + s * 0.6 + dir, sy - 3.5 + s * 0.4, 6.5, 3.5, 1.7, shoe, OUTLINE);
    roundRect(ctx, sx + 0.5 - s * 0.6 + dir, sy - 3.5 - s * 0.4, 6.5, 3.5, 1.7, shoe, OUTLINE);
  }
  if (p.dress) {
    ctx.beginPath();
    ctx.moveTo(sx - 8, hip - 2); ctx.lineTo(sx + 8, hip - 2);
    ctx.lineTo(sx + 10, hip + (sitting ? 5 : 8)); ctx.lineTo(sx - 10, hip + (sitting ? 5 : 8));
    ctx.closePath();
    ctx.fillStyle = shade(p.shirt, -0.15); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
}

function drawApron(ctx, p, sx, top) {
  const col = p.owner ? '#1b1b1f' : '#f4f6f8';
  roundRect(ctx, sx - 6.5, top + 4, 13, 17, 3, col, OUTLINE);
  ctx.strokeStyle = col; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sx - 5, top + 5); ctx.lineTo(sx - 3, top); ctx.moveTo(sx + 5, top + 5); ctx.lineTo(sx + 3, top); ctx.stroke();
  roundRect(ctx, sx - 4.5, top + 12, 9, 5, 1.5, p.owner ? '#2c2c33' : '#dde3ea');   // pocket
  ctx.fillStyle = '#9aa3ad'; ctx.fillRect(sx - 3, top + 9.5, 1, 4); ctx.fillRect(sx - 1.3, top + 9.5, 1, 4); // comb & scissors
  if (p.owner) {
    ctx.fillStyle = '#f1c453'; ctx.font = 'bold 4.5px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CANI', sx, top + 8.5);
    ctx.fillStyle = '#f1c453'; ctx.fillRect(sx - 6.5, top + 19.5, 13, 1.2);
  }
}

function drawCape(ctx, p, sx, top) {
  ctx.beginPath();
  ctx.moveTo(sx - 4, top);
  ctx.lineTo(sx + 4, top);
  ctx.quadraticCurveTo(sx + 12, top + 10, sx + 14, top + 22);
  ctx.lineTo(sx - 14, top + 22);
  ctx.quadraticCurveTo(sx - 12, top + 10, sx - 4, top);
  ctx.closePath();
  const col = p.capeColor || '#2b2d42';
  ctx.fillStyle = col; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  for (let k = -14; k <= 14; k += 4) { ctx.beginPath(); ctx.moveTo(sx + k * 0.3, top); ctx.lineTo(sx + k, top + 22); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = OUTLINE; ctx.stroke();
  roundRect(ctx, sx - 4.5, top - 1, 9, 3, 1.5, '#f8f9fa');   // neck strip
}

function drawArms(ctx, p, sx, top, dir, walking, phase, t) {
  const armSwing = walking ? Math.sin(phase) * 3 : 0;
  roundRect(ctx, sx - 11.5, top + 2 + armSwing, 4.5, 12, 2, shade(p.shirt, -0.05), OUTLINE);
  circle(ctx, sx - 9.3, top + 15 + armSwing, 2.3, p.skin, OUTLINE);
  if (p.working) {
    ctx.save();
    ctx.translate(sx + 8.5, top + 3);
    ctx.rotate(-dir * 0.95);
    roundRect(ctx, -2, 0, 4.5, 12, 2, shade(p.shirt, -0.05), OUTLINE);
    circle(ctx, 0.2, 13, 2.3, p.skin, OUTLINE);
    const snip = Math.sin(t * 18) * 0.35;
    ctx.strokeStyle = '#d0d5db'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 14); ctx.lineTo(-2 - snip * 4, 21);
    ctx.moveTo(0, 14); ctx.lineTo(2 + snip * 4, 21);
    ctx.stroke();
    ctx.restore();
  } else {
    roundRect(ctx, sx + 7, top + 2 - armSwing, 4.5, 12, 2, shade(p.shirt, -0.2), OUTLINE);
    circle(ctx, sx + 9.2, top + 15 - armSwing, 2.3, shade(p.skin, -0.06), OUTLINE);
  }
}

function drawFace(ctx, p, hx, hy, dir) {
  const fx = hx + dir * 2.2;
  const angry = p.mood === 'angry', happy = p.mood === 'happy';
  // eyes
  ctx.fillStyle = '#1d1520';
  for (const ex of [fx - 2.9, fx + 2.9]) {
    ctx.beginPath(); ctx.ellipse(ex, hy + 0.2, 1.25, happy ? 1.1 : 1.7, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(fx - 3.3, hy - 0.9, 0.8, 0.8); ctx.fillRect(fx + 2.5, hy - 0.9, 0.8, 0.8);
  // eyebrows
  ctx.strokeStyle = shade(p.hair || '#333', -0.2); ctx.lineWidth = 1.1;
  ctx.beginPath();
  if (angry) { ctx.moveTo(fx - 4.3, hy - 3.8); ctx.lineTo(fx - 1.6, hy - 2.6); ctx.moveTo(fx + 4.3, hy - 3.8); ctx.lineTo(fx + 1.6, hy - 2.6); }
  else { ctx.moveTo(fx - 4.2, hy - 3); ctx.lineTo(fx - 1.7, hy - 3.4); ctx.moveTo(fx + 1.7, hy - 3.4); ctx.lineTo(fx + 4.2, hy - 3); }
  ctx.stroke();
  // nose
  ctx.strokeStyle = shade(p.skin, -0.28); ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(fx + dir * 0.8, hy + 0.8); ctx.lineTo(fx + dir * 1.8, hy + 2.6); ctx.lineTo(fx + dir * 0.4, hy + 2.8); ctx.stroke();
  // cheeks
  if (p.female || happy) {
    ctx.fillStyle = 'rgba(240,110,120,0.3)';
    ctx.beginPath(); ctx.ellipse(fx - 4.2, hy + 2.8, 1.8, 1.1, 0, 0, Math.PI * 2); ctx.ellipse(fx + 4.2, hy + 2.8, 1.8, 1.1, 0, 0, Math.PI * 2); ctx.fill();
  }
  // mouth
  ctx.strokeStyle = '#6b2e2a'; ctx.lineWidth = 1;
  ctx.beginPath();
  if (happy) { ctx.arc(fx, hy + 3.3, 2.4, 0.15 * Math.PI, 0.85 * Math.PI); }
  else if (angry) { ctx.arc(fx, hy + 6.5, 2.2, 1.2 * Math.PI, 1.8 * Math.PI); }
  else { ctx.moveTo(fx - 1.5, hy + 4.8); ctx.lineTo(fx + 1.5, hy + 4.8); }
  ctx.stroke();
  if (p.female) {
    ctx.fillStyle = 'rgba(200,60,80,0.55)';
    ctx.beginPath(); ctx.ellipse(fx, hy + 4.9, 1.6, 0.8, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function hairFill(ctx, p) {
  ctx.fillStyle = p.hair;
  ctx.strokeStyle = shade(p.hair, -0.35);
  ctx.lineWidth = 1;
}

function drawHairBack(ctx, p, hx, hy, dir) {
  hairFill(ctx, p);
  const len = p.groomed ? 0 : 3;
  ctx.beginPath();
  switch (p.hairStyle) {
    case 3:  ctx.ellipse(hx - dir * 2, hy + 4, 9, 10 + len, 0, 0, Math.PI * 2); break;               // shoulder-length
    case 10: roundRect(ctx, hx - 10, hy - 6, 20, 22 + len, 7); break;                                  // long straight
    case 11: ctx.ellipse(hx - dir * 10, hy + 3, 3.8, 9 + len, dir * 0.25, 0, Math.PI * 2); break;       // ponytail
    case 13: roundRect(ctx, hx - 10, hy - 6, 20, 14, 6); break;                                         // bob
    case 14: for (const [dx, dy, r] of [[-8, 4, 6], [8, 4, 6], [-7, 11, 5.5], [7, 11, 5.5], [0, 12, 6]]) { ctx.moveTo(hx + dx + r, hy + dy + len); ctx.arc(hx + dx, hy + dy + len, r, 0, Math.PI * 2); } break;
  }
  ctx.fill(); ctx.stroke();
}

function drawHairFront(ctx, p, hx, hy, dir) {
  hairFill(ctx, p);
  const cap = (r, a0 = Math.PI, a1 = 2 * Math.PI, dy = -1) => {
    ctx.beginPath(); ctx.arc(hx, hy + dy, r, a0, a1); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  switch (p.hairStyle) {
    case 0: // short
      cap(8.9);
      ctx.fillRect(hx - dir * 7.6 - 1, hy - 2, 2.2, 5);
      break;
    case 1: // quiff
      cap(8.9);
      ctx.beginPath(); ctx.ellipse(hx + dir * 2.5, hy - 9.5, 6, 4, dir * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 2: // curly
      for (const [dx, dy, r] of [[-6, -4, 4.5], [-2, -8, 5], [3, -8, 5], [7, -4, 4.5], [0, -5, 5]]) {
        ctx.beginPath(); ctx.arc(hx + dx, hy + dy, r + (p.groomed ? 0 : 1.2), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      break;
    case 3: // shoulder-length
      cap(9.2);
      ctx.beginPath(); ctx.ellipse(hx + dir * 3, hy - 5, 6, 3, dir * 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 4: // bald
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(hx - 2, hy - 5.5, 3, 1.6, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.hair; ctx.fillRect(hx - dir * 7.8 - 1, hy - 1, 2, 4);
      break;
    case 10: // long straight
      cap(9.2);
      ctx.beginPath(); ctx.moveTo(hx - dir * 9, hy - 1); ctx.quadraticCurveTo(hx + dir * 2, hy - 8, hx + dir * 8.5, hy - 1);
      ctx.lineTo(hx + dir * 9, hy - 6); ctx.fill();
      break;
    case 11: // ponytail
      cap(9);
      ctx.fillStyle = '#e63946'; ctx.fillRect(hx - dir * 9 - 1.5, hy - 5, 3, 3);
      break;
    case 12: // bun
      cap(9);
      hairFill(ctx, p);
      ctx.beginPath(); ctx.arc(hx - dir * 1, hy - 11, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 13: // bob with fringe
      cap(9.4);
      ctx.fillRect(hx - 8, hy - 4.5, 16, 2.5);
      break;
    case 14: // long curly
      for (const [dx, dy, r] of [[-5, -6, 5], [1, -8, 5.2], [6, -5, 4.8]]) {
        ctx.beginPath(); ctx.arc(hx + dx, hy + dy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      break;
    default: { // fade
      cap(8.7, Math.PI * 1.08, Math.PI * 1.92, -2);
      ctx.fillStyle = shade(p.hair, 0.3); ctx.globalAlpha *= 0.55;
      ctx.beginPath(); ctx.arc(hx, hy, 8.6, Math.PI * 0.95, Math.PI * 1.1); ctx.arc(hx, hy, 8.6, Math.PI * 1.9, Math.PI * 2.05); ctx.fill();
      ctx.globalAlpha /= 0.55;
    }
  }
  if (!p.groomed && p.hairStyle !== 4) {
    // unkempt strands before the haircut
    ctx.strokeStyle = p.hair; ctx.lineWidth = 1.5;
    const r1 = p.hairStyle === 2 || p.hairStyle === 14 ? 12 : 8.5;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.08 + i * 0.14);
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(a) * r1, hy - 2 + Math.sin(a) * r1);
      ctx.lineTo(hx + Math.cos(a + 0.15) * (r1 + 4), hy - 2 + Math.sin(a + 0.15) * (r1 + 4));
      ctx.stroke();
    }
  } else if (p.hairStyle !== 4) {
    // fresh-cut shine
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(hx, hy - 1, 6.5, Math.PI * 1.25, Math.PI * 1.55); ctx.stroke();
  }
}

function drawBeard(ctx, p, hx, hy, dir) {
  if (!p.beard) return;
  ctx.fillStyle = p.hair;
  ctx.globalAlpha *= 0.95;
  ctx.beginPath();
  if (!p.groomed) {
    ctx.arc(hx + dir * 1.2, hy + 2.5, 7.4, 0.02 * Math.PI, 0.98 * Math.PI);
    ctx.lineTo(hx + dir * 1.2, hy + 12);
  } else {
    ctx.arc(hx + dir * 1.2, hy + 3, 6.6, 0.12 * Math.PI, 0.88 * Math.PI);
  }
  ctx.closePath(); ctx.fill();
  // keep the mouth visible
  ctx.strokeStyle = '#6b2e2a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx + dir * 2.2 - 1.5, hy + 4.8); ctx.lineTo(hx + dir * 2.2 + 1.5, hy + 4.8); ctx.stroke();
  ctx.globalAlpha /= 0.95;
}
