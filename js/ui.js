// HUD, panels, modals, toasts, sound

const UI = {
  tool: null,          // {mode:'place', type} | {mode:'sell'}
  panel: null,
  showNames: true,
  muted: false,
  lastHud: 0,
  lastPanel: 0,
  renaming: null,      // barber id whose name is being edited
  inspectKey: '',
};

const $ = sel => document.querySelector(sel);
const fmt = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const clockStr = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

function starsHTML(v, small) {
  const pct = clamp(v / 5, 0, 1) * 100;
  return `<span class="stars${small ? ' small' : ''}"><span class="stars-bg">★★★★★</span><span class="stars-fg" style="width:${pct}%">★★★★★</span></span>`;
}

// ---------- HUD ----------

function updateHUD(force) {
  const now = performance.now();
  if (!force && now - UI.lastHud < 100) return;
  UI.lastHud = now;
  const s = Game.state;
  $('#hudMoney').textContent = fmt(s.money);
  $('#hudMoney').classList.toggle('neg', s.money < 0);
  $('#hudRep').innerHTML = `${starsHTML(s.rep)} <b>${s.rep.toFixed(1)}</b>`;
  $('#hudDay').textContent = `Day ${s.day} · ${clockStr(s.time)}`;
  $('#hudStage').textContent = stage().name;
  const waiting = Game.customers.filter(c => c.state === 'waiting' || c.state === 'enter').length;
  $('#hudQueue').textContent = `👥 ${waiting} · ✂️ ${s.today.served} · 😞 ${s.today.lost}`;
  document.querySelectorAll('#speedBtns button').forEach(b => {
    const v = +b.dataset.speed;
    b.classList.toggle('active', v === 0 ? Game.paused : !Game.paused && Game.speed === v);
  });
  const overdue = s.bills.some(b => s.day > b.due);
  const due = s.bills.length;
  const badge = $('#billBadge');
  badge.textContent = due;
  badge.hidden = !due;
  $('#btnBills').classList.toggle('alert', overdue);
  $('#hudCoins').textContent = `⭐ ${s.coins}`;
  const claim = claimableGoals();
  $('#rewardBadge').textContent = claim;
  $('#rewardBadge').hidden = !claim;
  $('#btnRewards').classList.toggle('pulse', claim > 0);
  $('#musicBtn').textContent = Sound.musicOn ? '🎵' : '🔇';
  const next = STAGES[s.stage + 1];
  $('#btnExpand').classList.toggle('pulse', !!next && expandRequirements().every(r => r.ok));
  if (UI.panel && now - UI.lastPanel > 600 && !panelInputFocused()) renderPanel();
  updateInspector();
}

function panelInputFocused() {
  const a = document.activeElement;
  return a && a.tagName === 'INPUT' && a.type === 'text' && $('#panelBody').contains(a);
}

// ---------- inspector (tap a person) ----------

function inspectState(a) {
  if (a.barber) {
    if (!a.job) return { text: 'Free – waiting for the next customer', bar: null };
    if (a.state === 'working') return { text: `Doing a ${a.job.customer.service.name} for ${a.job.customer.name}`, bar: a.job.customer.progress || 0 };
    return { text: `Walking to a chair for ${a.job.customer.name}`, bar: null };
  }
  switch (a.state) {
    case 'enter': case 'waiting': return { text: 'Waiting for a barber', bar: clamp(a.patience / a.maxPatience, 0, 1), patience: true };
    case 'toStation': return { text: 'Walking to the chair', bar: null };
    case 'atStation': return a.inService ? { text: `Getting a ${a.service.name} – tap to help!`, bar: clamp(a.progress, 0, 1) } : { text: a.cutBy ? 'Barber is on the way' : 'Waiting for a free barber', bar: null };
    case 'done': return { text: registers().length ? 'Finished! Send them to the register' : 'Finished! Take their payment', bar: null };
    case 'atRegister': return { text: 'Waiting at the register – ring them up!', bar: null };
    case 'toPay': case 'paying': return { text: 'Paying at the register', bar: null };
    default: return { text: a.mood === 'angry' ? 'Leaving angry' : a.mood === 'sad' ? 'Leaving – no room' : 'Heading home, fresh cut', bar: null };
  }
}

function updateInspector() {
  const el = $('#inspect');
  const a = Game.selected;
  if (!a) { if (!el.hidden) { el.hidden = true; UI.inspectKey = ''; } return; }
  el.hidden = false;
  const st = inspectState(a);
  const who = a.barber ? a.data : a;
  const key = [a.id, a.state, a.mood, who.name, who.surname, st.bar === null, st.patience].join('|');
  if (key !== UI.inspectKey) {
    UI.inspectKey = key;
    const o = ORIGINS[who.origin] || ORIGINS.al;
    const moodIcon = a.barber ? '✂️' : { happy: '😊', angry: '😡', sad: '😞' }[a.mood] || '🙂';
    const details = a.barber
      ? `<div class="insp-row">Skill ${starsHTML(barberSkill(who), true)} · Speed <b>${Math.round(who.speed * 100)}%</b>${who.owner ? '' : ` · ${fmt(who.wage)}/day`}</div>`
      : `<div class="insp-row">${serviceIcon(a.service)} Wants a <b>${a.service.name}</b> · ${fmt(a.service.price * PRICE_LEVELS[Game.state.priceLevel].price)}</div>`;
    el.innerHTML = `<button class="insp-close" data-insp="close" aria-label="Close">✕</button>
      <div class="insp-head"><span class="insp-mood">${moodIcon}</span>
        <div><div class="insp-name">${fullName(who)}${who.owner ? ' <span class="badge">Owner</span>' : ''}</div>
        <div class="insp-sub">${o.flag} ${o.label} ${a.barber ? 'barber' : 'customer'}</div></div></div>
      ${details}
      <div class="insp-row" id="inspTxt"></div>
      ${st.bar !== null ? `<div class="insp-bar${st.patience ? ' patience' : ''}"><span id="inspBar"></span></div>` : ''}
      ${a.barber ? `<button class="btn small" data-insp="rename">✏️ Rename</button>` : customerActions(a)}`;
  }
  $('#inspTxt').textContent = st.text;
  const bar = $('#inspBar');
  if (bar && st.bar !== null) {
    bar.style.width = `${Math.round(st.bar * 100)}%`;
    if (st.patience) bar.style.background = st.bar > 0.5 ? 'var(--green)' : st.bar > 0.25 ? '#f4a261' : 'var(--red)';
  }
}

function customerActions(c) {
  if (c.state === 'waiting' || c.state === 'enter') return `<div class="insp-actions"><span class="muted small">Tap a glowing chair, or</span><button class="btn small" data-insp="seat">💺 Nearest chair</button></div>`;
  if (c.state === 'done') return registers().length
    ? `<div class="insp-actions"><span class="muted small">Tap the glowing register, or</span><button class="btn small" data-insp="toRegister">💵 Go pay</button></div>`
    : `<div class="insp-actions"><button class="btn small primary" data-insp="collect">💵 Take payment</button></div>`;
  if (c.state === 'atRegister') return `<div class="insp-actions"><button class="btn small primary" data-insp="ring">🔔 Ring up</button></div>`;
  return '';
}

function handleInspectClick(e) {
  const b = e.target.closest('[data-insp]');
  if (!b) return;
  const c = Game.selected;
  let r;
  if (b.dataset.insp === 'seat' && c) {
    const st = nearestFreeStation(c);
    r = st ? seatAt(c, st) : { ok: false, reason: 'No free station for this service right now' };
    if (r.ok) { sfx('go'); Game.selected = null; }
  }
  if (b.dataset.insp === 'toRegister' && c) { r = sendToRegister(c); if (r.ok) { sfx('go'); Game.selected = null; } }
  if (b.dataset.insp === 'collect' && c) { r = collectAtChair(c); Game.selected = null; }
  if (b.dataset.insp === 'ring' && c) { r = ringUp(c.register); Game.selected = null; }
  if (r && !r.ok && r.reason) { sfx('error'); toast(r.reason, 2200, 'warn'); }
  if (b.dataset.insp === 'close') Game.selected = null;
  if (b.dataset.insp === 'rename' && Game.selected && Game.selected.barber) {
    UI.renaming = Game.selected.data.id;
    if (UI.panel !== 'staff') openPanel('staff'); else renderPanel();
  }
  updateInspector();
}

// ---------- panels ----------

function openPanel(name) {
  if (UI.panel === name) { closePanel(); return; }
  UI.panel = name;
  $('#panel').classList.remove('hidden');
  document.querySelectorAll('#toolbar button[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  $('#panelBody').scrollTop = 0;
  if (name === 'rewards') refreshMe().then(() => { if (UI.panel === 'rewards') renderPanel(); });
  renderPanel();
}

function closePanel() {
  UI.panel = null;
  UI.renaming = null;
  $('#panel').classList.add('hidden');
  document.querySelectorAll('#toolbar button[data-panel]').forEach(b => b.classList.remove('active'));
}

function renderPanel() {
  UI.lastPanel = performance.now();
  const body = $('#panelBody');
  const scroll = body.scrollTop;
  const titles = { rewards: '🎟️ Rewards & Coupons', bills: '🧾 Bills', build: '🛠️ Build & Decorate', staff: '💇 Staff', services: '✂️ Services & Prices', upgrades: '⚡ Upgrades', expand: '🏙️ Expand the Empire', menu: '⚙️ Menu' };
  $('#panelTitle').textContent = titles[UI.panel] || '';
  const html = ({ rewards: rewardsPanel, bills: billsPanel, build: buildPanel, staff: staffPanel, services: servicesPanel, upgrades: upgradesPanel, expand: expandPanel, menu: menuPanel })[UI.panel]();
  if (body.dataset.html !== html) {
    body.innerHTML = html;
    body.dataset.html = html;
    body.scrollTop = scroll;
    const input = UI.renaming && document.getElementById(`rename-${UI.renaming}`);
    if (input && document.activeElement !== input) { input.focus(); input.select(); }
  }
}

function buildPanel() {
  const s = Game.state;
  // coin-only decor is retired: coins are for real rewards now (owned pieces stay in the shop)
  const cards = Object.entries(ITEMS).filter(([, it]) => !it.coinCost).map(([key, it]) => {
    const locked = it.stage > s.stage;
    const price = it.coinCost ? it.coinCost : itemCost(key);
    const poor = it.coinCost ? s.coins < it.coinCost : s.money < price;
    const tags = [];
    if (it.station) tags.push('Station');
    if (it.seat) tags.push('Seat');
    if (it.decor) tags.push(`+${it.decor} appeal`);
    const sel = UI.tool && UI.tool.type === key;
    return `<button class="card item-card${locked ? ' locked' : ''}${poor && !locked ? ' poor' : ''}${sel ? ' selected' : ''}" data-action="tool" data-type="${key}" ${locked ? 'disabled' : ''}>
      <div class="card-icon">${locked ? '🔒' : it.icon}</div>
      <div class="card-main"><div class="card-title">${it.name}</div>
      <div class="card-desc">${locked ? `Unlocks at ${STAGES[it.stage].name}` : it.desc}</div>
      <div class="tags">${tags.map(t => `<span>${t}</span>`).join('')}</div></div>
      <div class="price${it.coinCost ? ' coin-price' : ''}">${it.coinCost ? `⭐ ${it.coinCost}` : price < it.cost ? `<s>${fmt(it.cost)}</s> ${fmt(price)}` : fmt(it.cost)}</div></button>`;
  }).join('');
  const counts = {};
  s.items.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
  return `<div class="panel-note">Appeal <b>${decorScore()}</b> · Seats <b>${s.items.filter(i => ITEMS[i.type].seat).length}</b> · Chairs <b>${s.items.filter(i => ITEMS[i.type].station === 'chair').length}</b> · Barbers <b>${s.barbers.length}</b></div>
    <button class="card sell-card${UI.tool && UI.tool.mode === 'sell' ? ' selected' : ''}" data-action="sell"><div class="card-icon">💰</div><div class="card-main"><div class="card-title">Sell furniture</div><div class="card-desc">Tap an item to sell it for 50% of its price.</div></div></button>
    <div class="grid">${cards}</div>`;
}

function staffPanel() {
  const s = Game.state, st = stage();
  const team = Game.barbers.map(a => {
    const b = a.data;
    const status = a.job ? (a.state === 'working' ? `Cutting (${a.job.customer.service.name})` : 'Heading to a chair') : 'Free';
    const o = ORIGINS[b.origin] || ORIGINS.al;
    const title = UI.renaming === b.id
      ? `<div class="rename"><input type="text" id="rename-${b.id}" data-rename="${b.id}" maxlength="16" value="${fullName(b)}" aria-label="New name for ${fullName(b)}" autocomplete="off"><button class="btn small" data-action="saveName" data-id="${b.id}">Save</button></div>`
      : `<div class="card-title">${o.flag} ${fullName(b)}${b.owner ? ' <span class="badge">Owner</span>' : ''} <button class="icon-btn" data-action="rename" data-id="${b.id}" title="Rename" aria-label="Rename ${fullName(b)}">✏️</button></div>`;
    return `<div class="card staff-card">
      ${avatarHTML(b)}
      <div class="card-main">${title}
      <div class="card-desc">Skill ${starsHTML(barberSkill(b), true)} · Speed <b>${Math.round(b.speed * 100)}%</b></div>
      <div class="card-desc">${status}</div></div>
      <div class="side">${b.owner ? '<span class="muted">No wage</span>' : `<div class="muted">${fmt(b.wage)}/day</div><button class="btn small danger" data-action="fire" data-id="${b.id}">Fire</button>`}</div></div>`;
  }).join('');
  const full = s.barbers.length >= st.maxBarbers;
  const cands = s.candidates.map((c, i) => `<div class="card staff-card">
      ${avatarHTML(c)}
      <div class="card-main"><div class="card-title">${ORIGINS[c.origin].flag} ${fullName(c)}</div>
      <div class="card-desc">Skill ${starsHTML(c.skill, true)} · Speed <b>${Math.round(c.speed * 100)}%</b></div>
      <div class="card-desc">Wage <b>${fmt(c.wage)}</b>/day</div></div>
      <div class="side"><button class="btn small" data-action="hire" data-idx="${i}" ${full || s.money < hireFee(c) ? 'disabled' : ''}>${hireFee(c) === 0 ? 'Hire 🎟️ free' : `Hire ${fmt(c.fee)}`}</button></div></div>`).join('');
  return `<div class="panel-note">Team <b>${s.barbers.length}/${st.maxBarbers}</b> at ${st.name}. Wages are paid at closing time.${full && s.stage < STAGES.length - 1 ? ' <b>Expand</b> to hire more barbers!' : ''}</div>
    <h3>Your team</h3>${team}
    <h3>Looking for work <span class="muted">(new faces every morning)</span></h3>${cands || '<div class="muted">Nobody today. Come back tomorrow.</div>'}`;
}

function avatarHTML(b) {
  return `<div class="avatar" style="background:${b.shirt}"><span class="av-head" style="background:${b.skin}"></span><span class="av-hair${b.female ? ' long' : ''}" style="background:${b.hair}"></span></div>`;
}

function servicesPanel() {
  const s = Game.state;
  const stations = new Set(s.items.filter(i => ITEMS[i.type].station).map(i => ITEMS[i.type].station));
  const stationName = { chair: 'Barber Chair', sink: 'Wash Sink', color: 'Color Station' };
  const pl = PRICE_LEVELS[s.priceLevel];
  const levels = PRICE_LEVELS.map((p, i) => `<button class="seg${i === s.priceLevel ? ' active' : ''}" data-action="price" data-idx="${i}">${p.name}</button>`).join('');
  const rows = SERVICES.map(sv => {
    const locked = sv.stage > s.stage;
    const noStation = !stations.has(sv.station);
    const off = s.disabledServices.includes(sv.id);
    let status = '';
    if (locked) status = `🔒 ${STAGES[sv.stage].name}`;
    else if (noStation) status = `Needs ${stationName[sv.station]}`;
    return `<div class="card svc${locked || noStation ? ' locked' : ''}">
      <div class="card-icon">${serviceIcon(sv)}</div>
      <div class="card-main"><div class="card-title">${sv.name}</div>
      <div class="card-desc">${sv.time} min · ${stationName[sv.station]}</div></div>
      <div class="side"><div class="price">${fmt(sv.price * pl.price)}</div>
      ${status ? `<div class="muted small">${status}</div>` : `<label class="toggle"><input type="checkbox" data-action="svc" data-id="${sv.id}" ${off ? '' : 'checked'}><span></span></label>`}</div></div>`;
  }).join('');
  return `<h3>Price level</h3><div class="segmented">${levels}</div>
    <div class="panel-note">${pl.name}: prices ×${pl.price}, customers ×${pl.demand}, happiness ${pl.sat >= 0 ? '+' : ''}${Math.round(pl.sat * 100)}%</div>
    <h3>Menu</h3>${rows}`;
}

function upgradesPanel() {
  const s = Game.state;
  const card = ([key, u]) => {
    const lvl = s.upgrades[key], max = u.costs.length;
    const cost = lvl < max ? upgradeCost(key) : 0;
    const locked = (u.stage || 0) > s.stage;
    const pips = max > 1 ? `<div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : '';
    let side;
    if (lvl >= max) side = `<span class="badge">${u.helper ? 'Hired' : 'MAX'}</span>`;
    else if (locked) side = `<span class="muted small">🔒 ${STAGES[u.stage].name}</span>`;
    else side = `<button class="btn small" data-action="upgrade" data-key="${key}" ${s.money < cost ? 'disabled' : ''}>${fmt(cost)}</button>`;
    return `<div class="card${locked ? ' locked' : ''}">
      <div class="card-icon">${u.icon}</div>
      <div class="card-main"><div class="card-title">${u.name}</div><div class="card-desc">${u.desc}</div>${pips}</div>
      <div class="side">${side}</div></div>`;
  };
  const list = Object.entries(UPGRADES);
  return `<h3>Equipment</h3>${list.filter(([, u]) => !u.helper).map(card).join('')}
    <h3>Helpers</h3><div class="panel-note">Until you hire helpers, <b>you</b> seat customers, take payments and sweep the floor.</div>
    ${list.filter(([, u]) => u.helper).map(card).join('')}`;
}

function billsPanel() {
  const s = Game.state;
  const total = s.bills.reduce((a, b) => a + b.amount, 0);
  if (!s.bills.length) {
    return `<div class="empty">✅ All bills are paid.<br><span class="muted">New bills arrive at closing time: rent and supplies every day, electricity and water every 3 days, internet every 5 and taxes every 7.</span></div>`;
  }
  const rows = s.bills.slice().sort((a, b) => a.due - b.due).map(b => {
    const t = BILL_TYPES[b.type];
    const overdue = s.day > b.due;
    const dueTxt = overdue ? `Overdue by ${s.day - b.due} day${s.day - b.due > 1 ? 's' : ''}` : b.due === s.day ? 'Due today' : `Due day ${b.due}`;
    return `<div class="card bill${overdue ? ' overdue' : b.due === s.day ? ' soon' : ''}">
      <div class="card-icon">${t.icon}</div>
      <div class="card-main"><div class="card-title">${t.name}</div>
      <div class="card-desc">${dueTxt}${b.late ? ' · late fees added' : ''}</div>
      <div class="card-desc small">${t.note}</div></div>
      <div class="side"><div class="price">${fmt(b.amount)}</div>
      <button class="btn small" data-action="payBill" data-id="${b.id}" ${s.money < b.amount ? 'disabled' : ''}>Pay</button>
</div></div>`;
  }).join('');
  return `<div class="panel-note">Unpaid: <b>${fmt(total)}</b>. Late bills add a 10% fee every night and cost reputation.</div>
    <button class="btn wide" data-action="payAll" ${s.money < total ? 'disabled' : ''}>Pay all · ${fmt(total)}</button>
    <div style="height:10px"></div>${rows}`;
}

function expandPanel() {
  const s = Game.state;
  const list = STAGES.map((st, i) => {
    const cur = i === s.stage, done = i < s.stage, next = i === s.stage + 1;
    let extra = '';
    if (next) {
      const reqs = expandRequirements();
      const ok = reqs.every(r => r.ok);
      extra = `<ul class="reqs">${reqs.map(r => `<li class="${r.ok ? 'ok' : ''}">${r.ok ? '✅' : '⬜'} ${r.label}</li>`).join('')}</ul>
        <button class="btn wide" data-action="expand" ${ok ? '' : 'disabled'}>Move to ${st.name} · ${fmt(st.cost)}</button>`;
    }
    return `<div class="card stage-card${cur ? ' current' : ''}${done ? ' done' : ''}${i > s.stage + 1 ? ' locked' : ''}">
      <div class="stage-num">${i + 1}</div>
      <div class="card-main"><div class="card-title">${st.name} ${cur ? '<span class="badge">You are here</span>' : ''}${done ? '<span class="badge dim">Done</span>' : ''}</div>
      <div class="card-desc">${st.desc}</div>
      <div class="tags"><span>${st.size}×${st.size}</span><span>${st.maxBarbers} barber${st.maxBarbers > 1 ? 's' : ''}</span><span>Rent ${fmt(st.rent)}/day</span></div>
      ${extra}</div></div>`;
  }).join('');
  return `<div class="panel-note">Served <b>${s.stats.served}</b> customers · Reputation ${starsHTML(s.rep, true)} <b>${s.rep.toFixed(2)}</b></div>${list}`;
}

function menuPanel() {
  const s = Game.state;
  return `<div class="stats">
      <div><span>Total earned</span><b>${fmt(s.stats.earned)}</b></div>
      <div><span>Bills paid</span><b>${fmt(s.stats.bills || 0)}</b></div>
      <div><span>Customers served</span><b>${s.stats.served}</b></div>
      <div><span>Customers lost</span><b>${s.stats.lost}</b></div>
      <div><span>Customers / hour</span><b>${spawnRatePerHour().toFixed(1)}</b></div>
      <div><span>Shop appeal</span><b>${decorScore()}</b></div>
      <div><span>Days in business</span><b>${s.day}</b></div>
    </div>
    <div class="menu-btns">
      ${R3.ok ? `<button class="btn" data-action="toggleView">${R3.active ? '🧊 View: 3D' : '🖼️ View: classic 2D'}</button>` : ''}
      <button class="btn" data-action="toggleMusic">${Sound.musicOn ? '🎵 Music on' : '🔇 Music off'}</button>
      <button class="btn" data-action="toggleSound">${Sound.sfxOn ? '🔊 Sound effects on' : '🔈 Sound effects off'}</button>
      <button class="btn" data-action="toggleNames">${UI.showNames ? '🏷️ Names on' : '🏷️ Names off'}</button>
      <button class="btn" data-action="recenter">🎯 Recenter view</button>
      <button class="btn" data-action="save">💾 Save now</button>
      <button class="btn" data-action="help">❓ How to play</button>
      <button class="btn danger" data-action="reset">🗑️ New game</button>
    </div>`;
}

function handlePanelClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  let r;
  switch (a) {
    case 'tool': setTool({ mode: 'place', type: el.dataset.type }); break;
    case 'sell': setTool({ mode: 'sell' }); break;
    case 'hire': r = hireCandidate(+el.dataset.idx); break;
    case 'fire': r = fireBarber(+el.dataset.id); break;
    case 'upgrade': r = buyUpgrade(el.dataset.key); break;
    case 'price': Game.state.priceLevel = +el.dataset.idx; break;
    case 'expand': r = expandShop(); if (r.ok) { closePanel(); Renderer.fitCamera(); } break;
    case 'toggleSound': unlockAudio(); setSfx(!Sound.sfxOn); break;
    case 'toggleView': setView3D(!R3.active); break;
    case 'toggleMusic': unlockAudio(); setMusic(!Sound.musicOn); break;
    case 'payBill': r = payBill(+el.dataset.id); if (r.ok) toast('🧾 Bill paid'); break;
    case 'payBillHalf': r = payBill(+el.dataset.id, true); if (r.ok) toast('🎟️ Bill paid at half price!'); break;
    case 'claimGoal': r = claimGoal(+el.dataset.idx); if (r.ok) { const b = el.getBoundingClientRect(); toast('⭐ Coins claimed!'); } break;
    case 'redeem': redeemConfirm(el.dataset.id); break;
    case 'signIn': openSignIn(); break;
    case 'signOut':
      showModal('<h2>Sign out?</h2><p>Your coins and coupons stay safe in your account. Sign in again any time with the same phone number or email.</p>',
        [{ label: 'Cancel' }, { label: 'Sign out', cls: 'danger', fn: signOut }]);
      break;
    case 'showCoupon': showCoupon(el.dataset.id); break;
    case 'payAll': r = payAllBills(); if (r.ok) toast('🧾 All bills paid!'); break;
    case 'toggleNames': UI.showNames = !UI.showNames; break;
    case 'recenter': Renderer.fitCamera(); break;
    case 'save': saveGame(); toast('Game saved 💾'); break;
    case 'help': showIntro(); break;
    case 'reset':
      showModal(`<h2>Start over?</h2><p>This deletes your save and sends you back to the garage.</p>`, [
        { label: 'Cancel' },
        { label: 'Yes, start over', cls: 'danger', fn: () => { resetGame(); location.reload(); } },
      ]);
      break;
    case 'svc': return;
    case 'rename':
      UI.renaming = +el.dataset.id;
      break;
    case 'saveName': {
      const input = document.getElementById(`rename-${el.dataset.id}`);
      r = renameBarber(+el.dataset.id, input && input.value);
      if (r.ok) { UI.renaming = null; UI.inspectKey = ''; toast(`Renamed to ${input.value.trim()} ✂️`); }
      break;
    }
  }
  if (r && !r.ok && r.reason) toast(r.reason, 2200, 'warn');
  if (UI.panel) renderPanel();
  updateHUD(true);
}

function handlePanelKey(e) {
  const id = e.target.dataset && e.target.dataset.rename;
  if (!id) return;
  if (e.key === 'Enter') {
    const btn = $(`[data-action="saveName"][data-id="${id}"]`);
    if (btn) btn.click();
  } else if (e.key === 'Escape') {
    UI.renaming = null;
    renderPanel();
  }
  e.stopPropagation();
}

function handlePanelChange(e) {
  const el = e.target;
  if (el.dataset.action !== 'svc') return;
  const s = Game.state, id = el.dataset.id;
  s.disabledServices = s.disabledServices.filter(x => x !== id);
  if (!el.checked) {
    s.disabledServices.push(id);
    if (!availableServices().length) {
      s.disabledServices = s.disabledServices.filter(x => x !== id);
      el.checked = true;
      toast('Keep at least one service on the menu!', 2200, 'warn');
    }
  }
  renderPanel();
}

// ---------- build tool ----------

function setTool(tool) {
  UI.tool = tool;
  const hint = $('#buildHint');
  if (!tool) { hint.classList.add('hidden'); if (UI.panel === 'build') renderPanel(); return; }
  if (window.innerWidth < 760) closePanel();
  hint.classList.remove('hidden');
  hint.innerHTML = tool.mode === 'sell'
    ? `<span>💰 <b>Sell mode</b> — tap furniture to sell it</span><button class="btn small" data-hint="cancel">Done</button>`
    : `<span>${ITEMS[tool.type].icon} Placing <b>${ITEMS[tool.type].name}</b> (${fmt(ITEMS[tool.type].cost)}) — tap a tile</span><button class="btn small" data-hint="cancel">Done</button>`;
  if (UI.panel === 'build') renderPanel();
}

function toolClick(tile) {
  const tool = UI.tool;
  if (!tool) return;
  if (tool.mode === 'place') {
    const r = placeItem(tool.type, tile.x, tile.y);
    if (!r.ok) toast(r.reason, 1800, 'warn');
    else if (Game.state.money < ITEMS[tool.type].cost) setTool(null);
  } else if (tool.mode === 'sell') {
    const it = itemAt(tile.x, tile.y);
    if (!it) return;
    const r = sellItem(it);
    if (!r.ok) toast(r.reason, 1800, 'warn');
  }
  if (UI.panel) renderPanel();
}

// ---------- toasts & modals ----------

function toast(msg, ms = 2600, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

function showModal(html, buttons) {
  const m = $('#modal');
  $('#modalCard').innerHTML = html + `<div class="modal-btns">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`).join('')}</div>`;
  m.classList.remove('hidden');
  $('#modalCard').querySelectorAll('.modal-btns button').forEach(btn => {
    btn.onclick = () => {
      m.classList.add('hidden');
      const b = buttons[+btn.dataset.i];
      if (b.fn) b.fn();
    };
  });
}

function showIntro() {
  showModal(`<div class="logo-big">CANI<span>Barber Tycoon</span></div>
    <p>Every legend starts somewhere. <b>Cani</b> starts in a <b>garage</b> with one barber chair, two plastic chairs and a plant.</p>
    <ul class="howto">
      <li>👆 Customers from Albania 🇦🇱 and Slovenia 🇸🇮 walk in and sit down. <b>Tap a customer, then tap a chair</b> to send them for a cut.</li>
      <li>✂️ Tap customers during the cut to speed it up. When they're done, <b>tap them, then the register</b>, and tap the register to ring them up.</li>
      <li>🧹 Tap hair on the floor to sweep it. 🧾 Pay your <b>bills</b> on time or the power and water get cut!</li>
      <li>⏳ Watch the patience bar – slow service costs you reputation ★.</li>
      <li>🛠️ <b>Build</b> more seats, chairs and decor. Appeal brings more customers.</li>
      <li>💇 <b>Hire</b> barbers and give them any name you like ✏️. Unlock <b>services</b> and buy <b>upgrades</b>.</li>
      <li>🏙️ <b>Expand</b> from the garage to a corner shop, downtown, a studio and finally the <b>Cani Empire HQ</b>.</li>
    </ul>
    <p class="muted small">Drag to move the camera, scroll / pinch to zoom, ⟲ ⟳ (or Q / E) to rotate. Space pauses, 1-3 set speed.</p>`,
    [{ label: "Let's cut some hair ✂️", cls: 'primary', fn: () => { unlockAudio(); Game.state.introSeen = true; Game.paused = false; } }]);
}

function showDaySummary(sm) {
  const net = sm.revenue + sm.tips - sm.wages - sm.lateFees;
  const repD = sm.repEnd - sm.repStart;
  let tip = '';
  if (Game.state.bills.some(b => Game.state.day > b.due)) tip = '⚠️ You have overdue bills! Open the <b>Bills</b> tab and pay them before the power or water gets cut.';
  else if (sm.lost > sm.served * 0.3 && sm.lost > 2) {
    tip = Game.state.barbers.length < stage().maxBarbers
      ? '💡 Many customers left. Seat them faster, hire another barber and add chairs and waiting seats.'
      : Game.state.stage < STAGES.length - 1
        ? `💡 Many customers left. ${stage().name} is at full capacity – save up and <b>Expand</b> to hire more barbers. Tap customers during cuts to speed things up.`
        : '💡 Many customers left. Add waiting seats and patience decor, or raise prices to Premium.';
  } else if (Game.state.money > 800 && Game.state.stage === 0) tip = '💡 Check the <b>Expand</b> tab – the Corner Shop is waiting!';
  else if (sm.served > 0 && repD < 0) tip = '💡 Reputation dropped. Faster service, a clean floor and skilled barbers keep customers happy.';
  const bills = sm.newBills.length
    ? `<h3 class="sub">🧾 New bills</h3><div class="bill-list">${sm.newBills.map(b => `<div><span>${BILL_TYPES[b.type].icon} ${BILL_TYPES[b.type].name}</span><span>${fmt(b.amount)} · due day ${b.due}</span></div>`).join('')}</div>`
    : '';
  showModal(`<h2>🌙 Day ${sm.day} closed</h2>
    <div class="stats">
      <div><span>Haircuts</span><b>${fmt(sm.revenue)}</b></div>
      <div><span>Tips</span><b>${fmt(sm.tips)}</b></div>
      <div><span>Wages</span><b class="neg">-${fmt(sm.wages)}</b></div>
      <div><span>Late fees</span><b class="${sm.lateFees ? 'neg' : ''}">-${fmt(sm.lateFees)}</b></div>
      <div class="total"><span>Profit</span><b class="${net < 0 ? 'neg' : 'pos'}">${fmt(net)}</b></div>
      <div><span>Served / lost</span><b>${sm.served} / ${sm.lost}</b></div>
      <div><span>Reputation</span><b>${sm.repEnd.toFixed(2)} ${repD >= 0 ? '▲' : '▼'}${Math.abs(repD).toFixed(2)}</b></div>
      <div><span>Cash · unpaid bills</span><b>${fmt(sm.money)} · <span class="${sm.unpaid ? 'neg' : ''}">${fmt(sm.unpaid)}</span></b></div>
    </div>${bills}${tip ? `<p class="tip">${tip}</p>` : ''}`,
    [
      ...(sm.unpaid ? [{ label: '🧾 Pay bills', fn: () => { startDay(); openPanel('bills'); } }] : []),
      { label: `☀️ Open Day ${Game.state.day}`, cls: 'primary', fn: startDay },
    ]);
  if (sm.newBills.length) sfx('bill');
}
