// Game state + simulation (customers, barbers, economy)

const Game = {
  state: null,
  customers: [],
  barbers: [],        // runtime agents, one per state.barbers entry
  floaters: [],       // floating texts (+$20, emotes)
  particles: [],      // hair clippings
  sparkles: [],       // fresh-cut sparkles
  coins: [],          // coins flying to the money counter
  piles: [],          // hair on the floor
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
  add('register', 4, 1);
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
  Game.coins = [];
  Game.piles = [];
  Game.selected = null;
  state.bills = state.bills || [];
  state.hints = state.hints || {};
  state.week = state.week || { revenue: 0 };
  state.nextBillId = state.nextBillId || 1;
  for (const k of Object.keys(UPGRADES)) if (state.upgrades[k] === undefined) state.upgrades[k] = 0;
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

// electric decor stops counting during a power cut
const itemPowered = i => !(ITEMS[i.type].electric && utilityOff('power'));

function decorScore() {
  return Game.state.items.reduce((s, i) => s + (itemPowered(i) ? ITEMS[i.type].decor || 0 : 0), 0);
}

function patienceBonus() {
  const fromItems = Game.state.items.reduce((s, i) => s + (itemPowered(i) ? ITEMS[i.type].patience || 0 : 0), 0);
  return Math.min(0.6, fromItems + Game.state.upgrades.loyalty * 0.1);
}

function availableServices() {
  const s = Game.state;
  const stations = new Set(s.items.filter(i => ITEMS[i.type].station && stationWorks(i)).map(i => ITEMS[i.type].station));
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
  if (item.reservedBy || item.occupant || Game.customers.some(c => c.register === item && c.state !== 'leaving')) return { ok: false, reason: 'In use right now' };
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
  if ((u.stage || 0) > s.stage) return { ok: false, reason: `Unlocks at ${STAGES[u.stage].name}` };
  if (s.money < u.costs[lvl]) return { ok: false, reason: 'Not enough money' };
  s.money -= u.costs[lvl];
  s.upgrades[key]++;
  toast(u.helper ? `${u.icon} ${u.name} hired! They'll handle that for you now.` : `${u.icon} ${u.name} upgraded to level ${s.upgrades[key]}!`);
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
    seat: null, station: null, cutBy: null,
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
  // no seat: wait standing near the door (max 2), or walk out disappointed
  const standing = Game.customers.filter(o => o.standing && (o.state === 'waiting' || o.state === 'enter')).length;
  const spot = standing < 2 && freeFloorTiles()
    .filter(t => !Game.customers.some(o => o !== c && Math.floor(o.x) === t.x && Math.floor(o.y) === t.y))
    .sort((a, b) => (Math.abs(a.x - d.x) + a.y) - (Math.abs(b.x - d.x) + b.y))[0];
  const spotPath = spot && findPath(d.x, d.y, spot.x, spot.y);
  if (spotPath) {
    c.standing = true;
    c.path = [{ x: d.x, y: d.y }, ...spotPath];
  } else {
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

  updateBills(dtMin);

  // spawning
  if (s.time < CLOSE_TIME - 20) {
    Game.spawnAcc += spawnRatePerHour() / 60 * dtMin;
    while (Game.spawnAcc >= 1) {
      Game.spawnAcc -= 1;
      spawnCustomer();
      sfx('door');
    }
  }

  if (hasHelper('receptionist')) autoSeat();
  assignBarbers();
  if (hasHelper('cleaner') && Game.piles.length) {
    Game.cleanT = (Game.cleanT || 0) + dtMin;
    if (Game.cleanT > 25) { Game.cleanT = 0; sweep(Game.piles[0]); }
  }

  for (const c of Game.customers.slice()) updateCustomer(c, dt, dtMin);
  for (const b of Game.barbers) updateBarber(b, dt, dtMin);
  updateParticles(dt);

  // closing: send the last waiting customers home and settle open payments
  if (s.time > CLOSE_TIME + 90) {
    Game.customers.forEach(c => {
      if (c.state === 'waiting' || c.state === 'enter') {
        if (c.seat) { c.seat.occupant = null; c.seat = null; }
        sendHome(c); c.mood = 'sad';
      } else if (c.state === 'done' || c.state === 'atRegister') leaveWithoutTip(c);
    });
  }
  if (s.time >= CLOSE_TIME && Game.customers.length === 0) endDay();
}

function freeStation(type) {
  return Game.state.items.filter(i => ITEMS[i.type].station === type && !i.reservedBy && stationWorks(i));
}

// Water-based stations stop working while the water bill is overdue
function stationWorks(item) {
  const st = ITEMS[item.type].station;
  return !((st === 'sink' || st === 'color') && utilityOff('water'));
}

function idleBarbers() {
  return Game.barbers.filter(b => !b.job && b.alpha >= 1);
}

const hasHelper = key => Game.state.upgrades[key] > 0;
const registers = () => Game.state.items.filter(i => ITEMS[i.type].register);

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

// ---------- directing customers (player taps) ----------

// Send a waiting customer to a specific station. The next free barber follows on their own.
function seatAt(c, st) {
  if (!(c.state === 'waiting' || c.state === 'enter')) return { ok: false, reason: `${c.name} is busy` };
  if (ITEMS[st.type].station !== c.service.station) {
    const need = { chair: 'a barber chair', sink: 'a Wash Sink', color: 'a Color Station' }[c.service.station];
    return { ok: false, reason: `${c.name} wants a ${c.service.name} – that needs ${need}` };
  }
  if (!stationWorks(st)) return { ok: false, reason: '💧 No water! Pay the water bill first' };
  if (st.reservedBy) return { ok: false, reason: 'That station is taken' };
  const { t: from, prefix } = startTile(c);
  const path = findPath(from.x, from.y, st.x, st.y);
  if (!path) return { ok: false, reason: "Can't reach that station" };
  if (c.seat) { c.seat.occupant = null; c.seat = null; }
  st.reservedBy = c.id;
  c.station = st;
  c.cutBy = null;
  c.state = 'toStation';
  c.sitting = false;
  c.path = [...prefix, ...path];
  c.standing = false;
  return { ok: true };
}

// Pair customers who sit at a station with the nearest free barber
function assignBarbers() {
  const needy = Game.customers.filter(c => (c.state === 'toStation' || c.state === 'atStation') && !c.cutBy);
  for (const c of needy) {
    const st = c.station;
    const barbers = idleBarbers().sort((a, b) => (Math.abs(a.x - st.x) + Math.abs(a.y - st.y)) - (Math.abs(b.x - st.x) + Math.abs(b.y - st.y)));
    for (const b of barbers) {
      const spot = standSpot(st, b);
      if (!spot) continue;
      const bs = startTile(b);
      const bp = findPath(bs.t.x, bs.t.y, spot.x, spot.y);
      if (!bp) continue;
      c.cutBy = b;
      b.job = { customer: c, station: st, spot };
      b.state = 'toStation';
      b.path = [...bs.prefix, ...bp];
      if (Math.random() < 0.35) say(b, 'next');
      break;
    }
  }
}

// Receptionist helper: seat waiting customers automatically
function autoSeat() {
  const waiting = Game.customers.filter(c => c.state === 'waiting' || (c.state === 'enter' && c.alpha >= 1));
  waiting.sort((a, b) => a.patience / a.maxPatience - b.patience / b.maxPatience);
  for (const c of waiting) {
    const st = nearestFreeStation(c);
    if (st) seatAt(c, st);
  }
}

function nearestFreeStation(c) {
  const from = startTile(c).t;
  const list = freeStation(c.service.station)
    .sort((a, b) => (Math.abs(a.x - from.x) + Math.abs(a.y - from.y)) - (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)));
  return list.find(st => findPath(from.x, from.y, st.x, st.y)) || null;
}

function customerNeedsSeat(c) {
  return (c.state === 'waiting' || (c.state === 'enter' && c.alpha >= 1)) && freeStation(c.service.station).length > 0;
}

// Tapping a free station calls the waiting customer who has waited longest for it
function callNextTo(st) {
  const type = ITEMS[st.type].station;
  const waiting = Game.customers
    .filter(c => (c.state === 'waiting' || c.state === 'enter') && c.service.station === type)
    .sort((a, b) => a.patience / a.maxPatience - b.patience / b.maxPatience);
  if (!waiting.length) return { ok: false, reason: 'Nobody is waiting for this station' };
  return seatAt(waiting[0], st);
}

function sendToRegister(c, reg) {
  if (c.state !== 'done') return { ok: false, reason: `${c.name} isn't ready to pay` };
  const spot = registerSpot(c, reg);
  if (!spot) return { ok: false, reason: "Can't reach that register" };
  releaseStation(c);
  c.state = 'toPay';
  c.sitting = false;
  c.register = reg;
  c.path = spot.path;
  return { ok: true };
}

function registerSpot(c, reg) {
  const t = tileOf(c);
  let best = null;
  const regs = reg ? [reg] : registers();
  for (const r of regs) {
    for (const [dx, dy] of DIRS) {
      const x = r.x + dx, y = r.y + dy;
      if (!walkable(x, y)) continue;
      const path = findPath(t.x, t.y, x, y);
      if (path && (!best || path.length < best.path.length)) best = { path, x, y, reg: r };
    }
  }
  return best;
}

function releaseStation(c) {
  if (c.station) { c.station.reservedBy = null; c.station = null; }
}

// Ring up the first customer waiting at a register
function ringUp(reg) {
  const queue = Game.customers.filter(c => c.state === 'atRegister' && (!reg || c.register === reg)).sort((a, b) => a.arrivedAt - b.arrivedAt);
  if (!queue.length) return { ok: false, reason: 'Nobody is waiting to pay' };
  const c = queue[0];
  const fast = c.regWait < 12;
  pay(c, fast ? 1.25 : 1);
  sendHome(c);
  return { ok: true };
}

function collectAtChair(c) {
  if (c.state !== 'done') return { ok: false };
  pay(c, c.payWait < 12 ? 1.15 : 1);
  releaseStation(c);
  sendHome(c);
  return { ok: true };
}

// Tapping a customer during a cut helps the barber along
function boostService(c) {
  const now = Game.t;
  if (now - (c.lastTap || 0) < 0.09) return;
  c.lastTap = now;
  c.progress = Math.min(0.999, c.progress + 0.03);
  c.taps = (c.taps || 0) + 1;
  addHairBit(c); addHairBit(c);
  const p = iso(c.x, c.y, 46 + rand(-6, 6));
  Game.sparkles.push({ x: p.x + rand(-10, 10), y: p.y, vx: rand(-20, 20), vy: -30, life: 0.5 });
  sfx(c.service.id === 'buzz' || c.service.id === 'fade' ? 'buzz' : 'snip');
}

// One entry point for taps on the shop floor
function handleWorldTap(agent, item, tile) {
  const sel = Game.selected;
  // 1. a selected customer is being directed somewhere
  if (sel && !sel.barber && item) {
    if ((sel.state === 'waiting' || sel.state === 'enter') && ITEMS[item.type].station) {
      const r = seatAt(sel, item);
      if (r.ok) { sfx('go'); Game.selected = null; hint('barber', '✂️ A free barber walks over on their own. Tap customers during the cut to speed it up!'); }
      else { sfx('error'); toast(r.reason, 2200, 'warn'); }
      return;
    }
    if (sel.state === 'done' && ITEMS[item.type].register) {
      const r = sendToRegister(sel, item);
      if (r.ok) { sfx('go'); Game.selected = null; hint('ring', '🔔 Tap the register to ring them up. Quick service earns a bigger tip!'); }
      else { sfx('error'); toast(r.reason, 2200, 'warn'); }
      return;
    }
  }
  // 2. registers ring up whoever is waiting
  if (item && ITEMS[item.type].register && Game.customers.some(c => c.state === 'atRegister' && c.register === item)) {
    ringUp(item);
    return;
  }
  // tapping a working barber helps with their customer
  if (agent && agent.barber && agent.state === 'working' && agent.job) agent = agent.job.customer;
  // hair under a barber's feet can still be swept
  const pileHere = Game.piles.find(p => p.x === tile.x && p.y === tile.y);
  if (pileHere && (!agent || agent.barber)) { sweep(pileHere); return; }
  if (agent && !agent.barber) {
    if (agent.state === 'atRegister') { ringUp(agent.register); return; }
    if (agent.state === 'atStation' && agent.inService) { boostService(agent); Game.selected = agent; return; }
    if (agent.state === 'done' && !registers().length) { collectAtChair(agent); return; }
    Game.selected = agent;
    sfx('select');
    if (agent.state === 'waiting' || agent.state === 'enter') hint('seat2', '👉 Now tap a glowing chair to send them there.');
    if (agent.state === 'done') hint('pay2', '👉 Now tap the glowing register.');
    return;
  }
  if (agent) { Game.selected = agent; sfx('select'); return; }
  // 3. sweep hair
  const pile = Game.piles.find(p => p.x === tile.x && p.y === tile.y);
  if (pile) { sweep(pile); return; }
  // 4. tapping a free station calls the next customer
  if (item && ITEMS[item.type].station && !item.reservedBy) {
    const r = callNextTo(item);
    if (r.ok) sfx('go'); else if (Game.customers.some(c => c.state === 'waiting')) toast(r.reason, 2000, 'warn');
    Game.selected = null;
    return;
  }
  Game.selected = null;
}

function hint(key, text) {
  const s = Game.state;
  s.hints = s.hints || {};
  if (s.hints[key]) return;
  s.hints[key] = true;
  hintQueue.push(text);
  if (hintQueue.length === 1) showNextHint();
}

// tutorial hints appear one at a time so they never pile up over the shop
const hintQueue = [];
function showNextHint() {
  if (!hintQueue.length) return;
  toast(hintQueue[0], 4000, 'hint');
  setTimeout(() => { hintQueue.shift(); showNextHint(); }, 4300);
}

// ---------- hair on the floor ----------

function dropHair(c, amount) {
  const st = c.station;
  if (!st) return;
  const spots = DIRS.map(([dx, dy]) => ({ x: st.x + dx, y: st.y + dy })).filter(t => walkable(t.x, t.y) && !(t.x === doorTile().x && t.y === 0));
  if (!spots.length) return;
  const t = spots[(st.x * 7 + st.y * 3 + Game.piles.length) % spots.length];
  let pile = Game.piles.find(p => p.x === t.x && p.y === t.y);
  if (!pile) { pile = { x: t.x, y: t.y, amount: 0, color: c.hair, seed: Math.random() }; Game.piles.push(pile); }
  pile.amount = Math.min(3, pile.amount + amount);
  if (pile.amount >= 1) hint('sweep', '🧹 Hair on the floor makes customers unhappy. Tap it to sweep!');
}

function dirtiness() {
  return Game.piles.reduce((a, p) => a + p.amount, 0);
}

function sweep(pile) {
  Game.piles = Game.piles.filter(p => p !== pile);
  const p = iso(pile.x + 0.5, pile.y + 0.5, 6);
  for (let i = 0; i < 6; i++) Game.sparkles.push({ x: p.x, y: p.y, vx: rand(-40, 40), vy: rand(-40, -10), life: 0.6 });
  addFloater(p.x, p.y - 10, '✨ Clean!', '#bde0fe', 1);
  sfx('sweep');
}

// ---------- update ----------

function updateCustomer(c, dt, dtMin) {
  const s = Game.state;
  switch (c.state) {
    case 'enter':
      c.alpha = Math.min(1, c.alpha + dt * 3);
      patienceTick(c, dtMin * 0.5);
      if (moveAgent(c, dt)) { c.state = 'waiting'; c.sitting = !!c.seat; c.dir = 1; }
      break;
    case 'waiting':
      patienceTick(c, dtMin * (c.standing ? 1.5 : 1));
      if (customerNeedsSeat(c)) hint('seat', `👆 ${c.name} is waiting! Tap them, then tap a free chair.`);
      break;
    case 'toStation':
      c.alpha = Math.min(1, c.alpha + dt * 3);
      if (moveAgent(c, dt)) { c.state = 'atStation'; c.sitting = true; c.dir = 1; }
      break;
    case 'atStation':
      if (!c.inService) patienceTick(c, dtMin * 0.4);
      if (c.state !== 'atStation') break;
      if (c.cutBy && c.cutBy.state === 'working' && !c.inService) {
        c.inService = true;
        c.cape = c.service.station !== 'sink';
        c.towel = c.service.station === 'sink' || c.service.id === 'shave';
        const itemSpeed = ITEMS[c.station.type].speed || 1;
        const power = utilityOff('power') ? 0.75 : 1;
        c.duration = c.service.time / (c.cutBy.data.speed * (1 + s.upgrades.clippers * 0.15) * itemSpeed * power);
        c.progress = 0;
      }
      if (c.inService) {
        c.progress += dtMin / c.duration;
        if (Math.random() < dt * 4 && c.service.station === 'chair') addHairBit(c);
        if (Math.random() < dt * 0.9) sfx(c.service.id === 'buzz' || c.service.id === 'fade' ? 'buzz' : c.service.station === 'sink' ? 'water' : 'snip', 0.35);
        if (c.progress >= 1) finishService(c);
      }
      break;
    case 'done':
      c.payWait += dtMin;
      if (hasHelper('cashier')) {
        if (registers().length) { if (c.payWait > 3) sendToRegister(c); }
        else if (c.payWait > 4) collectAtChair(c);
      } else {
        hint(registers().length ? 'pay' : 'payChair', registers().length
          ? `💵 ${c.name} is done! Tap them, then tap the register.`
          : `💵 ${c.name} is done! Tap them to take the money.`);
      }
      if (c.state === 'done' && c.payWait > 90) leaveWithoutTip(c);
      break;
    case 'toPay':
      if (moveAgent(c, dt)) { c.state = 'atRegister'; c.regWait = 0; c.arrivedAt = Game.t; c.dir = 1; }
      break;
    case 'atRegister':
      c.regWait += dtMin;
      if (hasHelper('cashier') && c.regWait > 6) {
        const first = Game.customers.filter(o => o.state === 'atRegister' && o.register === c.register).sort((a, b) => a.arrivedAt - b.arrivedAt)[0];
        if (first === c) { pay(c, 1); sendHome(c); }
      } else if (c.regWait > 70) leaveWithoutTip(c);
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

function leaveWithoutTip(c) {
  c.bill.tip = 0;
  pay(c, 1, true);
  releaseStation(c);
  sendHome(c);
  Game.state.rep = clamp(Game.state.rep - 0.02, 0, 5);
  const p = iso(c.x, c.y, 70);
  addFloater(p.x, p.y, '💸 No tip – too slow', '#ffb4a2', 1.8);
}

function patienceTick(c, dtMin) {
  c.patience -= dtMin;
  c.mood = c.patience / c.maxPatience < 0.3 ? 'angry' : 'neutral';
  if (c.patience <= 0) {
    if (c.seat) { c.seat.occupant = null; c.seat = null; }
    releaseStation(c);
    if (c.cutBy) { c.cutBy.job = null; c.cutBy.state = 'idle'; c.cutBy.working = false; c.cutBy = null; }
    sendHome(c);
    c.mood = 'angry';
    say(c, 'angry');
    sfx('angry');
    loseCustomer(c, 0.05, '😡 Too slow!');
  }
}

function finishService(c) {
  const s = Game.state;
  const b = c.cutBy;
  const skill = barberSkill(b.data);
  const waitFrac = clamp(c.patience / c.maxPatience, 0, 1);
  const decor = Math.min(decorScore(), 40);
  let sat = 0.5 + waitFrac * 0.2 + (skill - 1) / 4 * 0.22 + decor / 40 * 0.1 + PRICE_LEVELS[s.priceLevel].sat + rand(-0.05, 0.05);
  sat -= Math.min(0.2, dirtiness() * 0.025);
  if (utilityOff('power')) sat -= 0.08;
  sat = clamp(sat, 0, 1);
  let delta = (sat - 0.45) * 0.15;
  if (delta > 0) delta *= Math.max(0.15, (5.2 - s.rep) / 4);
  s.rep = clamp(s.rep + delta, 0, 5);

  c.groomed = true;
  c.sat = sat;
  addSparkles(c);
  sfx('done');
  c.mood = sat > 0.55 ? 'happy' : 'neutral';
  c.inService = false;
  c.cape = false; c.towel = false;
  if (c.service.station === 'chair') dropHair(c, 1);

  b.job = null;
  b.state = 'idle';
  b.working = false;
  c.cutBy = null;

  const price = Math.round(c.service.price * PRICE_LEVELS[s.priceLevel].price);
  const tip = Math.round(price * sat * 0.25 * (1 + s.upgrades.loyalty * 0.15) * (registers().length ? 1.1 : 1));
  c.bill = { price, tip };
  s.today.served++;
  s.stats.served++;
  // stays in the chair until someone takes their money
  c.state = 'done';
  c.payWait = 0;
}

function pay(c, tipMult = 1, quiet) {
  const s = Game.state;
  const tip = Math.round(c.bill.tip * tipMult);
  const total = c.bill.price + tip;
  s.money += total;
  s.today.revenue += c.bill.price;
  s.today.tips += tip;
  s.stats.earned += total;
  s.week = s.week || { revenue: 0 };
  s.week.revenue += total;
  const p = iso(c.x, c.y, 58);
  addFloater(p.x, p.y, `+$${total}`, '#9be564');
  if (tipMult > 1) addFloater(p.x, p.y - 16, '⚡ Fast service!', '#ffe066', 1.6);
  if (!quiet) {
    say(c, c.sat > 0.6 ? 'happy' : 'ok');
    const emo = c.sat > 0.8 ? '😍' : c.sat > 0.6 ? '😊' : c.sat > 0.45 ? '🙂' : '😐';
    addFloater(p.x + 18, p.y - 6, emo, null, 1.6);
  }
  flyCoins(p.x, p.y, Math.min(8, 2 + Math.floor(total / 15)));
  sfx('cash');
}

// Coins that fly from the shop floor up to the money counter (drawn in screen space)
function flyCoins(wx, wy, n) {
  for (let i = 0; i < n; i++) Game.coins.push({ wx, wy, delay: i * 0.06, t: 0, jitter: rand(-14, 14) });
}

function updateBarber(b, dt) {
  b.alpha = Math.min(1, (b.alpha || 0) + dt * 3);
  if (b.state === 'toStation') {
    if (moveAgent(b, dt)) b.state = 'waitCustomer';
  }
  if (b.state === 'waitCustomer' && b.job) {
    const c = b.job.customer;
    const st = b.job.station;
    const sdx = (st.x - Math.floor(b.x)) - (st.y - Math.floor(b.y));
    if (sdx) b.dir = sdx > 0 ? 1 : -1;
    if (c.state === 'atStation') { b.state = 'working'; b.working = true; }
  }
  if (b.state === 'idle' && b.path.length) moveAgent(b, dt);
  if (b.state === 'idle' && !b.path.length) {
    b.moving = false;
    b.idleT = (b.idleT || 0) + dt;
    if (b.idleT > 8 && Math.random() < dt * 0.3) {
      b.idleT = 0;
      const t = tileOf(b);
      const opts = freeFloorTiles().filter(o => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) <= 3 && o.y > 0);
      if (opts.length) { const o = pick(opts); b.path = findPath(t.x, t.y, o.x, o.y) || []; }
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
  s.money -= wages;
  // late fees and reputation damage for overdue bills
  let lateFees = 0;
  for (const b of s.bills) {
    if (s.day >= b.due) {
      const fee = Math.max(2, Math.round(b.amount * 0.1));
      b.amount += fee; lateFees += fee; b.late = true;
      s.rep = clamp(s.rep - 0.04, 0, 5);
    }
  }
  const newBills = issueBills(s.day);
  const summary = { ...s.today, day: s.day, wages, lateFees, newBills, repEnd: s.rep, money: s.money, unpaid: s.bills.reduce((a, b) => a + b.amount, 0) };
  Game.nightMode = true;
  Game.particles = [];
  Game.piles = [];          // the night cleaner sweeps up
  s.day++;
  s.time = OPEN_TIME;
  s.today = freshToday(s.rep);
  s.candidates = genCandidates(3);
  saveGame();
  emit({ type: 'dayEnd', summary });
}

// ---------- bills ----------

// Bills arrive at closing time and are due a few days later. Pay them from the Bills tab.
function issueBills(day) {
  const s = Game.state, st = stage();
  const out = [];
  const add = (type, amount, days) => {
    amount = Math.round(amount);
    if (amount <= 0) return;
    const b = { id: s.nextBillId++, type, amount, issued: day, due: day + days };
    s.bills.push(b); out.push(b);
  };
  if (st.rent > 0) add('rent', st.rent, 2);
  add('supplies', 4 + s.today.served * 1.3, 3);
  if (day % 3 === 0) {
    const electric = s.items.filter(i => ITEMS[i.type].electric).length;
    add('power', (8 + s.items.length * 1.2 + electric * 4 + s.stage * 10) * 3, 3);
    const sinks = s.items.filter(i => ITEMS[i.type].station === 'sink' || ITEMS[i.type].station === 'color').length;
    add('water', (5 + sinks * 7 + s.stage * 5) * 3, 3);
  }
  if (day % 5 === 0) add('internet', 20 + s.stage * 8, 4);
  if (day % 7 === 0) { add('tax', s.week.revenue * 0.1, 4); s.week.revenue = 0; }
  return out;
}

function utilityOff(type) {
  const s = Game.state;
  return !!(s && s.bills && s.bills.some(b => b.type === type && s.day > b.due));
}

let lastPowerOff = false, lastWaterOff = false;
function updateBills() {
  const p = utilityOff('power'), w = utilityOff('water');
  if (p && !lastPowerOff) { toast('⚡ Power cut! Pay the electricity bill to get the lights back.', 4500, 'warn'); sfx('power'); }
  if (w && !lastWaterOff) toast('💧 Water shut off! Sinks and color stations stopped working.', 4500, 'warn');
  lastPowerOff = p; lastWaterOff = w;
}

function payBill(id) {
  const s = Game.state;
  const b = s.bills.find(x => x.id === id);
  if (!b) return { ok: false };
  if (s.money < b.amount) return { ok: false, reason: `Not enough money for the ${BILL_TYPES[b.type].name} bill` };
  s.money -= b.amount;
  s.bills = s.bills.filter(x => x !== b);
  s.stats.bills = (s.stats.bills || 0) + b.amount;
  sfx('stamp');
  saveGame();
  return { ok: true };
}

function payAllBills() {
  const s = Game.state;
  const total = s.bills.reduce((a, b) => a + b.amount, 0);
  if (!total) return { ok: false, reason: 'No bills to pay' };
  if (s.money < total) return { ok: false, reason: `You need ${total} to pay everything` };
  for (const b of s.bills.slice()) payBill(b.id);
  return { ok: true };
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
