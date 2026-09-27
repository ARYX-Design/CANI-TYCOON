// Leaderboard between players.
//   🌍 Everyone: the rewards server's leaderboard, or – in the claude.ai preview – the page's shared database
//   📱 This device: the players on this phone or computer
// Scores are reported at the end of every day, when the panel opens, and once after the game starts.

const Board = {
  scope: 'all',       // 'all' | 'device'
  metric: 'earned',
  rows: null,         // rows for the 'all' scope, or null while loading
  me: null,
  players: 0,
  error: '',
  db: null,           // the artifact's shared database (preview only)
  uid: null,
  readOnly: false,
  lastSent: 0,
};

const BOARD_METRICS = {
  earned: { label: '💰 Earned', show: v => fmt(v) },
  served: { label: '💇 Served', show: v => `${v} cuts` },
  day:    { label: '📅 Days',   show: v => `Day ${v}` },
};

function myScore() {
  const s = Game.state;
  return { name: Account.current.name, earned: Math.round(s.stats.earned), served: s.stats.served, day: s.day, stage: s.stage, updatedAt: Date.now() };
}

const boardOnline = () => Cloud.online || !!Board.db;

// In the claude.ai preview the leaderboard lives in the page's shared database: one document per person
// (scores/<their id>) holding each of their players; everyone can read all of them.
async function boardInit() {
  if (!(window.claude && typeof window.claude.use === 'function')) return;
  try {
    const db = await window.claude.use('db');
    const user = db && await window.claude.use('user');
    const uid = user && await user.id();
    if (!db || !uid) return;
    Board.db = db; Board.uid = uid;
    if (await user.can('data.write') === false) Board.readOnly = true;
    submitScore(true);
    if (UI.panel === 'leaderboard') loadBoard();
  } catch (e) { /* no shared database here */ }
}

async function submitScore(force) {
  if (!Game.state || !Account.current || Game.noSave) return;
  if (!force && Date.now() - Board.lastSent < 15000) return;
  Board.lastSent = Date.now();
  const sc = myScore();
  try {
    if (Cloud.online) await api('POST', '/api/score', sc);
    else if (Board.db && !Board.readOnly) {
      const ref = Board.db.doc('scores/' + Board.uid);
      const players = { [Account.current.id]: sc };
      // merge this player into the person's document (their other players stay)
      try { await ref.update({ players }); }
      catch (e) {
        if (e && e.code !== 'invalid_argument') throw e;
        const snap = await ref.get();
        if (snap.exists) throw e;          // the update was refused, not missing: read-only for this visit
        await ref.set({ players });
      }
    }
  } catch (e) {
    if (e && e.code === 'invalid_argument') Board.readOnly = true;
  }
}

async function loadBoard() {
  Board.error = '';
  try {
    if (Cloud.online) {
      const r = await api('GET', '/api/leaderboard?by=' + Board.metric);
      Board.rows = r.rows; Board.me = r.me; Board.players = r.players;
    } else if (Board.db) {
      const snap = await Board.db.collection('scores').limit(1000).get();
      const all = [];
      for (const d of snap.docs) {
        const players = (d.data() || {}).players || {};
        for (const [pid, sc] of Object.entries(players)) {
          if (!sc || typeof sc !== 'object') continue;
          all.push({ name: String(sc.name || '?').slice(0, 16), earned: +sc.earned || 0, served: +sc.served || 0, day: +sc.day || 0, stage: +sc.stage || 0,
            updatedAt: +sc.updatedAt || 0, me: d.id === Board.uid && pid === Account.current.id });
        }
      }
      rankRows(all);
      Board.rows = all.slice(0, 50); Board.me = all.find(r => r.me) || null; Board.players = all.length;
    }
  } catch (e) { Board.error = 'Could not load the leaderboard. Try again in a moment.'; Board.rows = Board.rows || []; }
  if (UI.panel === 'leaderboard') renderPanel();
}

function rankRows(rows) {
  const k = Board.metric;
  rows.sort((a, b) => b[k] - a[k] || (a.updatedAt || 0) - (b.updatedAt || 0));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

// the players on this device, from their saves (the current one from the live game)
function deviceRows() {
  const rows = profileList().map(p => {
    if (p.id === Account.current.id) return { ...myScore(), me: true };
    const s = readLocalSave(p.id);
    return s ? { name: p.name, earned: Math.round(s.stats.earned), served: s.stats.served, day: s.day, stage: s.stage, updatedAt: s.savedAt || 0 } : null;
  }).filter(Boolean);
  return rankRows(rows);
}

function openLeaderboard() {
  submitScore(true).then(() => { if (boardOnline()) loadBoard(); });
}

function leaderboardPanel() {
  const online = boardOnline();
  if (!online) Board.scope = 'device';
  const rows = Board.scope === 'device' ? deviceRows() : Board.rows;
  const me = Board.scope === 'device' ? rows.find(r => r.me) : Board.me;
  const medal = r => ['🥇', '🥈', '🥉'][r.rank - 1] || `<span class="lb-num">${r.rank}</span>`;
  const row = r => `<div class="lb-row${r.me ? ' me' : ''}">
      <span class="lb-rank">${medal(r)}</span>
      <span class="lb-name"><b>${escapeHtml(r.name)}${r.me ? ' <span class="badge">You</span>' : ''}</b><small>${(STAGES[r.stage] || STAGES[0]).name}</small></span>
      <span class="lb-val">${BOARD_METRICS[Board.metric].show(r[Board.metric])}</span></div>`;
  const tabs = `<div class="segmented">${online ? `<button data-action="lbScope" data-v="all" class="seg${Board.scope === 'all' ? ' active' : ''}">🌍 Everyone</button>` : ''}
      <button data-action="lbScope" data-v="device" class="seg${Board.scope === 'device' ? ' active' : ''}">📱 This device</button></div>
    <div class="segmented">${Object.entries(BOARD_METRICS).map(([k, m]) => `<button data-action="lbMetric" data-v="${k}" class="seg${Board.metric === k ? ' active' : ''}">${m.label}</button>`).join('')}</div>`;
  let list;
  if (!rows) list = '<div class="empty">Loading the leaderboard…</div>';
  else if (!rows.length) list = '<div class="empty">No players yet – you could be number one! 🏆</div>';
  else list = rows.map(row).join('') + (me && !rows.some(r => r.me) ? `<div class="lb-gap">…</div>${row(me)}` : '');
  const note = Board.scope === 'device'
    ? 'Players on this phone or computer.'
    : `${Board.players} player${Board.players === 1 ? '' : 's'} in total. Your shop is sent at the end of every day.${Board.readOnly ? ' You can see the board, but only people with Contributor access can post a score here.' : ''}`;
  return `<div class="account-row"><span>🏷️ Your name on the board: <b>${escapeHtml(Account.current.name)}</b></span><button class="btn small" data-action="lbRename">✏️ Change</button></div>
    ${tabs}
    ${Board.error ? `<div class="panel-note">⚠️ ${Board.error}</div>` : ''}
    <div class="lb-list">${list}</div>
    <div class="panel-note">${note}</div>`;
}

function renamePlayer() {
  showModal(`<h2>✏️ Your name</h2><p>This is the name other players see on the leaderboard.</p>
    <input class="field" id="lbName" maxlength="16" value="${escapeHtml(Account.current.name)}">`, [
    { label: 'Cancel' },
    { label: 'Save', cls: 'primary', fn: () => {
      const name = ($('#lbName').value || '').trim().replace(/\s+/g, ' ').slice(0, 16);
      if (!name) return;
      Account.current.name = name;
      saveProfiles();
      submitScore(true).then(() => { if (boardOnline()) loadBoard(); });
      renderPanel();
    } },
  ]);
  setTimeout(() => { const i = $('#lbName'); if (i) { i.focus(); i.select(); i.onkeydown = e => e.stopPropagation(); } }, 30);
}
