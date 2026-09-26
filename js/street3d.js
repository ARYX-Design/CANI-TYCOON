// The street outside the shop (3D view), modelled on an old-town pedestrian street like Prešernova ulica in Kranj:
// light stone paving, pastel houses with red tiled roofs, café umbrellas, planters, black lanterns,
// and a flow of pedestrians and cyclists that gets busier around midday.

const STREET = {
  east: 1.6,       // east street centre line, measured from the room's east edge
  north: -1.55,    // north street centre line (z)
  south: 3.2,      // how far the east street runs past the room (from n)
  west: -4.9,      // where the north street leaves the scene (x)
  base: 4.7,       // the base reaches this far past the west and north walls
};

const Street = {
  group: null,
  rows: [],        // building rows that hide when they'd block the view: { group, normal }
  lanterns: [],
  traffic: [],
  nextId: 1e6,
  spawnT: 0,
  lastT: 0,
};

const SHOP_SIGNS = ['KAVARNA', 'PEKARNA', 'HOTEL', 'GALERIJA', 'SLAŠČIČARNA', 'APOTEKA', 'CVETLIČARNA', 'KNJIGARNA', 'BUREK'];
const FACADE_COLORS = ['#efe3c8', '#f1dfa0', '#cfe3d0', '#f3efe6', '#edd4c7', '#e8d8b0', '#dfe7ee', '#f2e6d8'];

function hashN(i) { return hash2(i * 17 + 3, i * 31 + 7); }

// ---------- textures ----------

let _paveTex = null;
function paveTexture() {
  if (_paveTex) return _paveTex;
  _paveTex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#c9c6bf'; ctx.fillRect(0, 0, 256, 256);
    // big rectangular stones in running bond, like the photo
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 24 : 0;
      for (let col = -1; col < 6; col++) {
        const x = col * 48 + off, y = row * 32;
        const h = hash2(col + 11, row + 5);
        ctx.fillStyle = shade('#cfccc4', (h - 0.5) * 0.12);
        ctx.fillRect(x + 1.5, y + 1.5, 45, 29);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 1.5, y + 1.5, 45, 3);
      }
    }
    ctx.fillStyle = 'rgba(90,85,78,0.35)';
    for (let i = 0; i < 40; i++) ctx.fillRect(hash2(i, 3) * 256, hash2(3, i) * 256, 2, 2);
  });
  _paveTex.wrapS = _paveTex.wrapT = THREE.RepeatWrapping;
  return _paveTex;
}

const _facades = new Map();
function facadeTexture(i, floors, widthUnits) {
  const key = `${i}|${floors}|${widthUnits.toFixed(2)}`;
  if (_facades.has(key)) return _facades.get(key);
  const W = Math.round(widthUnits * 64), H = floors * 72 + 90;
  const base = FACADE_COLORS[i % FACADE_COLORS.length];
  const sign = SHOP_SIGNS[i % SHOP_SIGNS.length];
  const hotel = sign === 'HOTEL';
  const tex = canvasTex(W, H, (ctx) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    // plaster texture
    for (let k = 0; k < 160; k++) { ctx.fillStyle = `rgba(0,0,0,${hashN(k + i) * 0.04})`; ctx.fillRect(hash2(k, i) * W, hash2(i, k) * H, 3, 3); }
    // cornice & floor bands
    ctx.fillStyle = shade(base, -0.12); ctx.fillRect(0, 0, W, 8);
    for (let f = 1; f <= floors; f++) { ctx.fillStyle = shade(base, -0.07); ctx.fillRect(0, H - 90 - (f - 1) * 72 - 4, W, 4); }
    // upper floor windows
    const cols = Math.max(2, Math.floor(W / 58));
    const shutters = hashN(i + 5) > 0.5;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * W / cols, y = 16 + f * 72;
      ctx.fillStyle = '#fbfaf5'; ctx.fillRect(cx - 14, y - 2, 28, 50);
      const g = ctx.createLinearGradient(cx - 11, y, cx + 11, y + 44);
      g.addColorStop(0, '#6f8faf'); g.addColorStop(0.5, '#3a4f66'); g.addColorStop(1, '#8fb0cf');
      ctx.fillStyle = g; ctx.fillRect(cx - 11, y + 1, 22, 44);
      ctx.fillStyle = '#fbfaf5'; ctx.fillRect(cx - 1, y + 1, 2, 44); ctx.fillRect(cx - 11, y + 18, 22, 2);
      ctx.fillStyle = shade(base, -0.2); ctx.fillRect(cx - 16, y - 6, 32, 4);   // window cap
      if (shutters) { ctx.fillStyle = '#4f6b4a'; ctx.fillRect(cx - 22, y, 7, 46); ctx.fillRect(cx + 15, y, 7, 46); }
    }
    if (hotel) {
      // red vertical banners like the hotel in the photo
      for (const bx of [W * 0.2, W * 0.78]) {
        ctx.fillStyle = '#b3202a'; ctx.fillRect(bx - 9, 20, 18, H - 120);
        ctx.fillStyle = '#f1c453'; ctx.font = 'bold 12px serif'; ctx.textAlign = 'center';
        'HOTEL'.split('').forEach((ch, k) => ctx.fillText(ch, bx, 44 + k * 18));
      }
    }
    // ground floor shop front
    const gy = H - 86;
    ctx.fillStyle = shade(base, -0.1); ctx.fillRect(0, gy, W, 86);
    const awning = ['#8c1c13', '#2a5c45', '#1d3557', '#6a4c93', '#b5522f'][i % 5];
    ctx.fillStyle = '#243240';
    ctx.fillRect(W * 0.08, gy + 26, W * 0.38, 56);
    ctx.fillRect(W * 0.56, gy + 26, W * 0.36, 56);
    ctx.fillStyle = 'rgba(255,230,180,0.35)'; ctx.fillRect(W * 0.1, gy + 30, W * 0.34, 20);
    ctx.fillStyle = '#5c3d2e'; ctx.fillRect(W * 0.47, gy + 22, W * 0.08, 64);
    ctx.fillStyle = awning; ctx.fillRect(0, gy + 4, W, 16);
    for (let x = 0; x < W; x += 16) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, gy + 4, 8, 16); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sign, W / 2, gy + 13);
  });
  const m = new THREE.MeshLambertMaterial({ map: tex });
  _facades.set(key, m);
  return m;
}

// ---------- models ----------

function roofMesh(width, depth, height, color) {
  const sh = new THREE.Shape();
  sh.moveTo(-depth / 2 - 0.15, 0); sh.lineTo(depth / 2 + 0.15, 0); sh.lineTo(0, height); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: width + 0.1, bevelEnabled: false });
  const m = mesh(geo, mat(color));
  m.rotation.y = Math.PI / 2;
  return m;
}

// A house: facade texture on `front` ('z+' faces the north street, 'x+' faces the shop side)
function house(i, width, depth, floors, front) {
  const g = new THREE.Group();
  const h = floors * 0.95 + 1.15;
  const plain = mat(shade(FACADE_COLORS[i % FACADE_COLORS.length], -0.05));
  const face = facadeTexture(i, floors, front === 'z+' ? width : depth);
  const mats = [plain, plain, mat('#8a4b32'), plain, plain, plain];
  mats[front === 'z+' ? 4 : 0] = face;
  const body = mesh(new THREE.BoxGeometry(width, h, depth), mats);
  body.position.set(width / 2, h / 2, depth / 2);
  g.add(body);
  const roofColor = ['#b5522f', '#a8472a', '#c0603a', '#9c4127'][i % 4];
  const roof = roofMesh(front === 'z+' ? width : depth, front === 'z+' ? depth : width, 0.9 + hashN(i) * 0.3, roofColor);
  if (front === 'z+') roof.position.set(-0.05, h, depth / 2);
  else { roof.rotation.y = 0; roof.position.set(width / 2, h, -0.05); }
  g.add(roof);
  // dormers and chimney
  if (hashN(i + 9) > 0.4) {
    const ch = mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), mat('#8d6e63'));
    ch.position.set(width * 0.7, h + 0.55, depth * 0.35);
    g.add(ch);
  }
  if (SHOP_SIGNS[i % SHOP_SIGNS.length] === 'HOTEL' && front === 'z+') {
    // flags on poles over the street
    for (const [fx, kind] of [[width * 0.35, 'si'], [width * 0.55, 'eu']]) {
      const pole = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), mat('#333'), false);
      pole.rotation.x = Math.PI / 3;
      pole.position.set(fx, h * 0.62, depth + 0.35);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.33), new THREE.MeshLambertMaterial({ map: flagTexture(kind), side: THREE.DoubleSide }));
      flag.position.set(fx + 0.26, h * 0.62 + 0.28, depth + 0.6);
      flag.rotation.y = Math.PI / 2;
      g.add(pole, flag);
      Street.flags = Street.flags || [];
      Street.flags.push(flag);
    }
  }
  return g;
}

const _flags = {};
function flagTexture(kind) {
  if (_flags[kind]) return _flags[kind];
  _flags[kind] = canvasTex(96, 64, (ctx) => {
    if (kind === 'si') {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 96, 22);
      ctx.fillStyle = '#0033a0'; ctx.fillRect(0, 21, 96, 22);
      ctx.fillStyle = '#e1251b'; ctx.fillRect(0, 42, 96, 22);
      ctx.fillStyle = '#0033a0'; ctx.fillRect(18, 10, 16, 20);
      ctx.strokeStyle = '#e1251b'; ctx.lineWidth = 2; ctx.strokeRect(18, 10, 16, 20);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(20, 26); ctx.lineTo(26, 16); ctx.lineTo(32, 26); ctx.fill();
    } else {
      ctx.fillStyle = '#003399'; ctx.fillRect(0, 0, 96, 64);
      ctx.fillStyle = '#ffcc00';
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.beginPath(); ctx.arc(48 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, 2.6, 0, 7); ctx.fill(); }
    }
  });
  return _flags[kind];
}

function lantern(g, x, z) {
  const post = new THREE.Group();
  const black = mat('#1b1b1f', { shiny: 40 });
  const base = mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.2, 8), black);
  base.position.y = 0.1;
  const pole = mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.1, 8), black);
  pole.position.y = 1.15;
  const cap = mesh(new THREE.ConeGeometry(0.17, 0.16, 4), black);
  cap.position.y = 2.62; cap.rotation.y = Math.PI / 4;
  const glass = mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.3, 4), new THREE.MeshLambertMaterial({ color: 0xfff2cc, emissive: 0x000000 }), false);
  glass.position.y = 2.4; glass.rotation.y = Math.PI / 4;
  post.add(base, pole, cap, glass);
  post.position.set(x, 0, z);
  g.add(post);
  Street.lanterns.push(glass);
}

function planter(g, x, z, flowers) {
  const p = new THREE.Group();
  const box = mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), mat('#55595e'));
  box.position.y = 0.25;
  const soil = mesh(new THREE.BoxGeometry(0.56, 0.02, 0.56), mat('#3b2a1e'), false);
  soil.position.y = 0.5;
  p.add(box, soil);
  const greens = ['#2d6a4f', '#40916c', '#52b788'];
  for (let k = 0; k < 4; k++) ball(p, (k % 2 - 0.5) * 0.25, 0.62 / U + k * 3, (Math.floor(k / 2) - 0.5) * 0.25, 0.2, greens[k % 3]);
  if (flowers) for (let k = 0; k < 6; k++) ball(p, (hash2(k, 1) - 0.5) * 0.5, 0.78 / U, (hash2(1, k) - 0.5) * 0.5, 0.05, k % 2 ? '#ff8fab' : '#ffffff');
  p.position.set(x, 0, z);
  g.add(p);
}

function cafe(g, x, z, color) {
  const c = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 6), mat('#6b5b4b'));
  pole.position.y = 1.0;
  const umb = mesh(new THREE.ConeGeometry(0.95, 0.38, 8, 1, true), mat(color, { side: true }));
  umb.position.y = 2.05;
  const table = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 14), mat('#e9ecef'));
  table.position.y = 0.72;
  const leg = mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.7, 6), mat('#333'));
  leg.position.y = 0.36;
  c.add(pole, umb, table, leg);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + 0.4;
    const ch = new THREE.Group();
    const seat = mesh(new THREE.BoxGeometry(0.28, 0.04, 0.28), mat('#3d405b'));
    seat.position.y = 0.45;
    const back = mesh(new THREE.BoxGeometry(0.28, 0.32, 0.03), mat('#3d405b'));
    back.position.set(0, 0.62, -0.13);
    for (const [lx, lz] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) {
      const l = mesh(new THREE.BoxGeometry(0.025, 0.45, 0.025), mat('#222'), false);
      l.position.set(lx, 0.225, lz);
      ch.add(l);
    }
    ch.add(seat, back);
    ch.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
    ch.rotation.y = -a - Math.PI / 2;
    c.add(ch);
  }
  c.position.set(x, 0, z);
  g.add(c);
}

function bicycle(color) {
  const b = new THREE.Group();
  const tire = mat('#1a1a1a'), frame = mat(color, { shiny: 60 });
  for (const z of [-0.36, 0.36]) {
    const w = mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 18), tire);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, 0.24, z);
    b.add(w);
  }
  const bar = (len, x, y, z, rx) => { const m = mesh(new THREE.BoxGeometry(0.03, 0.03, len), frame); m.position.set(x, y, z); m.rotation.x = rx; b.add(m); };
  bar(0.62, 0, 0.5, 0.02, 0.15);
  bar(0.45, 0, 0.36, -0.15, -0.9);
  bar(0.42, 0, 0.38, 0.22, 0.9);
  const post = mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), frame); post.position.set(0, 0.45, -0.12); b.add(post);
  const seat = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.18), mat('#2b2118')); seat.position.set(0, 0.61, -0.14); b.add(seat);
  const stem = mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), frame); stem.position.set(0, 0.56, 0.34); b.add(stem);
  const hb = mesh(new THREE.BoxGeometry(0.42, 0.03, 0.03), mat('#333')); hb.position.set(0, 0.71, 0.32); b.add(hb);
  const basket = mesh(new THREE.BoxGeometry(0.26, 0.16, 0.2), mat('#a0692f')); basket.position.set(0, 0.62, 0.48); b.add(basket);
  return b;
}

function aFrameSign(g, x, z, rotY) {
  const s = new THREE.Group();
  const tex = canvasTex(128, 192, (ctx) => {
    ctx.fillStyle = '#1b1b1f'; ctx.fillRect(0, 0, 128, 192);
    ctx.strokeStyle = '#f1c453'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 116, 180);
    ctx.fillStyle = '#e63946'; ctx.font = 'bold 36px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CANI', 64, 52);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Fredoka, sans-serif'; ctx.fillText('BARBER SHOP', 64, 78);
    ctx.font = '38px serif'; ctx.fillText('✂', 64, 128);
    ctx.fillStyle = '#f1c453'; ctx.font = 'bold 16px Fredoka, sans-serif'; ctx.fillText('ODPRTO · OPEN', 64, 168);
  });
  const face = new THREE.MeshLambertMaterial({ map: tex });
  const dark = mat('#1b1b1f');
  for (const side of [-1, 1]) {
    const board = mesh(new THREE.BoxGeometry(0.44, 0.66, 0.025), [dark, dark, dark, dark, face, face]);
    board.position.set(0, 0.32, side * 0.1);
    board.rotation.x = side * 0.28;
    s.add(board);
  }
  s.position.set(x, 0, z);
  s.rotation.y = rotY;
  g.add(s);
}

// ---------- build ----------

function buildStreet(roomGroup, n, st) {
  const g = Street.group = new THREE.Group();
  roomGroup.add(g);
  Street.rows = [];
  Street.lanterns = [];
  Street.flags = [];
  Street.traffic.forEach(a => { disposeGroup(a.mesh); if (a.bikeMesh) disposeGroup(a.bikeMesh); });
  Street.traffic = [];
  if (R3.slab) R3.slab.visible = false;

  const x0 = -STREET.base, z0 = -STREET.base, x1 = n + STREET.south, z1 = n + STREET.south;
  // base with paving on top
  const pave = paveTexture().clone();
  pave.needsUpdate = true;
  pave.repeat.set((x1 - x0) / 2, (z1 - z0) / 2);
  const side = mat('#2e3148'), dark = mat('#23263a');
  const base = mesh(new THREE.BoxGeometry(x1 - x0, 0.6, z1 - z0), [dark, side, new THREE.MeshLambertMaterial({ map: pave }), side, side, side], false);
  base.position.set((x0 + x1) / 2, -0.315, (z0 + z1) / 2);
  base.receiveShadow = true;
  g.add(base);
  if (R3.plaque) { R3.plaque.position.set(n / 2, -0.3, z1 + 0.003); }
  // curb / gutter lines along the streets
  const gutter = mat('#9a978f');
  const gz = mesh(new THREE.BoxGeometry(x1 - x0, 0.01, 0.12), gutter, false);
  gz.position.set((x0 + x1) / 2, -0.008, STREET.north - 0.02);
  const gx = mesh(new THREE.BoxGeometry(0.12, 0.01, z1 - STREET.north), gutter, false);
  gx.position.set(n + STREET.east, -0.008, (STREET.north + z1) / 2);
  g.add(gz, gx);

  // north row of houses across the street
  const north = new THREE.Group();
  let x = x0, i = 0;
  while (x < x1 - 0.5) {
    const w = Math.min(x1 - x, 2.6 + hashN(i + st.size) * 1.6);
    const floors = 2 + (hashN(i + 3) > 0.45 ? 1 : 0);
    const h = house(i + st.size, w, 1.7, floors, 'z+');
    h.position.set(x, 0, z0);
    north.add(h);
    x += w; i++;
  }
  g.add(north);
  Street.rows.push({ group: north, normal: [0, -1] });

  // west neighbours, wall to wall with the shop
  const west = new THREE.Group();
  let z = 0; i = 20;
  while (z < n - 0.5) {
    const d = Math.min(n - z, 2.8 + hashN(i) * 1.4);
    const h = house(i, 1.7, d, 2, 'x+');
    h.position.set(-1.95, 0, z);
    west.add(h);
    z += d; i++;
  }
  g.add(west);
  Street.rows.push({ group: west, normal: [-1, 0] });

  // street furniture
  const ex = n + STREET.east;
  for (let lz = 0.6; lz < n + 2; lz += 3.6) lantern(g, ex + 1.05, lz);
  for (let lx = 0.8; lx < n + 2; lx += 3.8) lantern(g, lx, STREET.north - 1.05);
  for (let pz = 2.2; pz < n; pz += 3.6) planter(g, ex + 1.05, pz, pz % 2 < 1);
  cafe(g, ex + 0.95, n + 1.5, '#f8f4ea');
  cafe(g, 2.2, STREET.north - 0.95, '#f8f4ea');
  cafe(g, 4.4, STREET.north - 0.95, '#f3e9d2');
  planter(g, -0.9, n + 1.2, true);
  planter(g, n - 0.5, n + 1.2, true);
  planter(g, n + 0.9, -0.6, true);
  const parked = bicycle('#c1272d');
  parked.position.set(n + 0.55, 0, n - 1.2);
  parked.rotation.z = 0.12;
  g.add(parked);
  const parked2 = bicycle('#2a9d8f');
  parked2.position.set(0.6, 0, STREET.north - 0.9);
  parked2.rotation.set(0, Math.PI / 2, 0.12);
  g.add(parked2);
  const d = doorTile();
  aFrameSign(g, d.x + 1.3, -0.65, 0.3);
  aFrameSign(g, n + 0.75, n + 0.8, -0.8);
  // bracket sign above the door
  const bracket = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), mat('#1b1b1f'), false);
  bracket.position.set(d.x + 1.05, 2.1, -0.5);
  const sTex = canvasTex(128, 96, (ctx) => {
    ctx.fillStyle = '#1b1b1f'; ctx.fillRect(0, 0, 128, 96);
    ctx.strokeStyle = '#f1c453'; ctx.lineWidth = 4; ctx.strokeRect(5, 5, 118, 86);
    ctx.fillStyle = '#e63946'; ctx.font = 'bold 40px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CANI', 64, 58);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.fillText('BARBER', 64, 80);
  });
  const board = mesh(new THREE.BoxGeometry(0.03, 0.42, 0.56), [new THREE.MeshLambertMaterial({ map: sTex }), new THREE.MeshLambertMaterial({ map: sTex }), mat('#1b1b1f'), mat('#1b1b1f'), mat('#1b1b1f'), mat('#1b1b1f')]);
  board.position.set(d.x + 1.05, 1.82, -0.55);
  g.add(bracket, board);
}

// ---------- traffic ----------

function trafficPath(reverse, off) {
  const n = gridSize();
  const ex = n + STREET.east + off, nz = STREET.north - off;
  const pts = [[ex, n + STREET.south + 0.3], [ex, nz], [STREET.west, nz]];
  if (Math.random() < 0.35) pts.shift();          // some only use the north street
  if (Math.random() < 0.2) pts.pop();             // some turn into the east street from off-screen
  if (pts.length < 2) pts.push([STREET.west, nz]);
  return reverse ? pts.reverse() : pts;
}

function spawnTraffic() {
  const bike = Math.random() < 0.25;
  const p = randomPerson();
  const a = {
    ...p, id: Street.nextId++, alpha: 1, mood: Math.random() < 0.5 ? 'happy' : 'neutral', groomed: true,
    beard: !p.female && Math.random() < 0.3, moving: true, walkT: 0,
    speed: bike ? rand(2.6, 3.4) : rand(0.9, 1.4),
  };
  if (bike) a.bike = 0.03;
  const off = bike ? rand(-0.15, 0.15) : (Math.random() < 0.5 ? 1 : -1) * rand(0.35, 0.75);
  a.path = trafficPath(Math.random() < 0.5, off);
  [a.x, a.y] = a.path.shift();
  a.mesh = buildPerson(a);
  R3.world.add(a.mesh);
  if (bike) {
    a.bikeMesh = bicycle(pick(['#c1272d', '#1d3557', '#2a9d8f', '#f1c453', '#e9ecef', '#264653']));
    R3.world.add(a.bikeMesh);
    if (Math.random() < 0.3) sfx('bell', 0.5);
  }
  Street.traffic.push(a);
}

function updateStreet(t) {
  if (!Street.group) return;
  let dt = Math.min(0.1, t - Street.lastT);
  Street.lastT = t;
  if (Game.paused) dt = 0;
  dt *= Math.min(Game.speed, 2);

  // rows of houses hide when they would stand between the camera and the shop
  const c = Math.cos(VIEW.angle), s = Math.sin(VIEW.angle);
  for (const r of Street.rows) {
    const [nx, nz] = r.normal;
    // hide a row as soon as it starts turning toward the camera (free rotation passes through every angle)
    r.group.visible = (c * nx + s * nz) + (-s * nx + c * nz) <= -0.4;
  }
  // lanterns glow in the evening; flags wave
  const hour = Game.state.time / 60;
  const glow = clamp((hour - 16.5) / 2, 0, 1);
  Street.lanterns.forEach(m => m.material.emissive.setRGB(glow * 1, glow * 0.8, glow * 0.4));
  (Street.flags || []).forEach((f, i) => { f.rotation.y = Math.PI / 2 + Math.sin(t * 2 + i) * 0.15; });

  // spawn walkers and cyclists: busiest around lunchtime
  const busy = Game.nightMode ? 0.15 : 0.3 + 0.7 * Math.exp(-Math.pow((hour - 13) / 4, 2));
  Street.spawnT -= dt;
  if (Street.spawnT <= 0 && Street.traffic.length < 18) {
    spawnTraffic();
    Street.spawnT = rand(0.35, 1.1) / busy;
  }

  for (const a of Street.traffic.slice()) {
    const target = a.path[0];
    if (target) {
      const dx = target[0] - a.x, dy = target[1] - a.y, dist = Math.hypot(dx, dy), step = a.speed * dt;
      if (dist <= step) { a.x = target[0]; a.y = target[1]; a.path.shift(); }
      else { a.x += dx / dist * step; a.y += dy / dist * step; }
      a.walkT += dt * a.speed / 1.8;
      a.moving = dt > 0;
    }
    posePerson(a.mesh, a, t);
    if (a.bikeMesh) { a.bikeMesh.position.set(a.x, 0, a.y); a.bikeMesh.rotation.y = a.mesh.userData.angle; }
    if (!a.path.length) {
      disposeGroup(a.mesh); R3.world.remove(a.mesh);
      if (a.bikeMesh) { disposeGroup(a.bikeMesh); R3.world.remove(a.bikeMesh); }
      Street.traffic.splice(Street.traffic.indexOf(a), 1);
    }
  }
}
