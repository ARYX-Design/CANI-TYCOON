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

  barberPole(ctx, x, y, t) {
    box(ctx, x + 0.35, y + 0.35, 0.3, 0.3, 0, 6, '#444');
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
      ctx.fillStyle = i % 2 ? '#d62828' : '#1d4e89';
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(b.x - w / 2 + 2, b.y - h, 2, h);
    ctx.restore();
    circle(ctx, b.x, b.y - h - 2, 5, '#c0c0c0');
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
    const hue = (t * 40) % 360;
    box(ctx, x + 0.1, y + 0.45, 0.8, 0.06, 21, 32, '#111', { left: `hsl(${hue},55%,55%)` });
    const p = iso(x + 0.5, y + 0.51, 37);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⚽', p.x, p.y + 2);
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

// ---------- People ----------

function drawPerson(ctx, p, sx, sy, t) {
  const alpha = p.alpha === undefined ? 1 : p.alpha;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const dir = p.dir || 1;
  const sitting = p.sitting;
  const walking = p.moving && !sitting;
  const phase = (p.walkT || 0) * 10;
  const bob = walking ? Math.abs(Math.sin(phase)) * 1.5 : Math.sin(t * 2 + (p.id || 0)) * 0.4;
  const baseY = sy - (sitting ? 14 : 0);

  ellipse(ctx, sx, sy, 10, 4.5, 'rgba(0,0,0,0.22)');

  // legs
  ctx.fillStyle = p.pants;
  if (sitting) {
    ctx.fillRect(sx - 6, baseY - 4, 5, 4);
    ctx.fillRect(sx + 1, baseY - 4, 5, 4);
    ctx.fillRect(sx - 6 + dir * 2, baseY - 1, 4, 9);
    ctx.fillRect(sx + 1 + dir * 2, baseY - 1, 4, 9);
  } else {
    const s = walking ? Math.sin(phase) * 3 : 0;
    ctx.fillRect(sx - 5, baseY - 13 - bob, 4, 13 + s * 0.3);
    ctx.fillRect(sx + 1, baseY - 13 - bob, 4, 13 - s * 0.3);
    ctx.fillStyle = '#222';
    ctx.fillRect(sx - 6 + s * 0.5, baseY - 2, 5, 2);
    ctx.fillRect(sx + 1 - s * 0.5, baseY - 2, 5, 2);
  }

  // body
  const bodyTop = baseY - 30 - bob;
  roundRect(ctx, sx - 8, bodyTop, 16, 18, 5, p.shirt);
  if (p.barber) {
    roundRect(ctx, sx - 6, bodyTop + 4, 12, 15, 3, p.owner ? '#1b1b1b' : '#f8f9fa');
    if (p.owner) { ctx.fillStyle = '#f1c453'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CANI', sx, bodyTop + 11); }
  }
  if (p.cape) {
    ctx.beginPath();
    ctx.moveTo(sx - 4, bodyTop + 1);
    ctx.lineTo(sx + 4, bodyTop + 1);
    ctx.lineTo(sx + 13, bodyTop + 21);
    ctx.lineTo(sx - 13, bodyTop + 21);
    ctx.closePath();
    ctx.fillStyle = p.capeColor || '#e8eef5';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.stroke();
  }

  // arms
  if (!p.cape) {
    ctx.fillStyle = p.shirt;
    const armSwing = walking ? Math.sin(phase) * 3 : 0;
    const working = p.working;
    ctx.fillRect(sx - 11, bodyTop + 2 + armSwing, 4, 11);
    if (working) {
      const snip = Math.sin(t * 18) * 2;
      ctx.save();
      ctx.translate(sx + 8, bodyTop + 4);
      ctx.rotate(-dir * 0.9);
      ctx.fillRect(0, 0, 4, 11);
      ctx.fillStyle = p.skin; ctx.fillRect(0, 11, 4, 3);
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(0 + snip * 0.3, 14, 1.5, 6); ctx.fillRect(2.5 - snip * 0.3, 14, 1.5, 6);
      ctx.restore();
    } else {
      ctx.fillRect(sx + 7, bodyTop + 2 - armSwing, 4, 11);
      ctx.fillStyle = p.skin;
      ctx.fillRect(sx + 7, bodyTop + 13 - armSwing, 4, 3);
    }
    ctx.fillStyle = p.skin;
    ctx.fillRect(sx - 11, bodyTop + 13 + armSwing, 4, 3);
  }

  // head
  const hx = sx, hy = bodyTop - 7;
  ctx.fillStyle = p.skin; ctx.fillRect(hx - 2.5, hy + 5, 5, 4);
  circle(ctx, hx, hy, 8, p.skin);
  // eyes
  ctx.fillStyle = '#1b1b1b';
  if (p.mood === 'angry') {
    ctx.fillRect(hx + dir * 2 - 3, hy - 1, 2, 2); ctx.fillRect(hx + dir * 2 + 2, hy - 1, 2, 2);
    ctx.fillRect(hx + dir * 2 - 4, hy - 3, 3, 1); ctx.fillRect(hx + dir * 2 + 2, hy - 3, 3, 1);
  } else {
    ctx.fillRect(hx + dir * 2 - 3, hy - 1, 2, 2.5); ctx.fillRect(hx + dir * 2 + 2, hy - 1, 2, 2.5);
  }
  // mouth
  ctx.strokeStyle = '#6b2e1f'; ctx.lineWidth = 1;
  ctx.beginPath();
  if (p.mood === 'happy') ctx.arc(hx + dir * 2, hy + 2, 2.5, 0.1 * Math.PI, 0.9 * Math.PI);
  else if (p.mood === 'angry') { ctx.moveTo(hx + dir * 2 - 2, hy + 4.5); ctx.lineTo(hx + dir * 2 + 2, hy + 3.5); }
  else { ctx.moveTo(hx + dir * 2 - 1.5, hy + 4); ctx.lineTo(hx + dir * 2 + 1.5, hy + 4); }
  ctx.stroke();

  drawHair(ctx, p, hx, hy, dir);
  if (p.beard && !p.groomed) {
    ctx.fillStyle = p.hair;
    ctx.beginPath(); ctx.arc(hx + dir, hy + 3, 6.5, 0.05 * Math.PI, 0.95 * Math.PI); ctx.fill();
  } else if (p.beard) {
    ctx.fillStyle = p.hair;
    ctx.beginPath(); ctx.arc(hx + dir, hy + 3, 6, 0.2 * Math.PI, 0.8 * Math.PI); ctx.lineTo(hx + dir, hy + 6); ctx.fill();
  }
  if (p.towel) {
    roundRect(ctx, hx - 9, hy - 2, 18, 9, 4, '#f8f9fa');
  }
  ctx.restore();
}

function drawHair(ctx, p, hx, hy, dir) {
  const c = p.hair;
  ctx.fillStyle = c;
  const messy = !p.groomed;
  switch (p.hairStyle) {
    case 0: // short
      ctx.beginPath(); ctx.arc(hx, hy - 1, 8.5, Math.PI, 2 * Math.PI); ctx.fill();
      ctx.fillRect(hx - dir * 8 - (dir > 0 ? 0 : -1), hy - 2, 2, 5);
      break;
    case 1: // mohawk / quiff
      ctx.beginPath(); ctx.arc(hx, hy - 1, 8, Math.PI, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx + dir * 2, hy - 9, 5, 4, dir * 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 2: // afro
      circle(ctx, hx, hy - 5, 10.5, c);
      circle(ctx, hx - 6, hy - 1, 5, c); circle(ctx, hx + 6, hy - 1, 5, c);
      // re-draw face over
      ctx.beginPath(); ctx.arc(hx + dir, hy + 1, 6.5, 0, Math.PI); ctx.fillStyle = p.skin; ctx.fill();
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(hx + dir * 2 - 3, hy - 1, 2, 2.5); ctx.fillRect(hx + dir * 2 + 2, hy - 1, 2, 2.5);
      break;
    case 3: // long
      ctx.beginPath(); ctx.arc(hx, hy - 1, 9, Math.PI, 2 * Math.PI); ctx.fill();
      ctx.fillRect(hx - 9, hy - 1, 4, 13); ctx.fillRect(hx + 5, hy - 1, 4, 13);
      break;
    case 4: // bald with a little side hair
      ctx.fillRect(hx - 8, hy - 2, 2, 4); ctx.fillRect(hx + 6, hy - 2, 2, 4);
      break;
    default: // fade
      ctx.beginPath(); ctx.arc(hx, hy - 2, 8.3, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.fillStyle = shade(c, 0.35); ctx.globalAlpha *= 0.5;
      ctx.beginPath(); ctx.arc(hx, hy, 8.4, Math.PI * 0.95, Math.PI * 1.05); ctx.arc(hx, hy, 8.4, Math.PI * 1.95, Math.PI * 2.05); ctx.fill();
      ctx.globalAlpha /= 0.5;
  }
  if (messy && p.hairStyle !== 4) {
    ctx.strokeStyle = c; ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (1.1 + i * 0.16);
      const r1 = p.hairStyle === 2 ? 13 : 8;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(a) * r1, hy - 2 + Math.sin(a) * r1);
      ctx.lineTo(hx + Math.cos(a + 0.12) * (r1 + 4), hy - 2 + Math.sin(a + 0.12) * (r1 + 4));
      ctx.stroke();
    }
  }
}
