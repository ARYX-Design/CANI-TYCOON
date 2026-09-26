// Cani Coins ⭐: earned from goals, happy customers and daily bonuses; spent on coupons

const COUPONS = {
  furniture30: { name: '−30% Furniture',   icon: '🛋️', cost: 8,  kind: 'arm',   desc: 'Your next furniture purchase is 30% off.' },
  freeHire:    { name: 'Free Hire',        icon: '🤝', cost: 12, kind: 'arm',   desc: 'Your next barber joins with no signing fee.' },
  upgrade20:   { name: '−20% Upgrade',     icon: '⚡', cost: 12, kind: 'arm',   desc: 'Your next upgrade or helper is 20% off.' },
  billHalf:    { name: 'Half-Price Bill',  icon: '🧾', cost: 15, kind: 'bill',  desc: 'Pay any one bill at half price (use it in the Bills tab).' },
  doubleTips:  { name: 'Double Tips',      icon: '💰', cost: 10, kind: 'day',   desc: 'All tips are doubled for the rest of the day.' },
  rushHour:    { name: 'Rush Hour',        icon: '🚶', cost: 10, kind: 'day',   desc: '+50% customers for the rest of the day.' },
  patience:    { name: 'Chill Customers',  icon: '😌', cost: 8,  kind: 'day',   desc: 'Customers who arrive today wait 50% longer.' },
  repBoost:    { name: 'Five-Star Review', icon: '🌟', cost: 20, kind: 'now',   desc: 'An influencer posts about you: +0.3 reputation.' },
};

// Daily goals: `stat` is a counter in state.today
const GOAL_POOL = [
  { id: 'serve',  stat: 'served',     text: n => `Serve ${n} customers`,              targets: s => [6 + s * 4, 9 + s * 5],   reward: 5 },
  { id: 'earn',   stat: 'earned',     text: n => `Earn $${n} today`,                   targets: s => [150 + s * 250, 250 + s * 350], reward: 5 },
  { id: 'fast',   stat: 'fast',       text: n => `${n} fast checkouts ⚡`,              targets: () => [2, 4],                   reward: 4, skip: 'cashier' },
  { id: 'sweep',  stat: 'sweeps',     text: n => `Sweep hair ${n} times 🧹`,            targets: () => [2, 4],                   reward: 3, skip: 'cleaner' },
  { id: 'boost',  stat: 'boosts',     text: n => `Tap ${n} times to speed up cuts ✂️`,  targets: () => [15, 30],                 reward: 3 },
  { id: 'bills',  stat: 'billsPaid',  text: n => `Pay ${n} bill${n > 1 ? 's' : ''} 🧾`, targets: () => [1, 2],                   reward: 3, needBills: true },
  { id: 'drops',  stat: 'drops',      text: n => `Pick up ${n} dropped coins ⭐`,        targets: () => [2, 3],                   reward: 4 },
  { id: 'happy',  stat: 'superHappy', text: n => `Make ${n} customers super happy 😍`,  targets: s => [3 + s, 5 + s * 2],        reward: 5 },
];

function initRewards(s) {
  s.coins = s.coins || 0;
  s.coupons = s.coupons || {};     // owned coupons: id -> count
  s.armed = s.armed || {};         // discount coupons waiting for the next purchase
  s.effects = s.effects || {};     // day coupons: id -> day number they're active on
  if (!s.goals || s.goals.day !== s.day) newGoals(s);
}

function newGoals(s) {
  const pool = GOAL_POOL.filter(g => !(g.skip && s.upgrades[g.skip]) && !(g.needBills && !s.bills.length));
  const list = [];
  while (list.length < 3 && pool.length) {
    const g = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const hard = Math.random() < 0.4;
    const target = Math.round(g.targets(s.stage)[hard ? 1 : 0]);
    list.push({ id: g.id, stat: g.stat, text: g.text(target), target, reward: g.reward + (hard ? 3 : 0) + s.stage, claimed: false });
  }
  s.goals = { day: s.day, list };
}

const effectActive = id => Game.state.effects && Game.state.effects[id] === Game.state.day;

function track(stat, n = 1) {
  const t = Game.state.today;
  t[stat] = (t[stat] || 0) + n;
  const g = Game.state.goals && Game.state.goals.list.find(x => x.stat === stat && !x.claimed && (t[stat] - n) < x.target && t[stat] >= x.target);
  if (g) { toast(`🎯 Goal complete: ${g.text}! Claim ⭐${g.reward} in Rewards`, 3200, 'hint'); sfx('done'); }
}

function goalProgress(g) { return Math.min(g.target, Game.state.today[g.stat] || 0); }
const claimableGoals = () => Game.state.goals ? Game.state.goals.list.filter(g => !g.claimed && goalProgress(g) >= g.target).length : 0;

function claimGoal(i) {
  const g = Game.state.goals.list[i];
  if (!g || g.claimed || goalProgress(g) < g.target) return { ok: false };
  g.claimed = true;
  addCoins(g.reward, 'goal');
  return { ok: true };
}

function addCoins(n, why) {
  Game.state.coins += n;
  if (why !== 'silent') {
    const el = document.getElementById('hudCoins');
    if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    sfx('coin');
  }
}

// ---------- coupons ----------

function buyCoupon(id) {
  const s = Game.state, c = COUPONS[id];
  if (s.coins < c.cost) return { ok: false, reason: `You need ⭐${c.cost} for this coupon` };
  s.coins -= c.cost;
  s.coupons[id] = (s.coupons[id] || 0) + 1;
  sfx('stamp');
  toast(`🎟️ ${c.name} coupon added to your wallet`);
  saveGame();
  return { ok: true };
}

function useCoupon(id) {
  const s = Game.state, c = COUPONS[id];
  if (!s.coupons[id]) return { ok: false };
  if (c.kind === 'bill') return { ok: false, reason: 'Use this one on a bill in the Bills tab' };
  if (c.kind === 'arm' && s.armed[id]) return { ok: false, reason: 'Already active for your next purchase' };
  if (c.kind === 'day' && effectActive(id)) return { ok: false, reason: 'Already active today' };
  if (c.kind === 'day' && s.time >= CLOSE_TIME - 30) return { ok: false, reason: 'The shop is closing – use it tomorrow' };
  s.coupons[id]--;
  if (c.kind === 'arm') s.armed[id] = true;
  if (c.kind === 'day') s.effects[id] = s.day;
  if (c.kind === 'now' && id === 'repBoost') s.rep = clamp(s.rep + 0.3, 0, 5);
  sfx('fanfare');
  toast(`${c.icon} ${c.name} activated!`, 2600);
  saveGame();
  return { ok: true };
}

// price helpers used by the shop code
function itemCost(type) {
  const base = ITEMS[type].cost;
  return Game.state.armed.furniture30 && !ITEMS[type].coinCost ? Math.round(base * 0.7) : base;
}
function consumeArmed(id) { if (Game.state.armed[id]) { delete Game.state.armed[id]; toast(`🎟️ ${COUPONS[id].name} coupon used`); } }
function hireFee(c) { return Game.state.armed.freeHire ? 0 : c.fee; }
function upgradeCost(key) {
  const u = UPGRADES[key], c = u.costs[Game.state.upgrades[key]];
  return Game.state.armed.upgrade20 ? Math.round(c * 0.8) : c;
}

// ---------- coins dropped on the floor ----------

function dropCoin(c) {
  const t = tileOf(c);
  Game.drops.push({ x: c.x + rand(-0.3, 0.3), y: c.y + rand(-0.3, 0.3), life: 60, value: 1 + (Math.random() < 0.2 ? 1 : 0), seed: Math.random(), tx: t.x, ty: t.y });
  hint('drop', '⭐ A happy customer dropped a Cani Coin! Tap it before it disappears.');
}

function updateDrops(dtMin) {
  for (const d of Game.drops) d.life -= dtMin;
  Game.drops = Game.drops.filter(d => d.life > 0);
}

function collectDrop(d) {
  Game.drops = Game.drops.filter(x => x !== d);
  const p = iso(d.x, d.y, 10);
  flyCoins(p.x, p.y, d.value + 1, 'coins');
  addFloater(p.x, p.y - 10, `+⭐${d.value}`, '#ffe066', 1.2);
  Game.state.coins += d.value;
  track('drops');
  sfx('coin');
}

// ---------- Rewards panel ----------

function rewardsPanel() {
  const s = Game.state;
  const goals = s.goals.list.map((g, i) => {
    const prog = goalProgress(g), done = prog >= g.target;
    return `<div class="card goal${g.claimed ? ' claimed' : done ? ' ready' : ''}">
      <div class="card-main"><div class="card-title">${g.text}</div>
      <div class="goal-bar"><span style="width:${Math.round(prog / g.target * 100)}%"></span></div>
      <div class="card-desc">${prog} / ${g.target}</div></div>
      <div class="side">${g.claimed ? '<span class="badge dim">Claimed</span>'
        : `<button class="btn small${done ? ' primary' : ''}" data-action="claimGoal" data-idx="${i}" ${done ? '' : 'disabled'}>⭐ ${g.reward}</button>`}</div></div>`;
  }).join('');
  const active = [
    ...Object.keys(s.armed).map(id => `${COUPONS[id].icon} ${COUPONS[id].name} – next purchase`),
    ...Object.keys(s.effects).filter(effectActive).map(id => `${COUPONS[id].icon} ${COUPONS[id].name} – today`),
  ];
  const owned = Object.entries(s.coupons).filter(([, n]) => n > 0);
  const wallet = owned.length ? owned.map(([id, n]) => {
    const c = COUPONS[id];
    return `<div class="ticket owned">
      <div class="ticket-icon">${c.icon}</div>
      <div class="ticket-main"><div class="card-title">${c.name} ${n > 1 ? `<span class="badge dim">×${n}</span>` : ''}</div><div class="card-desc">${c.desc}</div></div>
      <div class="ticket-stub">${c.kind === 'bill' ? '<span class="muted small">Bills tab</span>' : `<button class="btn small primary" data-action="useCoupon" data-id="${id}">Use</button>`}</div></div>`;
  }).join('') : '<div class="muted small">No coupons yet. Buy some below!</div>';
  const shop = Object.entries(COUPONS).map(([id, c]) => `<div class="ticket">
      <div class="ticket-icon">${c.icon}</div>
      <div class="ticket-main"><div class="card-title">${c.name}</div><div class="card-desc">${c.desc}</div></div>
      <div class="ticket-stub"><button class="btn small coin-btn" data-action="buyCoupon" data-id="${id}" ${s.coins < c.cost ? 'disabled' : ''}>⭐ ${c.cost}</button></div></div>`).join('');
  return `<div class="coin-balance"><span class="coin-big">⭐</span><div><b>${s.coins}</b><span>Cani Coins</span></div></div>
    <div class="panel-note">Earn coins from daily goals, by tapping coins that super-happy customers drop, from the daily opening bonus and by expanding your shop.</div>
    <h3>Today's goals</h3>${goals}
    ${active.length ? `<h3>Active now</h3><div class="active-list">${active.map(a => `<span>${a}</span>`).join('')}</div>` : ''}
    <h3>My coupons</h3>${wallet}
    <h3>Coupon shop</h3>${shop}
    <div class="panel-note">Exclusive decor like the <b>Neon CANI Sign</b> and <b>Golden Pole</b> can be bought with coins in the Build tab.</div>`;
}
