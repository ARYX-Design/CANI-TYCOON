// Cani Coins ⭐: earned from goals, happy customers and daily bonuses; exchanged for real coupons at the barbershop (see cloud.js)

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
  // in-game coupons were replaced by real-world rewards
  s.coupons = {};
  s.armed = {};
  s.effects = {};
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
  cloudEarn(n);
  if (why !== 'silent') {
    const el = document.getElementById('hudCoins');
    if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    sfx('coin');
  }
}

// price helpers used by the shop code
function itemCost(type) {
  const base = ITEMS[type].cost;
  return Game.state.armed.furniture30 && !ITEMS[type].coinCost ? Math.round(base * 0.7) : base;
}
function consumeArmed(id) { delete Game.state.armed[id]; }
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
  addCoins(d.value, 'silent');
  track('drops');
  sfx('coin');
}

// ---------- Rewards panel ----------

// shown when no rewards server is reachable (e.g. the preview link)
const DEFAULT_REWARDS = [
  { id: 'coffee', name: 'Free coffee', icon: '☕', cost: 60, desc: 'One free coffee or espresso while you wait.' },
  { id: 'off10', name: '10% off any service', icon: '🏷️', cost: 120, desc: '10% off one haircut, shave or treatment.' },
  { id: 'off20', name: '20% off any service', icon: '💸', cost: 220, desc: '20% off one haircut, shave or treatment.' },
  { id: 'beard', name: 'Free beard trim', icon: '🧔', cost: 250, desc: 'A free beard trim and line-up.' },
  { id: 'haircut', name: 'Free haircut', icon: '✂️', cost: 500, desc: 'One free classic haircut.' },
];

function rewardsPanel() {
  const s = Game.state;
  const online = Cloud.online;
  const goals = s.goals.list.map((g, i) => {
    const prog = goalProgress(g), done = prog >= g.target;
    return `<div class="card goal${g.claimed ? ' claimed' : done ? ' ready' : ''}">
      <div class="card-main"><div class="card-title">${g.text}</div>
      <div class="goal-bar"><span style="width:${Math.round(prog / g.target * 100)}%"></span></div>
      <div class="card-desc">${prog} / ${g.target}</div></div>
      <div class="side">${g.claimed ? '<span class="badge dim">Claimed</span>'
        : `<button class="btn small${done ? ' primary' : ''}" data-action="claimGoal" data-idx="${i}" ${done ? '' : 'disabled'}>⭐ ${g.reward}</button>`}</div></div>`;
  }).join('');
  const today = online && Cloud.me ? `<div class="cap-row"><span>Earned today</span><div class="goal-bar"><span style="width:${Math.round(Cloud.me.earnedToday / Cloud.me.cap * 100)}%"></span></div><b>${Cloud.me.earnedToday}/${Cloud.me.cap}</b></div>` : '';
  const list = online ? Cloud.rewards : DEFAULT_REWARDS;
  const signedIn = online && Cloud.me && Cloud.me.signedIn;
  const account = !online ? '' : signedIn
    ? `<div class="account-row"><span>🔐 Signed in as <b>${Cloud.me.contact}</b></span><button class="btn small danger" data-action="signOut">Sign out</button></div>`
    : `<div class="account-row signin"><span>Sign in with your phone or email to exchange coins for real coupons.</span><button class="btn small primary" data-action="signIn">Sign in</button></div>`;
  const rewards = list.map(r => `<div class="ticket real">
      <div class="ticket-icon">${r.icon}</div>
      <div class="ticket-main"><div class="card-title">${r.name}</div><div class="card-desc">${r.desc}${r.limitPer30Days ? ` · max ${r.limitPer30Days}× per 30 days` : ''}</div></div>
      <div class="ticket-stub"><button class="btn small coin-btn" data-action="redeem" data-id="${r.id}" ${!online || s.coins < r.cost ? 'disabled' : ''}>⭐ ${r.cost}</button></div></div>`).join('');
  const mine = online && Cloud.me && Cloud.me.coupons.length
    ? Cloud.me.coupons.map(c => `<button class="ticket owned mine ${c.status}" data-action="showCoupon" data-id="${c.code}">
        <div class="ticket-icon">${c.icon}</div>
        <div class="ticket-main"><div class="card-title">${c.name}</div><div class="card-desc mono">${c.code}</div>
        <div class="card-desc">${c.status === 'active' ? `Valid until ${new Date(c.expiresAt).toLocaleDateString()}` : c.status === 'used' ? `Used ${new Date(c.usedAt).toLocaleDateString()}` : 'Expired'}</div></div>
        <div class="ticket-stub"><span class="pill ${c.status}">${c.status === 'active' ? 'Show' : c.status}</span></div></button>`).join('')
    : `<div class="muted small">${online ? 'No coupons yet. Exchange your coins above!' : 'Your coupons will appear here.'}</div>`;
  const offline = online ? '' : `<div class="panel-note offline-note">🔌 Coins become real coupons in the official CANI game at the barbershop's website. This preview isn't connected to the shop's rewards server, so exchanging is switched off here.</div>`;
  return `<div class="coin-balance"><span class="coin-big">⭐</span><div><b>${s.coins}</b><span>Cani Coins</span></div></div>
    ${account}${today}${offline}
    <h3>Real rewards at CANI Barbershop</h3>
    <div class="panel-note">Exchange coins for coupons you use in the real shop: show the QR code at the counter.</div>
    ${rewards}
    <h3>My coupons</h3>${mine}
    <h3>Today's goals</h3>${goals}
    <div class="panel-note">Earn coins from daily goals, by tapping coins that super-happy customers drop, from the daily opening bonus and by expanding your shop.${online && Cloud.me ? ` You can earn up to ${Cloud.me.cap} coins per day.` : ''}</div>`;
}
