// Real-time 3D renderer (Three.js).
// The orthographic camera sits at the same 2:1 angle as the classic isometric view, so tap picking,
// labels, speech bubbles and effects from the 2D overlay line up exactly with the 3D scene.

const U = 1 / 39.19;               // world units per iso "pixel" of height
const PX = 32 / Math.SQRT1_2;      // screen px per camera unit at zoom 1
const WALL_UNITS = WALL_H * U;
const WALL_PX = 35.78;             // wall texture px per tile (matches the on-screen wall length)

const R3 = {
  ok: false,
  enabled: true,
  active: false,
  renderer: null, scene: null, camera: null, sun: null, hemi: null,
  room: null, roomKey: '',
  lamps: [],
  walls: {},
  items: new Map(),
  people: new Map(),
  piles: new Map(),
  drops: new Map(),
  fx: null,
  lastPaint: -1,
};

try { if (localStorage.getItem('cani-view') === '2d') R3.enabled = false; } catch (e) { /* ignore */ }

// ---------- materials & primitive helpers ----------

const _mats = new Map();
function mat(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  if (!_mats.has(key)) {
    const M = opts.shiny ? THREE.MeshPhongMaterial : THREE.MeshLambertMaterial;
    const o = { color: new THREE.Color(color) };
    if (opts.shiny) o.shininess = opts.shiny;
    if (opts.emissive) o.emissive = new THREE.Color(opts.emissive);
    if (opts.opacity !== undefined) { o.transparent = true; o.opacity = opts.opacity; o.depthWrite = opts.opacity > 0.6; }
    if (opts.side) o.side = THREE.DoubleSide;
    _mats.set(key, new M(o));
  }
  return _mats.get(key);
}

function mesh(geo, material, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// Same signature as the 2D box(): footprint (x0,y0,w,d) in tile units, z0/h in iso pixels
function bx(g, x0, y0, w, d, z0, h, color, opts) {
  const m = mesh(new THREE.BoxGeometry(w, Math.max(0.005, h * U), d), typeof color === 'string' ? mat(color, opts) : color);
  m.position.set(x0 + w / 2, (z0 + h / 2) * U, y0 + d / 2);
  g.add(m);
  return m;
}

function cy(g, cx, cz, rTop, rBot, z0, h, color, seg = 14, opts) {
  const m = mesh(new THREE.CylinderGeometry(rTop, rBot, h * U, seg), typeof color === 'string' ? mat(color, opts) : color);
  m.position.set(cx, (z0 + h / 2) * U, cz);
  g.add(m);
  return m;
}

function ball(g, cx, zpx, cz, r, color, detail = 0, opts) {
  const m = mesh(new THREE.IcosahedronGeometry(r, detail), mat(color, opts));
  m.position.set(cx, zpx * U, cz);
  g.add(m);
  return m;
}

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.userData = { canvas: c, ctx };
  return tex;
}

function disposeGroup(g) {
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}

// ---------- setup ----------

function initR3() {
  if (!window.THREE) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.id = 'game3d';
    document.body.insertBefore(canvas, document.getElementById('game'));
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    R3.renderer = r;
  } catch (e) {
    const c = document.getElementById('game3d');
    if (c) c.remove();
    return;
  }
  R3.scene = new THREE.Scene();
  R3.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
  R3.camera.position.set(c30 * Math.SQRT1_2 * 80, s30 * 80, c30 * Math.SQRT1_2 * 80);
  R3.camera.lookAt(0, 0, 0);

  R3.hemi = new THREE.HemisphereLight(0xe8eeff, 0x4a3f5c, 0.62);
  R3.scene.add(R3.hemi);
  R3.sun = new THREE.DirectionalLight(0xfff4e0, 0.75);
  R3.sun.castShadow = true;
  R3.sun.shadow.mapSize.set(2048, 2048);
  R3.sun.shadow.bias = -0.0008;
  R3.sun.shadow.normalBias = 0.02;
  R3.sun.shadow.radius = 3;
  R3.scene.add(R3.sun, R3.sun.target);

  // everything that belongs to the shop lives in `world`, which turns when the view rotates
  R3.world = new THREE.Group();
  R3.scene.add(R3.world);
  R3.fx = new THREE.Group();
  R3.world.add(R3.fx);
  R3.ok = true;
  setView3D(R3.enabled);
}

function setView3D(on) {
  R3.enabled = on;
  R3.active = R3.ok && on;
  if (!R3.active) { VIEW.angle = VIEW.target = 0; }
  if (R3.renderer) R3.renderer.domElement.style.display = R3.active ? 'block' : 'none';
  document.body.classList.toggle('view3d', R3.active);
  try { localStorage.setItem('cani-view', on ? '3d' : '2d'); } catch (e) { /* ignore */ }
}

function updateCamera3D() {
  const w = Renderer.w, h = Renderer.h, cam = Renderer.cam;
  const s = PX * cam.zoom;
  const c = R3.camera;
  c.left = (-w / 2 - cam.x) / s;
  c.right = (w / 2 - cam.x) / s;
  c.top = (h / 2 + cam.y) / s;
  c.bottom = (-h / 2 + cam.y) / s;
  c.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (R3.renderer.getPixelRatio() !== dpr) R3.renderer.setPixelRatio(dpr);
  const size = R3.renderer.getSize(new THREE.Vector2());
  if (size.x !== w || size.y !== h) R3.renderer.setSize(w, h, false);
  R3.renderer.domElement.style.width = w + 'px';
  R3.renderer.domElement.style.height = h + 'px';
}

// ---------- room: slab, floor, walls, lamps ----------

function buildRoom() {
  const st = stage(), n = st.size;
  const key = Game.state.stage + '|' + n;
  if (key === R3.roomKey) return;
  R3.roomKey = key;
  if (R3.room) { disposeGroup(R3.room); R3.world.remove(R3.room); }
  const g = R3.room = new THREE.Group();
  R3.world.add(g);

  // floating slab
  const slab = mesh(new THREE.BoxGeometry(n + 0.25, 0.56, n + 0.25), [
    mat('#23263a'), mat('#23263a'), mat('#3d405b'), mat('#1a1c2c'), mat('#2e3148'), mat('#2e3148')], false);
  slab.position.set(n / 2 - 0.125, -0.295, n / 2 - 0.125);   // just below the floor to avoid z-fighting
  g.add(slab);
  // name plaque on the front
  const plaqueTex = canvasTex(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#15172a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(241,196,83,0.7)'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#f1c453'; ctx.font = '600 34px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`CANI · ${st.name.toUpperCase()}`, w / 2, h / 2 + 2);
  });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.4), new THREE.MeshBasicMaterial({ map: plaqueTex }));
  plaque.position.set(n / 2, -0.28, n + 0.002);
  g.add(plaque);

  // floor
  const floorTex = canvasTex(n * 64, n * 64, (ctx) => paintFloor(ctx, st, n));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(n, n), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(n / 2, 0, n / 2);
  floor.receiveShadow = true;
  g.add(floor);

  // four walls: the two facing the camera drop to low stubs so you can look inside (see updateWalls)
  const wallTop = shade(st.wall, -0.35), outer = shade(st.wall, -0.3);
  const H = WALL_UNITS;
  const defs = [
    { side: 'left',  size: [0.25, n + 0.5], pos: [-0.125, n / 2], plane: [0.003, n / 2, Math.PI / 2], normal: [-1, 0] },
    { side: 'right', size: [n, 0.25],        pos: [n / 2, -0.125], plane: [n / 2, 0.003, 0], normal: [0, -1] },
    { side: 'east',  size: [0.25, n + 0.5], pos: [n + 0.125, n / 2], plane: [n - 0.003, n / 2, -Math.PI / 2], normal: [1, 0] },
    { side: 'south', size: [n, 0.25],        pos: [n / 2, n + 0.125], plane: [n / 2, n - 0.003, Math.PI], normal: [0, 1] },
  ];
  R3.wallParts = [];
  for (const d of defs) {
    const boxM = mesh(new THREE.BoxGeometry(d.size[0], H, d.size[1]), [mat(outer), mat(outer), mat(wallTop), mat(wallTop), mat(outer), mat(outer)]);
    boxM.position.set(d.pos[0], H / 2, d.pos[1]);
    const tex = canvasTex(Math.round(n * WALL_PX * 2), WALL_H * 2, () => {});
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(n, H), new THREE.MeshLambertMaterial({ map: tex }));
    plane.receiveShadow = true;
    plane.rotation.y = d.plane[2];
    plane.position.set(d.plane[0], H / 2, d.plane[1]);
    g.add(boxM, plane);
    R3.walls[d.side] = tex;
    R3.wallParts.push({ box: boxM, plane, normal: d.normal, h: 1 });
  }
  R3.lastPaint = -1;

  // lamps: real point lights at the wall sconces
  R3.lamps.forEach(l => R3.world.remove(l));
  R3.lamps = [];
  const spots = [];
  if (st.floor === 'concrete') spots.push([2.35, 90, 0.25, 0xdfeaff]);
  else {
    for (let mx = 2; mx < n - 3; mx += 2) spots.push([mx - 0.5, 80, 0.25, 0xffc478]);
    for (let wy = 2.8; wy + 0.2 < n - 5; wy += 3) spots.push([0.25, 80, wy + 1.4, 0xffc478]);
  }
  for (const [x, zpx, z, col] of spots.slice(0, 6)) {
    const L = new THREE.PointLight(col, 0.5, 5.5, 2);
    L.position.set(x, zpx * U, z);
    R3.world.add(L);
    R3.lamps.push(L);
  }

  // sun & shadow frustum follow the room size
  R3.sun.position.set(n / 2 - n * 0.55, n * 1.4 + 6, n / 2 + n * 0.9);
  R3.sun.target.position.set(n / 2, 0, n / 2);
  const sc = R3.sun.shadow.camera;
  sc.left = -n; sc.right = n; sc.top = n; sc.bottom = -n; sc.near = 0.5; sc.far = n * 4 + 20;
  sc.updateProjectionMatrix();

  // furniture meshes are rebuilt for the new room
  R3.items.forEach(o => { disposeGroup(o.group); R3.world.remove(o.group); });
  R3.items.clear();
}

function paintFloor(ctx, st, n) {
  const T = 64;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const h = hash2(x, y);
    let fill, stroke = 'rgba(0,0,0,0.1)';
    switch (st.floor) {
      case 'concrete': fill = shade('#9ea3a8', (h - 0.5) * 0.08); break;
      case 'checker': fill = (x + y) % 2 ? '#2b2d31' : '#f1f1ee'; stroke = 'rgba(0,0,0,0.15)'; break;
      case 'wood': fill = shade('#b98352', (h - 0.5) * 0.14 + (x % 2 ? 0.03 : -0.03)); stroke = 'rgba(80,40,10,0.3)'; break;
      case 'darkwood': fill = shade('#5b3d2b', (h - 0.5) * 0.14 + (y % 2 ? 0.04 : -0.02)); stroke = 'rgba(0,0,0,0.35)'; break;
      default: fill = (x + y) % 2 ? '#ece8df' : '#dcd6ca'; stroke = 'rgba(160,130,60,0.4)';
    }
    ctx.fillStyle = fill; ctx.fillRect(x * T, y * T, T, T);
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(x * T + 1, y * T + 1, T - 2, T - 2);
    if (st.floor === 'wood' || st.floor === 'darkwood') {
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      for (const k of [0.33, 0.66]) { ctx.beginPath(); ctx.moveTo(x * T, y * T + T * k); ctx.lineTo(x * T + T, y * T + T * k); ctx.stroke(); }
    }
    if (st.floor === 'marble' && h > 0.7) {
      ctx.strokeStyle = 'rgba(150,140,120,0.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x * T + 10, y * T + 14); ctx.quadraticCurveTo(x * T + 40, y * T + 30, x * T + 54, y * T + 56); ctx.stroke();
    }
  }
  if (st.floor === 'concrete') {
    ctx.fillStyle = 'rgba(40,40,50,0.25)';
    ctx.beginPath(); ctx.ellipse(3.4 * T, 3.8 * T, 30, 18, 0.4, 0, Math.PI * 2); ctx.fill();
  }
  // ambient occlusion along the walls
  let g = ctx.createLinearGradient(0, 0, 0.7 * T, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 0.7 * T, n * T);
  g = ctx.createLinearGradient(0, 0, 0, 0.7 * T);
  g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, n * T, 0.7 * T);
  // door mat
  const d = doorTile();
  ctx.fillStyle = '#8b2c2c'; ctx.fillRect((d.x + 0.12) * T, 0.1 * T, 0.76 * T, 0.6 * T);
}

// Paint the inside of both walls. Coordinates: u along the wall in px (35.78 per tile), v from the top (0..96).
function paintWalls(t) {
  const st = stage(), n = st.size, H = WALL_H;
  for (const side of ['left', 'right', 'east', 'south']) {
    const tex = R3.walls[side];
    const ctx = tex.userData.ctx, c = tex.userData.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(2, 2);
    const W = n * WALL_PX;
    const at = a => side === 'left' ? (n - a) * WALL_PX : a * WALL_PX;
    ctx.fillStyle = side === 'right' ? st.wall : shade(st.wall, -0.06);
    ctx.fillRect(0, 0, W, H);
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,255,255,0.1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = side === 'left' ? shade(st.wallDark, -0.08) : st.wallDark;
    ctx.fillRect(0, H - 30, W, 30);
    ctx.fillStyle = st.trim; ctx.fillRect(0, H - 31, W, 2);
    ctx.fillStyle = shade(st.wallDark, -0.35); ctx.fillRect(0, H - 4, W, 4);

    const wallAt = (a, fn) => { ctx.save(); ctx.translate(at(a), H); fn(); ctx.restore(); };
    if (side === 'east' || side === 'south') {
      // the walls you only see after rotating: windows onto the street (or a plain garage wall)
      if (st.floor === 'concrete') {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let u = 0; u < W; u += 18) ctx.fillRect(u, 0, 1, H - 30);
        wallAt(side === 'east' ? 1 : n - 3, () => { roundRect(ctx, 0, -86, WALL_PX * 1.4, 26, 3, '#6c757d'); ctx.fillStyle = '#e9ecef'; ctx.font = 'bold 9px Fredoka, sans-serif'; ctx.fillText('NO PARKING', 8, -69); });
      } else {
        for (let wy = 1; wy + 1.6 < n - 0.5; wy += 3) paintWindow(ctx, wy * WALL_PX, (wy + 1.6) * WALL_PX, H, t, st, wy + (side === 'east' ? 7 : 3));
      }
      tex.needsUpdate = true;
      continue;
    }
    if (side === 'left') {
      if (st.floor === 'concrete') {
        const u0 = at(n - 0.4), u1 = at(1.2);
        ctx.fillStyle = '#b3b8bf'; ctx.fillRect(u0, H - 78, u1 - u0, 78);
        ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1;
        for (let z = 6; z < 78; z += 6) { ctx.beginPath(); ctx.moveTo(u0, H - z); ctx.lineTo(u1, H - z); ctx.stroke(); }
        wallAt(n - 0.9, () => {
          ctx.font = 'bold 30px "Permanent Marker", "Fredoka", cursive'; ctx.fillStyle = '#d62828';
          ctx.fillText("CANI'S", 14, -36);
          ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.fillStyle = '#1b1b1b';
          ctx.fillText('BARBER SHOP', 30, -20);
        });
      } else {
        for (let wy = 1.2; wy + 1.6 < n - 5; wy += 3) paintWindow(ctx, at(wy + 1.6), at(wy), H, t, st, wy);
        wallAt(n - 0.6, () => {
          roundRect(ctx, 10, -H + 8, 150, 38, 6, 'rgba(10,10,20,0.9)');
          const off = utilityOff('power');
          if (!off) { ctx.shadowColor = st.trim; ctx.shadowBlur = 10 + Math.sin(t * 3) * 3; }
          ctx.font = 'bold 26px Fredoka, sans-serif';
          ctx.fillStyle = off ? '#555' : st.trim === '#e63946' ? '#ff5d6c' : st.trim;
          ctx.fillText('CANI', 22, -H + 37);
          ctx.shadowBlur = 0;
          ctx.font = 'bold 10px Fredoka, sans-serif'; ctx.fillStyle = off ? '#888' : '#fff';
          ctx.fillText('BARBER CO.', 92, -H + 33);
        });
        for (let wy = 2.8; wy + 0.2 < n - 5; wy += 3) wallAt(wy + 1.4, () => paintSconce(ctx));
      }
    } else {
      // clock
      wallAt(0.6, () => {
        circle(ctx, 18, -72, 13, '#fff', '#333');
        const tm = Game.state.time;
        const hA = ((tm / 60) % 12) / 12 * Math.PI * 2 - Math.PI / 2, mA = (tm % 60) / 60 * Math.PI * 2 - Math.PI / 2;
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(18, -72); ctx.lineTo(18 + Math.cos(hA) * 7, -72 + Math.sin(hA) * 7); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(18, -72); ctx.lineTo(18 + Math.cos(mA) * 10, -72 + Math.sin(mA) * 10); ctx.stroke();
      });
      if (st.floor === 'concrete') {
        wallAt(1.6, () => {
          const w = WALL_PX * 1.5;
          roundRect(ctx, 0, -74, w, 34, 2, '#c8a36a', 'rgba(0,0,0,0.3)');
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          for (let x = 4; x < w; x += 5) for (let y = -70; y < -42; y += 5) ctx.fillRect(x, y, 1, 1);
          ctx.strokeStyle = '#6c757d'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(10, -60, 4, 0, Math.PI * 2); ctx.moveTo(14, -52); ctx.arc(10, -52, 4, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#343a40'; ctx.fillRect(22, -68, 7, 16); ctx.fillStyle = '#adb5bd'; ctx.fillRect(22, -70, 7, 3);
          ctx.fillStyle = '#e63946'; ctx.fillRect(36, -66, 3, 20);
          roundRect(ctx, 44, -64, 6, 14, 2, '#4ea8de');
          roundRect(ctx, 2, -92, w - 4, 5, 2, utilityOff('power') ? '#888' : '#f8f9fa', 'rgba(0,0,0,0.3)');
        });
      } else {
        for (let mx = 2; mx < n - 3; mx += 2) {
          wallAt(mx + 0.2, () => {
            const w = WALL_PX * 0.6;
            roundRect(ctx, 0, -84, w, 44, 6, st.trim);
            const g = ctx.createLinearGradient(0, -82, w, -42);
            g.addColorStop(0, '#dff3ff'); g.addColorStop(0.5, '#a9cbe0'); g.addColorStop(1, '#e8f6ff');
            roundRect(ctx, 3, -81, w - 6, 38, 4, g);
          });
          wallAt(mx - 0.5, () => paintSconce(ctx));
        }
        wallAt(n - 2.9, () => {
          const w = WALL_PX * 0.72;
          roundRect(ctx, 0, -86, w, 50, 2, st.trim);
          roundRect(ctx, 2.5, -83.5, w - 5, 45, 1, '#f7f1e3');
          ctx.fillStyle = '#1b1b1f'; ctx.font = 'bold 6px Fredoka, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('STYLES', w / 2, -76);
          for (const [hx, hy, col] of [[w * 0.3, -64, '#1c1410'], [w * 0.7, -64, '#a0692f'], [w * 0.3, -48, '#6b4226'], [w * 0.7, -48, '#1c1410']]) {
            circle(ctx, hx, hy, 4.5, '#e8b894');
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hx, hy - 1, 4.8, Math.PI, 0); ctx.fill();
          }
          ctx.textAlign = 'left';
        });
      }
      // entrance door
      const d = doorTile();
      const u0 = (d.x + 0.12) * WALL_PX, u1 = (d.x + 0.88) * WALL_PX;
      ctx.fillStyle = st.trim; ctx.fillRect(u0 - 3, H - 70, u1 - u0 + 6, 70);
      ctx.fillStyle = '#5c3d2e'; ctx.fillRect(u0, H - 66, u1 - u0, 66);
      ctx.fillStyle = '#9fd3f2'; ctx.fillRect(u0 + 4, H - 60, u1 - u0 - 8, 34);
      ctx.fillStyle = '#e0b04a'; ctx.fillRect(u1 - 7, H - 34, 3, 6);
      roundRect(ctx, u0 + 3, H - 52, 20, 9, 2, '#fff');
      const open = Game.state.time < CLOSE_TIME;
      ctx.font = 'bold 6px sans-serif'; ctx.fillStyle = open ? '#2a9d8f' : '#d62828';
      ctx.fillText(open ? 'OPEN' : 'CLOSED', u0 + 5, H - 45.5);
    }
    tex.needsUpdate = true;
  }
}

function paintSconce(ctx) {
  roundRect(ctx, -3, -82, 6, 9, 2, '#b08d57', 'rgba(0,0,0,0.3)');
  ctx.fillStyle = utilityOff('power') ? '#777' : '#ffe0a8';
  ctx.beginPath(); ctx.ellipse(0, -84, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
}

function paintWindow(ctx, u0, u1, H, t, st, seed) {
  ctx.fillStyle = st.trim; ctx.fillRect(u0 - 3, H - 85, u1 - u0 + 6, 50);
  const evening = clamp((Game.state.time / 60 - 16) / 3, 0, 1);
  const g = ctx.createLinearGradient(0, H - 82, 0, H - 38);
  g.addColorStop(0, evening > 0.5 ? '#f4a261' : '#8ecae6');
  g.addColorStop(1, evening > 0.5 ? '#6d597a' : '#d7f0fa');
  ctx.fillStyle = g; ctx.fillRect(u0, H - 82, u1 - u0, 44);
  const px = u0 + ((t * 0.12 + seed * 0.37) % 1) * (u1 - u0);
  ctx.fillStyle = 'rgba(40,50,70,0.35)';
  ctx.fillRect(px - 3, H - 58, 6, 18);
  ctx.beginPath(); ctx.arc(px, H - 62, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = st.trim; ctx.fillRect((u0 + u1) / 2 - 1, H - 82, 2, 44);
}

// ---------- furniture models ----------

const SEAT_H = { barberChair: 21, goldChair: 21, waitingChair: 16, bench: 15, sink: 24, colorStation: 22 };

const Models = {
  barberChair(g, gold) {
    const seat = gold ? '#d4a82c' : '#c1272d', metal = gold ? '#b8901c' : '#8a9099';
    const chrome = gold ? { shiny: 90 } : { shiny: 70 };
    cy(g, 0.5, 0.5, 0.2, 0.22, 0, 3, shade(metal, -0.3), 18, chrome);
    cy(g, 0.5, 0.5, 0.07, 0.07, 3, 10, metal, 10, chrome);
    bx(g, 0.38, 0.78, 0.24, 0.16, 3, 4, metal, chrome);
    bx(g, 0.2, 0.22, 0.6, 0.58, 13, 8, seat, { shiny: 30 });
    bx(g, 0.14, 0.3, 0.08, 0.48, 17, 10, shade(seat, -0.25));
    bx(g, 0.78, 0.3, 0.08, 0.48, 17, 10, shade(seat, -0.25));
    bx(g, 0.2, 0.16, 0.6, 0.1, 21, 26, seat, { shiny: 30 });
    bx(g, 0.36, 0.16, 0.28, 0.1, 47, 7, shade(seat, -0.1));
    if (gold) ball(g, 0.5, 60, 0.21, 0.07, '#f1c453', 0, { shiny: 100 });
  },
  goldChair(g) { Models.barberChair(g, true); },
  waitingChair(g) {
    for (const [lx, ly] of [[0.28, 0.3], [0.66, 0.3], [0.28, 0.68], [0.66, 0.68]]) bx(g, lx, ly, 0.05, 0.05, 0, 11, '#333');
    bx(g, 0.25, 0.27, 0.5, 0.48, 11, 5, '#3a6ea5');
    bx(g, 0.25, 0.22, 0.5, 0.07, 14, 18, '#335f8f');
  },
  bench(g) {
    bx(g, 0.12, 0.25, 0.76, 0.5, 0, 9, '#2d2d2d');
    bx(g, 0.1, 0.23, 0.8, 0.52, 9, 6, '#7b4b2a', { shiny: 25 });
    bx(g, 0.1, 0.17, 0.8, 0.1, 13, 18, '#6c4225', { shiny: 25 });
    for (let i = 0; i < 3; i++) ball(g, 0.23 + i * 0.27, 26, 0.275, 0.018, '#e9c46a');
  },
  plant(g) {
    cy(g, 0.5, 0.5, 0.17, 0.12, 0, 14, '#b5651d', 10);
    cy(g, 0.5, 0.5, 0.15, 0.15, 13, 1, '#4a3222', 10);
    const leaves = new THREE.Group();
    const greens = ['#2d6a4f', '#40916c', '#52b788', '#74c69d'];
    [[-0.12, 22, 0.02, 0.16], [0.13, 23, -0.03, 0.15], [0, 30, 0.08, 0.16], [-0.06, 38, -0.06, 0.13], [0.08, 37, 0.05, 0.13], [0, 46, 0, 0.11]]
      .forEach(([x, z, y, r], i) => ball(leaves, 0.5 + x, z, 0.5 + y, r, greens[i % 4], 0));
    g.add(leaves);
    g.userData.tick = t => { leaves.rotation.z = Math.sin(t * 1.3 + g.position.x) * 0.03; };
  },
  barberPole(g, gold) {
    bx(g, 0.35, 0.35, 0.3, 0.3, 0, 6, gold ? '#8a6d1c' : '#444');
    const tex = canvasTex(64, 128, (ctx, w, h) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      for (let i = -4; i < 12; i++) {
        ctx.fillStyle = gold ? (i % 2 ? '#f1c453' : '#fff4c2') : (i % 2 ? '#d62828' : '#1d4e89');
        ctx.beginPath(); ctx.moveTo(0, i * 16); ctx.lineTo(w, i * 16 - 22); ctx.lineTo(w, i * 16 - 14); ctx.lineTo(0, i * 16 + 8); ctx.fill();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1.5);
    const pole = cy(g, 0.5, 0.5, 0.1, 0.1, 6, 46, new THREE.MeshPhongMaterial({ map: tex, shininess: 80 }), 18);
    ball(g, 0.5, 55, 0.5, 0.11, gold ? '#f1c453' : '#c0c0c0', 1, { shiny: 90 });
    cy(g, 0.5, 0.5, 0.12, 0.12, 51, 3, gold ? '#b8901c' : '#9aa0a6', 18, { shiny: 80 });
    g.userData.tick = t => { tex.offset.y = (t * 0.35) % 1; };
  },
  goldenPole(g) { Models.barberPole(g, true); },
  register(g) {
    bx(g, 0.1, 0.2, 0.8, 0.6, 0, 26, '#6b4f3a');
    bx(g, 0.08, 0.18, 0.84, 0.64, 26, 3, '#3a2a1e');
    bx(g, 0.3, 0.32, 0.4, 0.34, 29, 10, '#2f3136', { shiny: 40 });
    bx(g, 0.34, 0.32, 0.32, 0.06, 39, 9, '#1b1d20');
    const scr = bx(g, 0.36, 0.385, 0.28, 0.005, 40, 7, '#4dd599', { emissive: '#1f7a4d' });
    scr.castShadow = false;
    bx(g, 0.72, 0.4, 0.12, 0.12, 29, 12, '#d9d9d9');
  },
  sink(g) {
    bx(g, 0.15, 0.25, 0.7, 0.55, 0, 24, '#e9ecef', { shiny: 40 });
    bx(g, 0.15, 0.2, 0.7, 0.1, 24, 22, '#ced4da');
    cy(g, 0.5, 0.52, 0.22, 0.18, 24, 5, '#adb5bd', 18, { shiny: 60 });
    cy(g, 0.5, 0.52, 0.17, 0.17, 26, 3.2, '#8fb8de', 18, { shiny: 90 });
    bx(g, 0.47, 0.26, 0.06, 0.06, 24, 16, '#8a8f96', { shiny: 90 });
    bx(g, 0.47, 0.26, 0.06, 0.18, 38, 3, '#8a8f96', { shiny: 90 });
  },
  tv(g) {
    bx(g, 0.15, 0.3, 0.7, 0.45, 0, 16, '#3d2c22');
    bx(g, 0.45, 0.45, 0.1, 0.1, 16, 5, '#222');
    bx(g, 0.1, 0.45, 0.8, 0.06, 21, 32, '#111', { shiny: 60 });
    const screen = mesh(new THREE.PlaneGeometry(0.72, 28 * U), new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0x3a7bd5 }), false);
    screen.position.set(0.5, 37 * U, 0.512);
    g.add(screen);
    g.userData.tick = t => {
      const on = !utilityOff('power');
      screen.material.emissive.setHSL(((t * 40) % 360) / 360, 0.55, on ? 0.45 : 0);
    };
  },
  coffee(g) {
    bx(g, 0.12, 0.2, 0.76, 0.6, 0, 24, '#495057');
    bx(g, 0.3, 0.3, 0.4, 0.35, 24, 22, '#adb5bd', { shiny: 80 });
    bx(g, 0.3, 0.3, 0.4, 0.35, 46, 3, '#212529');
    cy(g, 0.5, 0.72, 0.04, 0.035, 24, 6, '#ffffff', 10);
    bx(g, 0.4, 0.62, 0.2, 0.03, 34, 8, '#212529');
  },
  colorStation(g) {
    bx(g, 0.12, 0.2, 0.76, 0.55, 0, 22, '#f1f3f5');
    bx(g, 0.12, 0.16, 0.76, 0.08, 22, 34, '#dee2e6');
    ['#e63946', '#f4a261', '#2a9d8f', '#8338ec', '#ffbe0b'].forEach((c, i) => cy(g, 0.2 + i * 0.15, 0.5, 0.035, 0.035, 22, 10, c, 8, { shiny: 60 }));
    const m = mesh(new THREE.CircleGeometry(0.2, 24), mat('#bde0fe', { shiny: 100 }), false);
    m.position.set(0.5, 42 * U, 0.242);
    g.add(m);
  },
  jukebox(g) {
    bx(g, 0.2, 0.25, 0.6, 0.5, 0, 38, '#8d0801', { shiny: 40 });
    const top = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 18, 1, false, 0, Math.PI), new THREE.MeshPhongMaterial({ color: 0xffc300, emissive: 0x663300, shininess: 50 }));
    top.rotation.z = Math.PI / 2; top.rotation.y = Math.PI / 2;
    top.position.set(0.5, 38 * U, 0.5);
    g.add(top);
    const panel = mesh(new THREE.PlaneGeometry(0.4, 20 * U), new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0xff006e }), false);
    panel.position.set(0.5, 22 * U, 0.753);
    g.add(panel);
    g.userData.tick = t => {
      const on = !utilityOff('power');
      top.material.emissive.setHSL(((t * 90) % 360) / 360, 0.9, on ? 0.35 : 0.02);
      panel.material.emissive.setHSL(((t * 90 + 180) % 360) / 360, 0.9, on ? 0.4 : 0);
    };
  },
  arcade(g) {
    bx(g, 0.2, 0.25, 0.6, 0.5, 0, 62, '#3c096c', { shiny: 30 });
    bx(g, 0.2, 0.72, 0.6, 0.14, 26, 5, '#240046');
    cy(g, 0.4, 0.78, 0.015, 0.015, 31, 7, '#222', 6);
    ball(g, 0.4, 38, 0.78, 0.03, '#e63946');
    ball(g, 0.58, 32, 0.78, 0.025, '#ffd60a');
    const scr = mesh(new THREE.PlaneGeometry(0.46, 18 * U), new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x7209b7 }), false);
    scr.position.set(0.5, 44 * U, 0.752);
    g.add(scr);
    const sign = bx(g, 0.2, 0.7, 0.6, 0.06, 56, 6, '#ff4d6d', { emissive: '#a0203a' });
    sign.castShadow = false;
    g.userData.tick = t => { scr.material.emissive.setHSL(((t * 120) % 360) / 360, 0.9, utilityOff('power') ? 0 : 0.35); };
  },
  aquarium(g) {
    bx(g, 0.08, 0.2, 0.84, 0.6, 0, 16, '#343a40');
    const glass = bx(g, 0.1, 0.22, 0.8, 0.56, 16, 30, '#4895ef', { opacity: 0.38, shiny: 100 });
    glass.castShadow = false;
    bx(g, 0.12, 0.24, 0.76, 0.52, 16, 3, '#e9d8a6');
    const fish = [];
    ['#ff9f1c', '#ff595e', '#ffca3a'].forEach((c, i) => {
      const f = mesh(new THREE.BoxGeometry(0.08, 0.05, 0.03), mat(c), false);
      g.add(f); fish.push(f);
    });
    g.userData.tick = t => fish.forEach((f, i) => {
      const k = (t * 0.15 + i * 0.33) % 1;
      f.position.set(0.2 + k * 0.6, (24 + i * 6) * U, 0.35 + i * 0.12);
    });
  },
  statue(g) {
    bx(g, 0.2, 0.2, 0.6, 0.6, 0, 20, '#adb5bd');
    const gold = { shiny: 100 };
    cy(g, 0.5, 0.5, 0.12, 0.15, 20, 26, '#e0b62c', 12, gold);
    ball(g, 0.5, 56, 0.5, 0.13, '#e0b62c', 1, gold);
    const arm = bx(g, 0.62, 0.46, 0.06, 0.06, 38, 20, '#e0b62c', gold);
    arm.rotation.z = -0.4;
    bx(g, 0.66, 0.44, 0.02, 0.1, 58, 8, '#dcdcdc', { shiny: 100 });
  },
  neonSign(g) {
    bx(g, 0.3, 0.35, 0.4, 0.3, 0, 5, '#2b2d42');
    cy(g, 0.5, 0.5, 0.03, 0.03, 5, 34, '#3d405b', 8);
    bx(g, 0.2, 0.46, 0.6, 0.08, 38, 24, '#14101f');
    const tex = canvasTex(256, 100, (ctx, w, h) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; roundRect(ctx, 10, 10, w - 20, h - 20, 12); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 58px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CANI', w / 2, h / 2 + 4);
    });
    const face = mesh(new THREE.PlaneGeometry(0.56, 22 * U), new THREE.MeshBasicMaterial({ map: tex, color: 0xff4fd8 }), false);
    face.position.set(0.5, 50 * U, 0.542);
    g.add(face);
    const glow = new THREE.PointLight(0xff4fd8, 0.4, 2.2, 2);
    glow.position.set(0.5, 50 * U, 0.8);
    g.add(glow);
    g.userData.tick = t => {
      const off = utilityOff('power');
      face.material.color.setHSL((320 + Math.sin(t * 1.5) * 25) / 360, 1, off ? 0.12 : 0.7);
      glow.intensity = off ? 0 : 0.4;
    };
  },
};

function buildItemModel(type) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  (Models[type] || Models.plant)(inner);
  g.userData.tick = inner.userData.tick;
  return g;
}

// ---------- people ----------

const HIP = 0.46;
const PERSON_SCALE = 1.32;   // characters are drawn larger than the furniture grid for readability

// mouth, cheeks and lips are painted; eyes, brows and nose are real geometry
const _mouthTex = new Map();
function mouthMaterial(p) {
  const key = [p.skin, p.mood, p.female ? 1 : 0].join('|');
  if (_mouthTex.has(key)) return _mouthTex.get(key);
  const tex = canvasTex(64, 64, (ctx) => {
    ctx.fillStyle = p.skin; ctx.fillRect(0, 0, 64, 64);
    const g = ctx.createRadialGradient(32, 26, 6, 32, 30, 44);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    const happy = p.mood === 'happy', angry = p.mood === 'angry';
    if (p.female || happy) {
      ctx.fillStyle = 'rgba(240,110,120,0.35)';
      ctx.beginPath(); ctx.ellipse(12, 40, 6, 3.5, 0, 0, 7); ctx.ellipse(52, 40, 6, 3.5, 0, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = '#6b2e2a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    if (happy) { ctx.arc(32, 44, 8, 0.15 * Math.PI, 0.85 * Math.PI); }
    else if (angry) ctx.arc(32, 58, 8, 1.2 * Math.PI, 1.8 * Math.PI);
    else { ctx.moveTo(26, 50); ctx.lineTo(38, 50); }
    ctx.stroke();
    if (happy) { ctx.fillStyle = '#fff'; ctx.fillRect(27, 47, 10, 2); }
    if (p.female) { ctx.fillStyle = 'rgba(200,50,75,0.65)'; ctx.beginPath(); ctx.ellipse(32, 50, 6, 2.6, 0, 0, 7); ctx.fill(); }
  });
  const m = new THREE.MeshLambertMaterial({ map: tex });
  _mouthTex.set(key, m);
  return m;
}

function limb(parent, x, y, w, h, d, material, pivotY = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.y = pivotY - h / 2;
  pivot.add(m);
  parent.add(pivot);
  return pivot;
}

function buildPerson(p) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(PERSON_SCALE);
  g.add(body);
  const skin = mat(p.skin), skinDark = mat(shade(p.skin, -0.08));
  const shirt = mat(p.shirt), shirtDark = mat(shade(p.shirt, -0.12));
  const legM = mat(p.dress ? shade(p.skin, -0.04) : p.pants);
  const shoeM = mat(p.shoes || '#2a2230'), soleM = mat('#1a1a1a');

  // legs: thigh -> knee -> shin -> shoe
  const legs = [-1, 1].map(side => {
    const thigh = limb(body, side * 0.09, HIP, 0.14, 0.23, 0.15, legM);
    const knee = new THREE.Group();
    knee.position.y = -0.23;
    thigh.add(knee);
    const shin = mesh(new THREE.BoxGeometry(0.13, 0.2, 0.14), p.dress ? legM : mat(shade(p.pants, -0.04)));
    shin.position.y = -0.1;
    const shoe = mesh(new THREE.BoxGeometry(0.15, 0.075, 0.25), shoeM);
    shoe.position.set(0, -0.2, 0.045);
    const sole = mesh(new THREE.BoxGeometry(0.155, 0.02, 0.255), soleM, false);
    sole.position.set(0, -0.235, 0.045);
    knee.add(shin, shoe, sole);
    return { thigh, knee };
  });
  if (p.dress) {
    const skirt = mesh(new THREE.CylinderGeometry(0.19, 0.28, 0.32, 12), mat(shade(p.shirt, -0.15)));
    skirt.position.y = HIP - 0.07;
    body.add(skirt);
  } else {
    const hips = mesh(new THREE.BoxGeometry(0.34, 0.1, 0.21), legM);
    hips.position.y = HIP + 0.02;
    const belt = mesh(new THREE.BoxGeometry(0.35, 0.035, 0.215), mat('#2b2118'), false);
    belt.position.y = HIP + 0.07;
    const buckle = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.01), mat('#d4a82c', { shiny: 90 }), false);
    buckle.position.set(0, HIP + 0.07, 0.11);
    body.add(hips, belt, buckle);
  }

  // torso with rounded shoulders and a collar
  const tw = p.female ? 0.33 : 0.37;
  const torso = mesh(new THREE.BoxGeometry(tw, 0.34, 0.21), shirt);
  torso.position.y = HIP + 0.26;
  const chest = mesh(new THREE.BoxGeometry(tw - 0.06, 0.2, 0.03), shirt);
  chest.position.set(0, HIP + 0.3, 0.11);
  const shoulders = mesh(new THREE.CylinderGeometry(0.075, 0.075, tw + 0.07, 10), shirt);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = HIP + 0.4;
  body.add(torso, chest, shoulders);
  if (p.stripes) for (let k = 0; k < 3; k++) {
    const s = mesh(new THREE.BoxGeometry(tw + 0.005, 0.03, 0.215), mat('#ffffff'), false);
    s.position.y = HIP + 0.15 + k * 0.1;
    body.add(s);
  }
  const collarM = p.barber ? mat('#ffffff') : shirtDark;
  for (const s of [-1, 1]) {
    const c = mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), collarM, false);
    c.position.set(s * 0.045, HIP + 0.43, 0.105);
    c.rotation.z = s * 0.5;
    body.add(c);
  }
  if (p.barber) {
    const apronM = mat(p.owner ? '#1b1b1f' : '#f4f6f8');
    const apron = mesh(new THREE.BoxGeometry(0.3, 0.44, 0.02), apronM);
    apron.position.set(0, HIP + 0.16, 0.122);
    body.add(apron);
    for (const s of [-1, 1]) {
      const strap = mesh(new THREE.BoxGeometry(0.035, 0.18, 0.015), apronM, false);
      strap.position.set(s * 0.1, HIP + 0.42, 0.115);
      body.add(strap);
    }
    const pocket = mesh(new THREE.BoxGeometry(0.2, 0.09, 0.012), mat(p.owner ? '#2c2c33' : '#dde3ea'), false);
    pocket.position.set(0, HIP + 0.08, 0.135);
    const comb = mesh(new THREE.BoxGeometry(0.018, 0.1, 0.01), mat('#e63946'), false);
    comb.position.set(-0.05, HIP + 0.13, 0.142);
    const scissorsPocket = mesh(new THREE.BoxGeometry(0.02, 0.09, 0.01), mat('#c0c6cc', { shiny: 90 }), false);
    scissorsPocket.position.set(0.04, HIP + 0.13, 0.142);
    body.add(pocket, comb, scissorsPocket);
    if (p.owner) {
      const trim = mesh(new THREE.BoxGeometry(0.302, 0.02, 0.022), mat('#f1c453', { shiny: 60 }), false);
      trim.position.set(0, HIP - 0.05, 0.123);
      body.add(trim);
    }
  }

  // arms: shoulder -> elbow; short sleeves, bare forearms
  const arms = [-1, 1].map(side => {
    const shoulder = limb(body, side * (tw / 2 + 0.05), HIP + 0.4, 0.11, 0.19, 0.12, shirt);
    const elbow = new THREE.Group();
    elbow.position.y = -0.19;
    shoulder.add(elbow);
    const fore = mesh(new THREE.BoxGeometry(0.09, 0.17, 0.1), p.barber || p.female ? skin : shirtDark);
    fore.position.y = -0.085;
    const hand = mesh(new THREE.BoxGeometry(0.095, 0.09, 0.1), skin);
    hand.position.y = -0.21;
    const thumb = mesh(new THREE.BoxGeometry(0.03, 0.05, 0.035), skin, false);
    thumb.position.set(-side * 0.055, -0.19, 0.03);
    elbow.add(fore, hand, thumb);
    if (p.watch && side === -1) {
      const w = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.11), mat('#222'), false);
      w.position.y = -0.15;
      elbow.add(w);
    }
    return { shoulder, elbow };
  });
  let tool = null;
  if (p.barber) {
    tool = new THREE.Group();
    const bladeM = mat('#dfe4ea', { shiny: 100 });
    const b1 = mesh(new THREE.BoxGeometry(0.018, 0.018, 0.16), bladeM, false);
    const b2 = b1.clone();
    b1.rotation.y = 0.22; b2.rotation.y = -0.22;
    const ring1 = mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 10), mat('#e63946'), false);
    ring1.position.set(0.02, 0, -0.08);
    const ring2 = ring1.clone(); ring2.position.x = -0.02;
    tool.add(b1, b2, ring1, ring2);
    tool.position.set(0, -0.26, 0.07);
    tool.userData.blades = [b1, b2];
    arms[1].elbow.add(tool);
  }

  // neck + head with modelled eyes, brows, nose and ears
  const neck = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), skin);
  neck.position.y = HIP + 0.47;
  body.add(neck);
  const head = new THREE.Group();
  head.position.y = HIP + 0.66;
  const headMesh = mesh(new THREE.BoxGeometry(0.34, 0.33, 0.31), [skin, skin, skin, skinDark, mouthMaterial(p), skin]);
  head.add(headMesh);
  const chin = mesh(new THREE.BoxGeometry(0.28, 0.04, 0.26), skin, false);
  chin.position.set(0, -0.18, 0.01);
  head.add(chin);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.BoxGeometry(0.035, 0.09, 0.07), skinDark, false);
    ear.position.set(s * 0.185, -0.01, -0.01);
    head.add(ear);
    if (p.female && p.earrings) {
      const e = mesh(new THREE.SphereGeometry(0.018, 6, 6), mat('#f1c453', { shiny: 100 }), false);
      e.position.set(s * 0.19, -0.07, 0);
      head.add(e);
    }
  }
  const eyeWhite = mat('#ffffff'), pupilM = mat('#1d1520'), browM = mat(shade(p.hair || '#333', -0.15));
  const eyes = [], brows = [];
  for (const s of [-1, 1]) {
    const white = mesh(new THREE.BoxGeometry(0.075, 0.06, 0.012), eyeWhite, false);
    white.position.set(s * 0.075, 0.03, 0.158);
    const pupil = mesh(new THREE.BoxGeometry(0.038, 0.05, 0.012), pupilM, false);
    pupil.position.set(s * 0.075 + 0.008, 0.028, 0.164);
    const glint = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.004), eyeWhite, false);
    glint.position.set(s * 0.075 + 0.016, 0.042, 0.171);
    const brow = mesh(new THREE.BoxGeometry(0.085, 0.022, 0.02), browM, false);
    brow.position.set(s * 0.075, 0.085, 0.158);
    head.add(white, pupil, glint, brow);
    eyes.push({ white, pupil, glint, s });
    brows.push({ brow, s });
  }
  const nose = mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05), skinDark, false);
  nose.position.set(0, -0.02, 0.17);
  head.add(nose);
  if (p.glasses) {
    const fm = mat('#1b1b1b');
    for (const s of [-1, 1]) {
      const f = mesh(new THREE.TorusGeometry(0.045, 0.009, 4, 12), fm, false);
      f.position.set(s * 0.075, 0.03, 0.172);
      head.add(f);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), fm, false);
    bridge.position.set(0, 0.035, 0.172);
    head.add(bridge);
  }
  body.add(head);

  const cape = mesh(new THREE.ConeGeometry(0.46, 0.66, 14, 1, true), mat(p.capeColor || '#2b2d42', { side: true }));
  cape.position.y = HIP + 0.2;
  cape.visible = false;
  const capeCollar = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10), mat('#f8f9fa'), false);
  capeCollar.position.y = HIP + 0.5;
  capeCollar.visible = false;
  body.add(cape, capeCollar);
  const towel = new THREE.Group();
  const tw1 = mesh(new THREE.BoxGeometry(0.38, 0.12, 0.34), mat('#f8f9fa'));
  const tw2 = mesh(new THREE.BoxGeometry(0.2, 0.09, 0.2), mat('#e9ecef'));
  tw2.position.set(0.04, 0.08, -0.02);
  towel.add(tw1, tw2);
  towel.position.y = 0.19;
  towel.visible = false;
  head.add(towel);

  g.userData = { body, legs, arms, head, headMesh, eyes, brows, cape, capeCollar, towel, tool, hairKey: '', hair: null, faceKey: '', angle: 0, lx: p.x, ly: p.y, blink: Math.random() * 4 };
  return g;
}

function buildHair(p) {
  const hg = new THREE.Group();
  const m = mat(p.hair);
  const add = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const b = mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.rotation.set(rx, ry, rz);
    hg.add(b); return b;
  };
  const puff = (r, x, y, z) => { const b = mesh(new THREE.IcosahedronGeometry(r, 0), m); b.position.set(x, y, z); hg.add(b); };
  const messy = !p.groomed;
  switch (p.hairStyle) {
    case 0: add(0.36, 0.08, 0.32, 0, 0.19, 0); add(0.36, 0.2, 0.05, 0, 0.1, -0.16); break;
    case 1: add(0.36, 0.08, 0.32, 0, 0.19, 0); add(0.3, 0.1, 0.16, 0, 0.26, 0.07, -0.35); add(0.36, 0.2, 0.05, 0, 0.1, -0.16); break;
    case 2: for (const [x, z] of [[-0.1, -0.08], [0.1, -0.08], [-0.1, 0.08], [0.1, 0.08], [0, 0]]) puff(messy ? 0.12 : 0.1, x, 0.2, z); break;
    case 3: add(0.37, 0.08, 0.33, 0, 0.19, 0); add(0.38, 0.36, 0.06, 0, 0.02, -0.17); add(0.05, 0.28, 0.24, 0.185, 0.04, -0.03); add(0.05, 0.28, 0.24, -0.185, 0.04, -0.03); break;
    case 4: add(0.04, 0.06, 0.16, 0.18, 0.02, -0.04); add(0.04, 0.06, 0.16, -0.18, 0.02, -0.04); break;
    case 10: add(0.37, 0.09, 0.33, 0, 0.19, 0); add(0.38, 0.52, 0.06, 0, -0.06, -0.17); add(0.05, 0.4, 0.24, 0.185, -0.02, -0.03); add(0.05, 0.4, 0.24, -0.185, -0.02, -0.03); add(0.3, 0.07, 0.05, 0.03, 0.14, 0.15, 0, 0, 0.2); break;
    case 11: add(0.37, 0.09, 0.33, 0, 0.19, 0); add(0.36, 0.2, 0.05, 0, 0.1, -0.16); add(0.1, 0.34, 0.1, 0, -0.06, -0.24, 0.35); break;
    case 12: add(0.37, 0.09, 0.33, 0, 0.19, 0); add(0.36, 0.2, 0.05, 0, 0.1, -0.16); puff(0.1, 0, 0.3, -0.08); break;
    case 13: add(0.38, 0.09, 0.34, 0, 0.19, 0); add(0.39, 0.3, 0.07, 0, 0.04, -0.16); add(0.06, 0.3, 0.3, 0.19, 0.04, 0); add(0.06, 0.3, 0.3, -0.19, 0.04, 0); add(0.34, 0.07, 0.04, 0, 0.13, 0.155); break;
    case 14: for (const [x, y, z] of [[-0.12, 0.18, -0.05], [0.12, 0.18, -0.05], [0, 0.22, 0.06], [-0.16, 0, -0.12], [0.16, 0, -0.12], [0, -0.05, -0.18], [-0.12, -0.18, -0.15], [0.12, -0.18, -0.15]]) puff(0.12, x, y, z); break;
    default: add(0.35, 0.05, 0.3, 0, 0.18, 0); add(0.36, 0.12, 0.04, 0, 0.12, -0.155);
  }
  if (messy && p.hairStyle !== 4) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(0.03, 0.12, 0.03, Math.cos(a) * 0.12, 0.26, Math.sin(a) * 0.1, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }
  }
  if (p.beard) {
    const bm = mesh(new THREE.BoxGeometry(p.groomed ? 0.26 : 0.32, p.groomed ? 0.07 : 0.14, 0.04), m);
    bm.position.set(0, p.groomed ? -0.12 : -0.1, 0.16);
    hg.add(bm);
  }
  return hg;
}

function agentAngle(ud, a) {
  // face movement, the chair, or the station being worked on
  const dx = a.x - ud.lx, dy = a.y - ud.ly;
  ud.lx = a.x; ud.ly = a.y;
  if (a.sitting) return 0;
  if (a.barber && a.job && (a.state === 'working' || a.state === 'waitCustomer')) {
    const st = a.job.station;
    return Math.atan2(st.x + 0.5 - a.x, st.y + 0.5 - a.y);
  }
  if (a.state === 'atRegister' && a.register) return Math.atan2(a.register.x + 0.5 - a.x, a.register.y + 0.5 - a.y);
  if (Math.hypot(dx, dy) > 1e-4) return Math.atan2(dx, dy);
  return ud.angle;
}

function syncPeople(t) {
  const alive = new Set();
  for (const a of [...Game.customers, ...Game.barbers]) {
    alive.add(a.id);
    let g = R3.people.get(a.id);
    if (!g) { g = buildPerson(a); R3.people.set(a.id, g); R3.world.add(g); }
    const ud = g.userData;
    const hairKey = `${a.groomed}|${a.hairStyle}|${a.hair}|${a.beard}`;
    if (hairKey !== ud.hairKey) {
      if (ud.hair) { disposeGroup(ud.hair); ud.head.remove(ud.hair); }
      ud.hair = buildHair(a); ud.head.add(ud.hair); ud.hairKey = hairKey;
    }
    const faceKey = a.mood + '|' + a.skin;
    if (faceKey !== ud.faceKey) {
      const mats = ud.headMesh.material.slice();
      mats[4] = mouthMaterial(a);
      ud.headMesh.material = mats;
      ud.faceKey = faceKey;
      // eyebrows show the mood
      const angry = a.mood === 'angry', happy = a.mood === 'happy';
      ud.brows.forEach(({ brow, s }) => { brow.rotation.z = angry ? s * -0.45 : happy ? s * 0.15 : 0; brow.position.y = angry ? 0.075 : happy ? 0.095 : 0.085; });
    }
    g.visible = (a.alpha === undefined ? 1 : a.alpha) > 0.35;
    let y = 0;
    if (a.sitting) {
      const it = itemAt(Math.floor(a.x), Math.floor(a.y));
      y = it && SEAT_H[it.type] !== undefined ? SEAT_H[it.type] * U - (HIP - 0.02) * PERSON_SCALE : 0;
    }
    const walking = a.moving && !a.sitting;
    const phase = (a.walkT || 0) * 10;
    const bob = walking ? Math.abs(Math.sin(phase)) * 0.045 : Math.sin(t * 2 + a.id) * 0.006;
    g.position.set(a.x, y + bob, a.y);
    const target = agentAngle(ud, a);
    let da = target - ud.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    ud.angle += da * 0.25;
    g.rotation.y = ud.angle;

    // legs
    const swing = walking ? Math.sin(phase) * 0.55 : 0;
    if (a.sitting) {
      ud.legs.forEach(l => { l.thigh.rotation.x = -Math.PI / 2; l.knee.rotation.x = Math.PI / 2 - 0.1; });
    } else {
      ud.legs[0].thigh.rotation.x = swing; ud.legs[1].thigh.rotation.x = -swing;
      ud.legs[0].knee.rotation.x = walking ? Math.max(0, -Math.sin(phase)) * 0.7 : 0;
      ud.legs[1].knee.rotation.x = walking ? Math.max(0, Math.sin(phase)) * 0.7 : 0;
    }
    // arms
    const [L, R] = ud.arms;
    if (a.working) {
      R.shoulder.rotation.x = -1.25 + Math.sin(t * 3) * 0.08; R.elbow.rotation.x = -0.5;
      L.shoulder.rotation.x = -0.95; L.elbow.rotation.x = -0.9;
      if (ud.tool) { const o = Math.sin(t * 18) * 0.22; ud.tool.userData.blades[0].rotation.y = 0.05 + Math.abs(o); ud.tool.userData.blades[1].rotation.y = -0.05 - Math.abs(o); }
    } else if (a.sitting) {
      L.shoulder.rotation.x = R.shoulder.rotation.x = -0.35; L.elbow.rotation.x = R.elbow.rotation.x = -0.9;
    } else {
      L.shoulder.rotation.x = -swing * 0.8; R.shoulder.rotation.x = swing * 0.8;
      L.elbow.rotation.x = R.elbow.rotation.x = walking ? -0.35 : -0.08;
    }
    if (ud.tool) ud.tool.visible = !!a.working;
    ud.cape.visible = ud.capeCollar.visible = !!a.cape;
    ud.arms.forEach(arm => { arm.shoulder.visible = !a.cape; });
    ud.towel.visible = !!a.towel;
    // blinking
    ud.blink -= 1 / 60;
    const closed = ud.blink < 0.12;
    if (ud.blink < 0) ud.blink = 2 + Math.random() * 4;
    ud.eyes.forEach(e => { const k = closed || a.mood === 'happy' ? 0.25 : 1; e.white.scale.y = e.pupil.scale.y = k; e.glint.visible = !closed; });
    // look toward the barber's work or wander
    const look = a.working ? 0 : Math.sin(t * 0.7 + a.id) * 0.012;
    ud.eyes.forEach(e => { e.pupil.position.x = e.s * 0.075 + look; });
  }
  for (const [id, g] of R3.people) if (!alive.has(id)) { disposeGroup(g); R3.world.remove(g); R3.people.delete(id); }
}

// ---------- items, piles, coins, highlights ----------

function syncItems(t) {
  const alive = new Set();
  for (const it of Game.state.items) {
    alive.add(it.id);
    let o = R3.items.get(it.id);
    if (!o || o.type !== it.type) {
      if (o) { disposeGroup(o.group); R3.world.remove(o.group); }
      o = { type: it.type, group: buildItemModel(it.type) };
      R3.items.set(it.id, o);
      R3.world.add(o.group);
    }
    o.group.position.set(it.x, 0, it.y);
    if (o.group.userData.tick) o.group.userData.tick(t);
  }
  for (const [id, o] of R3.items) if (!alive.has(id)) { disposeGroup(o.group); R3.world.remove(o.group); R3.items.delete(id); }
}

function syncPiles() {
  const alive = new Set();
  for (const p of Game.piles) {
    const key = `${p.x},${p.y}`;
    alive.add(key);
    let o = R3.piles.get(key);
    if (!o || o.amount !== p.amount) {
      if (o) { disposeGroup(o.group); R3.world.remove(o.group); }
      const g = new THREE.Group();
      const m = mat(p.color);
      const n = 8 + p.amount * 10;
      for (let i = 0; i < n; i++) {
        const b = mesh(new THREE.BoxGeometry(0.07, 0.012, 0.018), m, false);
        const a = hash2(i + p.x * 13, p.y * 7 + i) * Math.PI * 2;
        const r = hash2(i * 3 + p.y, p.x + i) * (0.12 + p.amount * 0.06);
        b.position.set(0.5 + Math.cos(a) * r, 0.008 + (i % 3) * 0.006, 0.5 + Math.sin(a) * r);
        b.rotation.y = a * 3;
        g.add(b);
      }
      g.position.set(p.x, 0, p.y);
      o = { amount: p.amount, group: g };
      R3.piles.set(key, o);
      R3.world.add(g);
    }
  }
  for (const [k, o] of R3.piles) if (!alive.has(k)) { disposeGroup(o.group); R3.world.remove(o.group); R3.piles.delete(k); }
}

let _coinGeo = null, _coinMat = null;
function syncDrops(t) {
  if (!_coinGeo) {
    _coinGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20);
    const star = canvasTex(64, 64, (ctx) => {
      ctx.fillStyle = '#9d6bff'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', 32, 34);
    });
    const side = new THREE.MeshPhongMaterial({ color: 0x6a3fc4, emissive: 0x2a1060, shininess: 80 });
    const face = new THREE.MeshPhongMaterial({ map: star, emissive: 0x301070, shininess: 80 });
    _coinMat = [side, face, face];
  }
  const alive = new Set();
  for (const d of Game.drops) {
    alive.add(d);
    let m = R3.drops.get(d);
    if (!m) { m = mesh(_coinGeo, _coinMat); m.rotation.x = Math.PI / 2; R3.drops.set(d, m); R3.world.add(m); }
    m.position.set(d.x, 0.3 + Math.abs(Math.sin(t * 4 + d.seed * 6)) * 0.12, d.y);
    m.rotation.z = t * 3 + d.seed * 10;
    m.visible = !(d.life < 12 && Math.floor(t * 8) % 2);
  }
  for (const [d, m] of R3.drops) if (!alive.has(d)) { R3.world.remove(m); R3.drops.delete(d); }
}

let _ring = null;
const _tilePool = [];
const _ghosts = new Map();
function tilePlane(i, color, opacity) {
  if (!_tilePool[i]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    _tilePool[i] = m;
    R3.fx.add(m);
  }
  const m = _tilePool[i];
  m.material.color.set(color);
  m.material.opacity = opacity;
  m.visible = true;
  return m;
}

function syncFx(t) {
  _tilePool.forEach(m => { m.visible = false; });
  let k = 0;
  const place = (x, y, color, op) => { const m = tilePlane(k++, color, op); m.position.set(x + 0.5, 0.012, y + 0.5); };
  // targets for the selected customer
  const sel = Game.selected;
  if (sel && !sel.barber) {
    const pulse = 0.35 + Math.sin(t * 6) * 0.15;
    const targets = (sel.state === 'waiting' || sel.state === 'enter') ? freeStation(sel.service.station) : sel.state === 'done' ? registers() : [];
    targets.forEach(it => place(it.x, it.y, '#50dc78', pulse));
  }
  // build tool
  const hv = Renderer.hover;
  _ghosts.forEach(g => { g.visible = false; });
  if (UI.tool && hv && inBounds(hv.x, hv.y)) {
    if (UI.tool.mode === 'place') {
      const ok = canPlace(UI.tool.type, hv.x, hv.y).ok;
      place(hv.x, hv.y, ok ? '#50dc78' : '#e63946', 0.4);
      if (!itemAt(hv.x, hv.y)) {
        let g = _ghosts.get(UI.tool.type);
        if (!g) {
          g = buildItemModel(UI.tool.type);
          g.traverse(o => {
            if (!o.material) return;
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            const cl = ms.map(m => { const c = m.clone(); c.transparent = true; c.opacity = 0.55; c.depthWrite = false; return c; });
            o.material = Array.isArray(o.material) ? cl : cl[0];
            o.castShadow = false;
          });
          _ghosts.set(UI.tool.type, g);
          R3.fx.add(g);
        }
        g.position.set(hv.x, 0, hv.y);
        g.visible = true;
      }
    } else if (UI.tool.mode === 'sell' && itemAt(hv.x, hv.y)) place(hv.x, hv.y, '#e63946', 0.5);
  }
  // selection ring
  if (!_ring) {
    _ring = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.34, 32), new THREE.MeshBasicMaterial({ color: 0xf1c453, transparent: true, opacity: 0.9, depthWrite: false }));
    _ring.rotation.x = -Math.PI / 2;
    R3.fx.add(_ring);
  }
  _ring.visible = !!sel;
  if (sel) { _ring.position.set(sel.x, 0.02, sel.y); _ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06); }
}

// ---------- lighting ----------

function updateLighting(t) {
  const hour = Game.state.time / 60;
  const eve = clamp((hour - 16) / 3, 0, 1);
  const off = utilityOff('power');
  const flick = off ? 0.9 + Math.sin(t * 9) * 0.05 : 1;
  R3.sun.intensity = (0.75 - eve * 0.35) * (off ? 0.35 : 1);
  R3.sun.color.setRGB(1, 0.96 - eve * 0.2, 0.88 - eve * 0.35);
  R3.hemi.intensity = (0.62 - eve * 0.2) * (off ? 0.45 : 1) * flick;
  const lampK = off ? 0 : 0.35 + eve * 0.9;
  R3.lamps.forEach((L, i) => { L.intensity = lampK * (1 + Math.sin(t * 7 + i * 3) * 0.02); });
}

// Cut away the walls between the camera and the room
function updateWalls() {
  const c = Math.cos(VIEW.angle), s = Math.sin(VIEW.angle);
  for (const w of R3.wallParts || []) {
    const [nx, nz] = w.normal;
    const dot = (c * nx + s * nz) + (-s * nx + c * nz);      // outward normal · direction to the camera
    const target = dot > 0.15 ? 0.12 : 1;
    w.h += (target - w.h) * 0.25;
    w.box.scale.y = w.h;
    w.box.position.y = WALL_UNITS * w.h / 2;
    w.plane.visible = w.h > 0.9;
  }
}

function rotateView(dir) {
  if (!R3.active) return;
  VIEW.target += dir * Math.PI / 2;
  sfx('select');
}

// ---------- frame ----------

function renderR3() {
  if (!R3.active) return;
  const t = Game.t;
  const n = gridSize();
  VIEW.cx = VIEW.cy = n / 2;
  VIEW.angle += (VIEW.target - VIEW.angle) * 0.18;
  if (Math.abs(VIEW.target - VIEW.angle) < 0.001) VIEW.angle = VIEW.target;
  // keep angles small after full turns
  if (VIEW.angle === VIEW.target && Math.abs(VIEW.angle) >= Math.PI * 2) VIEW.angle = VIEW.target = VIEW.angle % (Math.PI * 2);
  R3.world.rotation.y = VIEW.angle;
  const ca = Math.cos(VIEW.angle), sa = Math.sin(VIEW.angle);
  R3.world.position.set(n / 2 - (ca * n / 2 + sa * n / 2), 0, n / 2 - (-sa * n / 2 + ca * n / 2));
  buildRoom();
  updateWalls();
  if (t - R3.lastPaint > 0.25 || R3.lastPaint < 0) { paintWalls(t); R3.lastPaint = t; }
  syncItems(t);
  syncPeople(t);
  syncPiles();
  syncDrops(t);
  syncFx(t);
  updateLighting(t);
  updateCamera3D();
  R3.renderer.render(R3.scene, R3.camera);
}
