// HUD, panels, modals, toasts, sound

const UI = {
  tool: null,          // {mode:'place', type} | {mode:'sell'}
  panel: null,
  showNames: true,
  muted: false,
  lastHud: 0,
  lastPanel: 0,
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
  const next = STAGES[s.stage + 1];
  $('#btnExpand').classList.toggle('pulse', !!next && expandRequirements().every(r => r.ok));
  if (UI.panel && now - UI.lastPanel > 600) renderPanel();
}

// ---------- panels ----------

function openPanel(name) {
  if (UI.panel === name) { closePanel(); return; }
  UI.panel = name;
  $('#panel').classList.remove('hidden');
  document.querySelectorAll('#toolbar button[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  $('#panelBody').scrollTop = 0;
  renderPanel();
}

function closePanel() {
  UI.panel = null;
  $('#panel').classList.add('hidden');
  document.querySelectorAll('#toolbar button[data-panel]').forEach(b => b.classList.remove('active'));
}

function renderPanel() {
  UI.lastPanel = performance.now();
  const body = $('#panelBody');
  const scroll = body.scrollTop;
  const titles = { build: '🛠️ Build & Decorate', staff: '💇 Staff', services: '✂️ Services & Prices', upgrades: '⚡ Upgrades', expand: '🏙️ Expand the Empire', menu: '⚙️ Menu' };
  $('#panelTitle').textContent = titles[UI.panel] || '';
  const html = ({ build: buildPanel, staff: staffPanel, services: servicesPanel, upgrades: upgradesPanel, expand: expandPanel, menu: menuPanel })[UI.panel]();
  if (body.dataset.html !== html) {
    body.innerHTML = html;
    body.dataset.html = html;
    body.scrollTop = scroll;
  }
}

function buildPanel() {
  const s = Game.state;
  const cards = Object.entries(ITEMS).map(([key, it]) => {
    const locked = it.stage > s.stage;
    const poor = s.money < it.cost;
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
      <div class="price">${fmt(it.cost)}</div></button>`;
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
    return `<div class="card staff-card">
      <div class="avatar" style="background:${b.shirt}"><span style="background:${b.skin}"></span></div>
      <div class="card-main"><div class="card-title">${b.name}${b.owner ? ' <span class="badge">Owner</span>' : ''}</div>
      <div class="card-desc">Skill ${starsHTML(barberSkill(b), true)} · Speed <b>${Math.round(b.speed * 100)}%</b></div>
      <div class="card-desc">${status}</div></div>
      <div class="side">${b.owner ? '<span class="muted">No wage</span>' : `<div class="muted">${fmt(b.wage)}/day</div><button class="btn small danger" data-action="fire" data-id="${b.id}">Fire</button>`}</div></div>`;
  }).join('');
  const full = s.barbers.length >= st.maxBarbers;
  const cands = s.candidates.map((c, i) => `<div class="card staff-card">
      <div class="avatar" style="background:${c.shirt}"><span style="background:${c.skin}"></span></div>
      <div class="card-main"><div class="card-title">${c.name}</div>
      <div class="card-desc">Skill ${starsHTML(c.skill, true)} · Speed <b>${Math.round(c.speed * 100)}%</b></div>
      <div class="card-desc">Wage <b>${fmt(c.wage)}</b>/day</div></div>
      <div class="side"><button class="btn small" data-action="hire" data-idx="${i}" ${full || s.money < c.fee ? 'disabled' : ''}>Hire ${fmt(c.fee)}</button></div></div>`).join('');
  return `<div class="panel-note">Team <b>${s.barbers.length}/${st.maxBarbers}</b> at ${st.name}. Wages are paid at closing time.${full && s.stage < STAGES.length - 1 ? ' <b>Expand</b> to hire more barbers!' : ''}</div>
    <h3>Your team</h3>${team}
    <h3>Looking for work <span class="muted">(new faces every morning)</span></h3>${cands || '<div class="muted">Nobody today. Come back tomorrow.</div>'}`;
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
  return Object.entries(UPGRADES).map(([key, u]) => {
    const lvl = s.upgrades[key], max = u.costs.length;
    const cost = u.costs[lvl];
    const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    return `<div class="card">
      <div class="card-icon">${u.icon}</div>
      <div class="card-main"><div class="card-title">${u.name}</div><div class="card-desc">${u.desc}</div><div class="pips">${pips}</div></div>
      <div class="side">${lvl >= max ? '<span class="badge">MAX</span>' : `<button class="btn small" data-action="upgrade" data-key="${key}" ${s.money < cost ? 'disabled' : ''}>${fmt(cost)}</button>`}</div></div>`;
  }).join('');
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
      <div><span>Customers served</span><b>${s.stats.served}</b></div>
      <div><span>Customers lost</span><b>${s.stats.lost}</b></div>
      <div><span>Customers / hour</span><b>${spawnRatePerHour().toFixed(1)}</b></div>
      <div><span>Shop appeal</span><b>${decorScore()}</b></div>
      <div><span>Days in business</span><b>${s.day}</b></div>
    </div>
    <div class="menu-btns">
      <button class="btn" data-action="toggleSound">${UI.muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
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
    case 'toggleSound': UI.muted = !UI.muted; break;
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
  }
  if (r && !r.ok && r.reason) toast(r.reason, 2200, 'warn');
  if (UI.panel) renderPanel();
  updateHUD(true);
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
      <li>💈 Customers walk in, wait on a seat and get a cut from a free barber.</li>
      <li>⏳ Watch the patience bar – slow service costs you reputation ★.</li>
      <li>🛠️ <b>Build</b> more seats, chairs and decor. Appeal brings more customers.</li>
      <li>💇 <b>Hire</b> barbers, unlock <b>services</b> and buy <b>upgrades</b>.</li>
      <li>🏙️ <b>Expand</b> from the garage to a corner shop, downtown, a studio and finally the <b>Cani Empire HQ</b>.</li>
    </ul>
    <p class="muted small">Drag to move the camera, scroll / pinch to zoom. Space pauses, 1-3 set speed.</p>`,
    [{ label: "Let's cut some hair ✂️", cls: 'primary', fn: () => { Game.state.introSeen = true; Game.paused = false; } }]);
}

function showDaySummary(sm) {
  const net = sm.revenue + sm.tips - sm.wages - sm.rent;
  const repD = sm.repEnd - sm.repStart;
  let tip = '';
  if (sm.lost > sm.served * 0.3 && sm.lost > 2) {
    tip = Game.state.barbers.length < stage().maxBarbers
      ? '💡 Many customers left. Hire another barber, add chairs and waiting seats – or decor like a TV to make waiting easier.'
      : Game.state.stage < STAGES.length - 1
        ? `💡 Many customers left. ${stage().name} is at full capacity – save up and <b>Expand</b> to hire more barbers. Pro Clippers also speed things up.`
        : '💡 Many customers left. Add waiting seats and patience decor, or raise prices to Premium.';
  }
  else if (Game.state.money > 800 && Game.state.stage === 0) tip = '💡 Check the <b>Expand</b> tab – the Corner Shop is waiting!';
  else if (sm.served > 0 && repD < 0) tip = '💡 Reputation dropped. Faster service and skilled barbers keep customers happy.';
  showModal(`<h2>🌙 Day ${sm.day} closed</h2>
    <div class="stats">
      <div><span>Haircuts</span><b>${fmt(sm.revenue)}</b></div>
      <div><span>Tips</span><b>${fmt(sm.tips)}</b></div>
      <div><span>Wages</span><b class="neg">-${fmt(sm.wages)}</b></div>
      <div><span>Rent</span><b class="neg">-${fmt(sm.rent)}</b></div>
      <div class="total"><span>Profit</span><b class="${net < 0 ? 'neg' : 'pos'}">${fmt(net)}</b></div>
      <div><span>Served / lost</span><b>${sm.served} / ${sm.lost}</b></div>
      <div><span>Reputation</span><b>${sm.repEnd.toFixed(2)} ${repD >= 0 ? '▲' : '▼'}${Math.abs(repD).toFixed(2)}</b></div>
      <div><span>Cash</span><b>${fmt(sm.money)}</b></div>
    </div>${tip ? `<p class="tip">${tip}</p>` : ''}`,
    [{ label: `☀️ Open Day ${Game.state.day}`, cls: 'primary', fn: startDay }]);
}

// ---------- sound ----------

let audioCtx = null;
function sfx(kind) {
  if (UI.muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { cash: [[1318, 0], [1760, 0.07]], place: [[440, 0], [660, 0.05]], sell: [[660, 0], [440, 0.06]], hire: [[523, 0], [659, 0.08], [784, 0.16]], fanfare: [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36]] }[kind] || [[600, 0]];
    const now = audioCtx.currentTime;
    for (const [f, d] of notes) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = kind === 'cash' ? 'triangle' : 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(0.06, now + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(now + d); o.stop(now + d + 0.2);
    }
  } catch (e) { /* audio unavailable */ }
}
