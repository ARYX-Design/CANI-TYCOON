// Game state + simulation (customers, barbers, economy)

const Game = {
  state: null,
  customers: [],
  barbers: [],        // runtime agents, one per state.barbers entry
  floaters: [],       // floating texts (+$20, emotes)
  particles: [],      // hair clippings
  sparkles: [],       // fresh-cut sparkles
  selected: null,     // agent shown in the inspector
  speed: 1,
  paused: false,
  nightMode: false,   // true while the end-of-day summary is shown
  spawnAcc: 0,
  uid: 1,
  t: 0,
  listeners: [],
};

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function emit(ev) { Game.listeners.forEach(fn => fn(ev)); }

// ---------- setup ----------

function newState() {
  const s = {
    version: 1,
    money: START_MONEY,
    rep: 1.0,
    stage: 0,
    day: 1,
    time: OPEN_TIME,
    priceLevel: 1,
    items: [],
    nextId: 1,
    barbers: [{ id: 1, name: 'Cani', surname: '', origin: 'al', female: false, owner: true, speed: 1.0, skill: 2, wage: 0, skin: '#e8b894', hair: '#1c1410', hairStyle: 5, shirt: '#e63946', pants: '#2b2d42', shoes: '#1d1d1d' }],
    nextBarberId: 2,
    upgrades: { clippers: 0, marketing: 0, academy: 0, loyalty: 0 },
    disabledServices: [],
    stats: { served: 0, lost: 0, earned: 0 },
    today: freshToday(1.0),
    candidates: [],
    introSeen: false,
  };
  const add = (type, x, y) => s.items.push({ id: s.nextId++, type, x, y });
  add('barberChair', 2, 2);
  add('waitingChair', 0, 4);
  add('waitingChair', 0, 5);
  add('plant', 0, 0);
  return s;
}

function freshToday(rep) {
  return { revenue: 0, tips: 0, served: 0, lost: 0, repStart: rep };
}

function initWorld(state) {
  Game.state = state;
  Game.customers = [];
  Game.floaters = [];
  Game.particles = [];
  Game.sparkles = [];
  Game.selected = null;
  Game.barbers = [];
  // saves from before names had origins
  state.barbers.forEach(b => {
    if (!b.origin) b.origin = b.owner ? 'al' : pick(['al', 'si']);
    if (b.surname === undefined) b.surname = b.owner ? '' : pick(NAMES[b.origin].surnames);
    if (!b.shoes) b.shoes = pick(SHOE_COLORS);
  });
  if (state.candidates.some(c => !c.origin)) state.candidates = [];
  if (!state.candidates.length) state.candidates = genCandidates(3);
  state.barbers.forEach((b, i) => spawnBarberAgent(b, i));
}

// ---------- helpers ----------

const stage = () => STAGES[Game.state.stage];
const gridSize = () => stage().size;
const doorTile = () => ({ x: gridSize() - 2, y: 0 });
const itemAt = (x, y) => Game.state.items.find(i => i.x === x && i.y === y);
const inBounds = (x, y) => x >= 0 && y >= 0 && x < gridSize() && y < gridSize();
const tileOf = a => ({ x: Math.floor(a.x), y: Math.floor(a.y) });

function walkable(x, y, blocked) {
  if (!inBounds(x, y)) return false;
  if (blocked && blocked.x === x && blocked.y === y) return false;
  return !itemAt(x, y);
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// BFS; goal may be a non-walkable (furniture) tile. Returns tiles excluding start.
function findPath(sx, sy, gx, gy) {
  if (sx === gx && sy === gy) return [];
  const n = gridSize();
  const prev = new Map();
  const key = (x, y) => y * n + x;
  const q = [[sx, sy]];
  prev.set(key(sx, sy), null);
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || prev.has(key(nx, ny))) continue;
      const isGoal = nx === gx && ny === gy;
      if (!isGoal && !walkable(nx, ny)) continue;
      prev.set(key(nx, ny), [x, y]);
      if (isGoal) {
        const path = [];
        let cur = [nx, ny];
        while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift({ x: cur[0], y: cur[1] }); cur = prev.get(key(cur[0], cur[1])); }
        return path;
      }
      q.push([nx, ny]);
    }
  }
  return null;
}

function reachableFromDoor(blocked) {
  const d = doorTile();
  const seen = new Set([d.y * 100 + d.x]);
  const q = [[d.x, d.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(ny * 100 + nx) || !walkable(nx, ny, blocked)) continue;
      seen.add(ny * 100 + nx);
      q.push([nx, ny]);
    }
  }
  return seen;
}

function decorScore() {
  return Game.state.items.reduce((s, i) => s + (ITEMS[i.type].decor || 0), 0);
}

function patienceBonus() {
  const fromItems = Game.state.items.reduce((s, i) => s + (ITEMS[i.type].patience || 0), 0);
  return Math.min(0.6, fromItems + Game.state.upgrades.loyalty * 0.1);
}

function availableServices() {
  const s = Game.state;
  const stations = new Set(s.items.filter(i => ITEMS[i.type].station).map(i => ITEMS[i.type].station));
  return SERVICES.filter(sv => sv.stage <= s.stage && stations.has(sv.station) && !s.disabledServices.includes(sv.id));
}

function barberSkill(b) { return Math.min(5, b.skill + Game.state.upgrades.academy * 0.5); }

// ---------- placement ----------

function canPlace(type, x, y) {
  const s = Game.state, def = ITEMS[type];
  if (!inBounds(x, y)) return { ok: false, reason: 'Outside the shop' };
  if (def.stage > s.stage) return { ok: false, reason: `Unlocks at ${STAGES[def.stage].name}` };
  if (s.money < def.cost) return { ok: false, reason: 'Not enough money' };
  const d = doorTile();
  if (x === d.x && y === d.y) return { ok: false, reason: 'Keep the door clear' };
  if (itemAt(x, y)) return { ok: false, reason: 'Tile occupied' };
  const people = [...Game.customers, ...Game.barbers];
  if (people.some(p => Math.floor(p.x) === x && Math.floor(p.y) === y)) return { ok: false, reason: 'Someone is standing there' };
  if (people.some(p => p.path && p.path.some(t => t.x === x && t.y === y))) return { ok: false, reason: 'Someone is walking there' };
  // every item (incl. the new one) needs an accessible neighbour
  const reach = reachableFromDoor({ x, y });
  const all = [...s.items, { x, y }];
  for (const it of all) {
    const ok = DIRS.some(([dx, dy]) => reach.has((it.y + dy) * 100 + it.x + dx));
    if (!ok) return { ok: false, reason: 'That would block a path' };
  }
  for (const b of Game.barbers) {
    if (b.job) continue;
    const t = tileOf(b);
    if (!reach.has(t.y * 100 + t.x)) return { ok: false, reason: 'That would trap a barber' };
  }
  return { ok: true };
}

function placeItem(type, x, y) {
  const r = canPlace(type, x, y);
  if (!r.ok) return r;
  const s = Game.state;
  s.money -= ITEMS[type].cost;
  s.items.push({ id: s.nextId++, type, x, y });
  sfx('place');
  emit('items');
  return r;
}

function sellItem(item) {
  if (item.reservedBy || item.occupant) return { ok: false, reason: 'In use right now' };
  const s = Game.state;
  s.items = s.items.filter(i => i !== item);
  const refund = Math.floor(ITEMS[item.type].cost * 0.5);
  s.money += refund;
  const p = iso(item.x + 0.5, item.y + 0.5, 30);
  addFloater(p.x, p.y, `+$${refund}`, '#9be564');
  sfx('sell');
  emit('items');
  return { ok: true };
}

// ---------- staff ----------

function randomPerson() {
  const origin = Math.random() < 0.5 ? 'al' : 'si';
  const female = Math.random() < 0.42;
  const hairStyle = pick(female ? HAIR_STYLES_F : HAIR_STYLES_M);
  return {
    origin, female,
    name: pick(NAMES[origin][female ? 'f' : 'm']),
    surname: pick(NAMES[origin].surnames),
    skin: pick(SKIN_TONES),
    hair: hairStyle === 4 ? pick(['#1c1410', '#3b2417', '#7a7a7a']) : pick(HAIR_COLORS),
    hairStyle,
    shirt: pick(SHIRT_COLORS), pants: pick(PANTS_COLORS), shoes: pick(SHOE_COLORS),
    stripes: Math.random() < 0.2,
    dress: female && Math.random() < 0.35,
  };
}

function fullName(b) { return b.surname ? `${b.name} ${b.surname}` : b.name; }

function genCandidates(n) {
  const s = Game.state;
  const out = [];
  const taken = new Set(s.barbers.map(b => b.name));
  for (let i = 0; i < n; i++) {
    let person, tries = 0;
    do { person = randomPerson(); } while (taken.has(person.name) && ++tries < 20);
    taken.add(person.name);
    const skill = clamp(randi(1, 2 + s.stage), 1, 5);
    const speed = Math.round(rand(0.8, 1.15 + s.stage * 0.07) * 100) / 100;
    const wage = Math.round(25 + skill * 16 + (speed - 0.8) * 90 + rand(0, 10));
    delete person.dress;
    out.push({ ...person, skill, speed, wage, fee: wage * 3 });
  }
  return out;
}

function renameBarber(id, name) {
  const b = Game.state.barbers.find(x => x.id === id);
  const clean = String(name || '').replace(/[<>&"]/g, '').trim().slice(0, 16);
  if (!b || !clean) return { ok: false, reason: 'Type a name first' };
  const parts = clean.split(/\s+/);
  b.name = parts[0];
  b.surname = parts.slice(1).join(' ');
  saveGame();
  return { ok: true };
}

function hireCandidate(idx) {
  const s = Game.state, c = s.candidates[idx];
  if (!c) return { ok: false };
  if (s.barbers.length >= stage().maxBarbers) return { ok: false, reason: `${stage().name} fits only ${stage().maxBarbers} barber(s). Expand!` };
  if (s.money < c.fee) return { ok: false, reason: 'Not enough money' };
  s.money -= c.fee;
  const b = { ...c, id: s.nextBarberId++ };
  delete b.fee;
  s.barbers.push(b);
  s.candidates.splice(idx, 1);
  spawnBarberAgent(b, s.barbers.length - 1, true);
  toast(`${fullName(b)} joined the team! ${ORIGINS[b.origin].flag} ✂️`);
  sfx('hire');
  return { ok: true };
}

function fireBarber(id) {
  const s = Game.state;
  const agent = Game.barbers.find(a => a.data.id === id);
  if (!agent || agent.data.owner) return { ok: false };
  if (agent.job) return { ok: false, reason: `${agent.data.name} is busy with a customer` };
  s.barbers = s.barbers.filter(b => b.id !== id);
  Game.barbers = Game.barbers.filter(a => a !== agent);
  if (Game.selected === agent) Game.selected = null;
  toast(`${agent.data.name} left the shop.`);
  return { ok: true };
}

function spawnBarberAgent(data, index, fromDoor) {
  const d = doorTile();
  let x = d.x + 0.5, y = d.y + 0.5;
  if (!fromDoor) {
    const free = freeFloorTiles();
    const pickT = free[(index * 3 + 1) % Math.max(1, free.length)] || d;
    x = pickT.x + 0.5; y = pickT.y + 0.5;
  }
  const a = {
    id: Game.uid++, data, x, y: fromDoor ? -0.2 : y, path: [], state: 'idle', job: null, speed: 1.8,
    barber: true, owner: !!data.owner, skin: data.skin, hair: data.hair, hairStyle: data.hairStyle,
    shirt: data.shirt, pants: data.pants, shoes: data.shoes, female: data.female, origin: data.origin,
    stripes: data.stripes, groomed: true, dir: 1, alpha: 1, mood: 'happy',
  };
  if (fromDoor) {
    const spot = freeFloorTiles().find(t => t.y > 1) || d;
    a.path = [{ x: d.x, y: d.y }, ...(findPath(d.x, d.y, spot.x, spot.y) || [])];
  }
  Game.barbers.push(a);
  return a;
}

function freeFloorTiles() {
  const out = [];
  const n = gridSize();
  const occupied = new Set([...Game.barbers].map(b => `${Math.floor(b.x)},${Math.floor(b.y)}`));
  const reach = reachableFromDoor();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!itemAt(x, y) && reach.has(y * 100 + x) && !occupied.has(`${x},${y}`) && !(x === doorTile().x && y === 0)) out.push({ x, y });
  }
  return out;
}

// ---------- upgrades / expansion ----------

function buyUpgrade(key) {
  const s = Game.state, u = UPGRADES[key], lvl = s.upgrades[key];
  if (lvl >= u.costs.length) return { ok: false, reason: 'Maxed out' };
  if (s.money < u.costs[lvl]) return { ok: false, reason: 'Not enough money' };
  s.money -= u.costs[lvl];
  s.upgrades[key]++;
  toast(`${u.icon} ${u.name} upgraded to level ${s.upgrades[key]}!`);
  sfx('hire');
  return { ok: true };
}

function expandRequirements() {
  const s = Game.state, next = STAGES[s.stage + 1];
  if (!next) return null;
  return [
    { label: `$${next.cost.toLocaleString()}`, ok: s.money >= next.cost },
    { label: `${next.rep.toFixed(1)}★ reputation`, ok: s.rep >= next.rep },
    { label: `${next.served} customers served`, ok: s.stats.served >= next.served },
  ];
}

function expandShop() {
  const s = Game.state, next = STAGES[s.stage + 1];
  if (!next) return { ok: false };
  if (!expandRequirements().every(r => r.ok)) return { ok: false, reason: 'Requirements not met yet' };
  if (Game.customers.length) return { ok: false, reason: 'Wait until the shop is empty (end of day)' };
  s.money -= next.cost;
  s.stage++;
  // the door moves with the bigger room – clear its tile
  const d = doorTile();
  const blocker = itemAt(d.x, d.y);
  if (blocker) {
    const free = freeFloorTiles().filter(t => !(t.x === d.x && t.y === d.y));
    const spot = free[free.length - 1];
    blocker.x = spot.x; blocker.y = spot.y;
  }
  Game.barbers.forEach(b => { b.path = []; });
  s.candidates = genCandidates(3);
  toast(`🎉 Welcome to your ${next.name}!`, 4000);
  sfx('fanfare');
  emit('expand');
  return { ok: true };
}

// ---------- customers ----------

function spawnRatePerHour() {
  const s = Game.state;
  const decor = Math.min(decorScore(), 40);
  return (0.9 + s.rep * 0.75 + decor * 0.08) * (1 + s.stage * 0.5) *
    (1 + s.upgrades.marketing * 0.2) * PRICE_LEVELS[s.priceLevel].demand;
}

function weightedService(female) {
  const list = availableServices().filter(sv => !(female && (sv.id === 'beard' || sv.id === 'shave')));
  if (!list.length) return null;
  const total = list.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (const sv of list) { r -= sv.weight; if (r <= 0) return sv; }
  return list[list.length - 1];
}

function spawnCustomer() {
  const person = randomPerson();
  const service = weightedService(person.female);
  if (!service) return;
  const d = doorTile();
  const patience = rand(70, 130) * (1 + patienceBonus());
  const c = {
    id: Game.uid++, x: d.x + 0.5, y: -0.25, path: [], speed: rand(1.4, 2.0), state: 'enter',
    service, patience, maxPatience: patience, alpha: 0, ...person,
    beard: !person.female && (service.id === 'beard' || service.id === 'shave' || Math.random() < 0.25),
    capeColor: pick(['#2b2d42', '#1d3557', '#6a040f', '#264653']),
    groomed: false, dir: -1, mood: 'neutral',
    seat: null, station: null, barber: null,
  };
  Game.customers.push(c);
  if (Math.random() < 0.55) say(c, 'greet', 0.4);

  const seat = Game.state.items.find(i => ITEMS[i.type].seat && !i.occupant && findPath(d.x, d.y, i.x, i.y));
  if (seat) {
    seat.occupant = c.id;
    c.seat = seat;
    c.path = [{ x: d.x, y: d.y }, ...findPath(d.x, d.y, seat.x, seat.y)];
    return;
  }
  // no seat: take a free station right away, or walk out disappointed
  c.path = [{ x: d.x, y: d.y }];
  if (!tryAssign(c)) {
    c.state = 'leaving';
    c.mood = 'sad';
    c.path = [{ x: d.x, y: d.y }, { px: d.x + 0.5, py: -0.3 }];
    c.lost = true;
    say(c, 'full');
    loseCustomer(c, 0.015, '😞 Full!');
  }
}

function loseCustomer(c, penalty, text) {
  const s = Game.state;
  s.rep = clamp(s.rep - penalty, 0, 5);
  s.today.lost++;
  s.stats.lost++;
  const p = iso(c.x, c.y, 60);
  addFloater(p.x, p.y, text, '#ff6b6b');
}

function freeStation(type) {
  return Game.state.items.filter(i => ITEMS[i.type].station === type && !i.reservedBy);
}

function idleBarbers() {
  return Game.barbers.filter(b => !b.job && b.alpha >= 1);
}

function tryAssign(c) {
  const stations = freeStation(c.service.station);
  const barbers = idleBarbers();
  if (!stations.length || !barbers.length) return false;
  const { t: from, prefix } = startTile(c);
  // closest station to the customer
  stations.sort((a, b) => (Math.abs(a.x - from.x) + Math.abs(a.y - from.y)) - (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)));
  for (const st of stations) {
    const cPath = findPath(from.x, from.y, st.x, st.y);
    if (!cPath) continue;
    // closest barber that can reach a free standing spot
    const byDist = barbers.slice().sort((a, b) => (Math.abs(a.x - st.x) + Math.abs(a.y - st.y)) - (Math.abs(b.x - st.x) + Math.abs(b.y - st.y)));
    for (const b of byDist) {
      const spot = standSpot(st, b);
      if (!spot) continue;
      const bs = startTile(b);
      const bp = findPath(bs.t.x, bs.t.y, spot.x, spot.y);
      if (!bp) continue;
      const bPath = [...bs.prefix, ...bp];
      // commit
      if (c.seat) { c.seat.occupant = null; c.seat = null; }
      st.reservedBy = c.id;
      c.station = st;
      c.barber = b;
      c.state = 'toStation';
      c.sitting = false;
      c.path = [...prefix, ...cPath];
      b.job = { customer: c, station: st, spot };
      b.state = 'toStation';
      b.path = bPath;
      if (Math.random() < 0.35) say(b, 'next');
      return true;
    }
  }
  return false;
}

// Tile an agent paths from; agents still in the doorway (y < 0) first step onto the door tile
function startTile(a) {
  if (a.y < 0) { const d = doorTile(); return { t: d, prefix: [{ x: d.x, y: d.y }] }; }
  return { t: tileOf(a), prefix: [] };
}

function standSpot(st, barber) {
  const taken = new Set(Game.barbers.filter(b => b !== barber && b.job).map(b => `${b.job.spot.x},${b.job.spot.y}`));
  const idleSpots = new Set(Game.barbers.filter(b => b !== barber && !b.job).map(b => `${Math.floor(b.x)},${Math.floor(b.y)}`));
  const reach = reachableFromDoor();
  const prefs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let fallback = null;
  for (const [dx, dy] of prefs) {
    const x = st.x + dx, y = st.y + dy;
    if (!walkable(x, y) || !reach.has(y * 100 + x) || taken.has(`${x},${y}`)) continue;
    if (idleSpots.has(`${x},${y}`)) { fallback = fallback || { x, y }; continue; }
    return { x, y };
  }
  return fallback;
}

function assignJobs() {
  const waiting = Game.customers.filter(c => c.state === 'waiting' || (c.state === 'enter' && c.alpha >= 1));
  waiting.sort((a, b) => a.patience / a.maxPatience - b.patience / b.maxPatience);
  for (const c of waiting) {
    if (!idleBarbers().length) break;
    tryAssign(c);
  }
}

// ---------- movement ----------

function moveAgent(a, dt) {
  if (!a.path.length) { a.moving = false; return true; }
  const n = a.path[0];
  const tx = n.px !== undefined ? n.px : n.x + 0.5;
  const ty = n.py !== undefined ? n.py : n.y + 0.5;
  const dx = tx - a.x, dy = ty - a.y;
  const dist = Math.hypot(dx, dy);
  const step = a.speed * dt;
  const sdx = dx - dy;
  if (Math.abs(sdx) > 0.01) a.dir = sdx > 0 ? 1 : -1;
  a.moving = true;
  a.walkT = (a.walkT || 0) + dt;
  if (dist <= step) {
    a.x = tx; a.y = ty;
    a.path.shift();
    if (!a.path.length) { a.moving = false; return true; }
  } else {
    a.x += dx / dist * step;
    a.y += dy / dist * step;
  }
  return false;
}

function sendHome(c) {
  const d = doorTile();
  const t = tileOf(c);
  const p = findPath(t.x, t.y, d.x, d.y) || [];
  c.path = [...p, { px: d.x + 0.5, py: -0.3 }];
  c.state = 'leaving';
  c.sitting = false;
  c.cape = false;
  c.towel = false;
}

// ---------- update ----------

function update(dtReal) {
  const s = Game.state;
  Game.t += dtReal;
  updateFloaters(dtReal);
  updateSparkles(dtReal);
  if (Game.paused || Game.nightMode) return;
  tickSpeech(dtReal * Game.speed);
  const dt = dtReal * Game.speed;
  const dtMin = dt * MIN_PER_SEC;

  s.time += dtMin;

  // spawning
  if (s.time < CLOSE_TIME - 20) {
    Game.spawnAcc += spawnRatePerHour() / 60 * dtMin;
    while (Game.spawnAcc >= 1) {
      Game.spawnAcc -= 1;
      spawnCustomer();
    }
  }

  assignJobs();

  for (const c of Game.customers.slice()) updateCustomer(c, dt, dtMin);
  for (const b of Game.barbers) updateBarber(b, dt, dtMin);
  updateParticles(dt);

  // closing: force the last waiting customers out
  if (s.time > CLOSE_TIME + 120) {
    Game.customers.filter(c => c.state === 'waiting' || c.state === 'enter').forEach(c => {
      if (c.seat) { c.seat.occupant = null; c.seat = null; }
      sendHome(c); c.mood = 'sad';
    });
  }
  if (s.time >= CLOSE_TIME && Game.customers.length === 0) endDay();
}

function updateCustomer(c, dt, dtMin) {
  const s = Game.state;
  switch (c.state) {
    case 'enter':
      c.alpha = Math.min(1, c.alpha + dt * 3);
      patienceTick(c, dtMin * 0.5);
      if (moveAgent(c, dt)) { c.state = 'waiting'; c.sitting = !!c.seat; c.dir = 1; }
      break;
    case 'waiting':
      patienceTick(c, dtMin);
      break;
    case 'toStation':
      c.alpha = Math.min(1, c.alpha + dt * 3);
      if (moveAgent(c, dt)) { c.state = 'atStation'; c.sitting = true; c.dir = 1; }
      break;
    case 'atStation':
      if (c.barber.state === 'working' && !c.inService) {
        c.inService = true;
        c.cape = c.service.station !== 'sink';
        c.towel = c.service.station === 'sink' || c.service.id === 'shave';
        const itemSpeed = ITEMS[c.station.type].speed || 1;
        c.duration = c.service.time / (c.barber.data.speed * (1 + s.upgrades.clippers * 0.15) * itemSpeed);
        c.progress = 0;
      }
      if (c.inService) {
        c.progress += dtMin / c.duration;
        if (Math.random() < dt * 4 && c.service.station === 'chair') addHairBit(c);
        if (c.progress >= 1) finishService(c);
      }
      break;
    case 'toPay':
      if (moveAgent(c, dt)) { c.state = 'paying'; c.timer = 6; }
      break;
    case 'paying':
      c.timer -= dtMin;
      if (c.timer <= 0) { pay(c); sendHome(c); }
      break;
    case 'leaving':
      if (c.path.length <= 1) c.alpha = Math.max(0, c.alpha - dt * 2.5);
      if (moveAgent(c, dt) || c.alpha <= 0) {
        Game.customers = Game.customers.filter(o => o !== c);
        if (Game.selected === c) Game.selected = null;
      }
      break;
  }
}

function patienceTick(c, dtMin) {
  c.patience -= dtMin;
  c.mood = c.patience / c.maxPatience < 0.3 ? 'angry' : 'neutral';
  if (c.patience <= 0) {
    if (c.seat) { c.seat.occupant = null; c.seat = null; }
    sendHome(c);
    c.mood = 'angry';
    say(c, 'angry');
    loseCustomer(c, 0.05, '😡 Too slow!');
  }
}

function finishService(c) {
  const s = Game.state;
  const b = c.barber;
  const skill = barberSkill(b.data);
  const waitFrac = clamp(c.patience / c.maxPatience, 0, 1);
  const decor = Math.min(decorScore(), 40);
  let sat = 0.5 + waitFrac * 0.2 + (skill - 1) / 4 * 0.22 + decor / 40 * 0.1 + PRICE_LEVELS[s.priceLevel].sat + rand(-0.05, 0.05);
  sat = clamp(sat, 0, 1);
  let delta = (sat - 0.45) * 0.15;
  if (delta > 0) delta *= Math.max(0.15, (5.2 - s.rep) / 4);
  s.rep = clamp(s.rep + delta, 0, 5);

  c.groomed = true;
  c.sat = sat;
  addSparkles(c);
  c.mood = sat > 0.55 ? 'happy' : 'neutral';
  c.inService = false;
  c.cape = false; c.towel = false;
  c.station.reservedBy = null;
  c.station = null;

  b.job = null;
  b.state = 'idle';
  b.working = false;

  const hasRegister = s.items.some(i => ITEMS[i.type].register);
  const price = Math.round(c.service.price * PRICE_LEVELS[s.priceLevel].price);
  const tip = Math.round(price * sat * 0.25 * (1 + s.upgrades.loyalty * 0.15) * (hasRegister ? 1.1 : 1));
  c.bill = { price, tip };
  s.today.served++;
  s.stats.served++;

  const reg = nearestRegisterSpot(c);
  if (reg) {
    c.state = 'toPay';
    c.sitting = false;
    c.path = reg.path;
  } else {
    pay(c);
    sendHome(c);
  }
}

function nearestRegisterSpot(c) {
  const t = tileOf(c);
  let best = null;
  for (const r of Game.state.items.filter(i => ITEMS[i.type].register)) {
    for (const [dx, dy] of DIRS) {
      const x = r.x + dx, y = r.y + dy;
      if (!walkable(x, y)) continue;
      const path = findPath(t.x, t.y, x, y);
      if (path && (!best || path.length < best.path.length)) best = { path, x, y };
    }
  }
  return best;
}

function pay(c) {
  const s = Game.state;
  const total = c.bill.price + c.bill.tip;
  s.money += total;
  s.today.revenue += c.bill.price;
  s.today.tips += c.bill.tip;
  s.stats.earned += total;
  const p = iso(c.x, c.y, 58);
  addFloater(p.x, p.y, `+$${total}`, '#9be564');
  say(c, c.sat > 0.6 ? 'happy' : 'ok');
  const emo = c.sat > 0.8 ? '😍' : c.sat > 0.6 ? '😊' : c.sat > 0.45 ? '🙂' : '😐';
  addFloater(p.x + 18, p.y - 6, emo, null, 1.6);
  sfx('cash');
}

function updateBarber(b, dt) {
  b.alpha = Math.min(1, (b.alpha || 0) + dt * 3);
  if (b.state === 'toStation') {
    if (moveAgent(b, dt)) {
      b.state = 'waitCustomer';
    }
  }
  if (b.state === 'waitCustomer' && b.job) {
    const c = b.job.customer;
    // face the chair
    const st = b.job.station;
    const sdx = (st.x - Math.floor(b.x)) - (st.y - Math.floor(b.y));
    if (sdx) b.dir = sdx > 0 ? 1 : -1;
    if (c.state === 'atStation') { b.state = 'working'; b.working = true; }
  }
  if (b.state === 'idle' && b.path.length) moveAgent(b, dt);
  if (b.state === 'idle' && !b.path.length) {
    b.moving = false;
    b.idleT = (b.idleT || 0) + dt;
    // wander a bit when bored
    if (b.idleT > 8 && Math.random() < dt * 0.3) {
      b.idleT = 0;
      const t = tileOf(b);
      const opts = freeFloorTiles().filter(o => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) <= 3 && o.y > 0);
      if (opts.length) {
        const o = pick(opts);
        b.path = findPath(t.x, t.y, o.x, o.y) || [];
      }
    }
  }
}

// ---------- effects ----------

// Speech bubble in the speaker's own language
function say(agent, kind, delay = 0) {
  const lang = agent.origin && PHRASES[agent.origin] ? agent.origin : pick(['al', 'si']);
  agent.say = { text: pick(PHRASES[lang][kind]), life: 2.6 + delay, delay };
}

function tickSpeech(dt) {
  for (const a of [...Game.customers, ...Game.barbers]) {
    if (!a.say) continue;
    a.say.life -= dt;
    a.say.delay -= dt;
    if (a.say.life <= 0) a.say = null;
  }
}

function addSparkles(c) {
  const p = iso(c.x, c.y, 50);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    Game.sparkles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 26, vy: Math.sin(a) * 16 - 6, life: 0.9 });
  }
}

function updateSparkles(dt) {
  for (const s of Game.sparkles) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.94; s.vy *= 0.94; s.life -= dt; }
  Game.sparkles = Game.sparkles.filter(s => s.life > 0);
}

function addFloater(x, y, text, color, life = 1.4) {
  Game.floaters.push({ x, y, text, color, life, max: life });
}

function updateFloaters(dt) {
  for (const f of Game.floaters) { f.life -= dt; f.y -= dt * 22; }
  Game.floaters = Game.floaters.filter(f => f.life > 0);
}

function addHairBit(c) {
  const p = iso(c.x, c.y, 34);
  Game.particles.push({ x: p.x + rand(-8, 8), y: p.y + rand(-6, 2), vy: 0, vx: rand(-8, 8), life: 1.2, floorY: iso(c.x, c.y).y + rand(-3, 6), color: c.hair });
}

function updateParticles(dt) {
  for (const p of Game.particles) {
    if (p.y < p.floorY) { p.vy += 60 * dt; p.y += p.vy * dt; p.x += p.vx * dt; }
    p.life -= dt * 0.25;
  }
  Game.particles = Game.particles.filter(p => p.life > 0).slice(-150);
}

// ---------- day cycle ----------

function endDay() {
  const s = Game.state;
  const wages = s.barbers.reduce((a, b) => a + (b.wage || 0), 0);
  const rent = stage().rent;
  s.money -= wages + rent;
  const summary = { ...s.today, day: s.day, wages, rent, repEnd: s.rep, money: s.money };
  Game.nightMode = true;
  Game.particles = [];
  s.day++;
  s.time = OPEN_TIME;
  s.today = freshToday(s.rep);
  s.candidates = genCandidates(3);
  saveGame();
  emit({ type: 'dayEnd', summary });
}

function startDay() {
  Game.nightMode = false;
  Game.spawnAcc = 0;
  emit('dayStart');
}

// ---------- save / load ----------

const SAVE_KEY = 'cani-barber-tycoon-save-v1';

function saveGame() {
  try {
    const s = Game.state;
    const items = s.items.map(({ id, type, x, y }) => ({ id, type, x, y }));
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...s, items }));
  } catch (e) { /* storage unavailable */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return null;
    // a save made mid-day resumes at the start of that day (customers are not persisted)
    s.time = OPEN_TIME;
    s.today = freshToday(s.rep);
    return s;
  } catch (e) { return null; }
}

function resetGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
