// Boot, main loop and input

(function () {
  const canvas = $('#game');
  Renderer.init(canvas);

  const saved = loadGame();
  initWorld(saved || newState());
  Renderer.fitCamera();
  window.addEventListener('resize', () => Renderer.fitCamera());

  Game.listeners.push(ev => {
    if (ev && ev.type === 'dayEnd') { setTool(null); Game.selected = null; musicMuffle(true); showDaySummary(ev.summary); }
    if (ev === 'dayStart') musicMuffle(false);
    if (ev === 'items' || ev === 'expand') saveGame();
  });

  if (!Game.state.introSeen) { Game.paused = true; showIntro(); }
  else toast(`Welcome back to ${stage().name}! Day ${Game.state.day} ☀️`);

  // ---------- UI wiring ----------
  $('#toolbar').addEventListener('click', e => {
    const b = e.target.closest('button[data-panel]');
    if (b) openPanel(b.dataset.panel);
  });
  $('#menuBtn').addEventListener('click', () => openPanel('menu'));
  $('#panelClose').addEventListener('click', closePanel);
  $('#panelBody').addEventListener('click', handlePanelClick);
  $('#panelBody').addEventListener('change', handlePanelChange);
  $('#panelBody').addEventListener('keydown', handlePanelKey);
  $('#inspect').addEventListener('click', handleInspectClick);
  $('#buildHint').addEventListener('click', e => { if (e.target.closest('[data-hint="cancel"]')) setTool(null); });
  $('#speedBtns').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = +b.dataset.speed;
    if (v === 0) Game.paused = !Game.paused;
    else { Game.paused = false; Game.speed = v; }
    updateHUD(true);
  });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') { if (UI.tool) setTool(null); else if (Game.selected) Game.selected = null; else closePanel(); }
    if (e.key === ' ') { Game.paused = !Game.paused; e.preventDefault(); }
    if (['1', '2', '3'].includes(e.key)) { Game.paused = false; Game.speed = +e.key; }
    if (e.key === 'b') openPanel('build');
    updateHUD(true);
  });

  // ---------- pointer input: drag to pan, tap to act, wheel/pinch to zoom ----------
  const pointers = new Map();
  let drag = null, pinch = null;

  // audio may only start after a user gesture
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  $('#hudCoins').addEventListener('click', () => openPanel('rewards'));
  $('#musicBtn').addEventListener('click', () => { unlockAudio(); setMusic(!Sound.musicOn); updateHUD(true); });

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { sx: e.clientX, sy: e.clientY, cx: Renderer.cam.x, cy: Renderer.cam.y, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: Renderer.cam.zoom };
      drag = null;
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' || pointers.size <= 1) {
      Renderer.hover = Renderer.tileAt(e.clientX, e.clientY);
      Renderer.hoverAgent = e.pointerType === 'mouse' && !UI.tool ? Renderer.pickAgent(e.clientX, e.clientY) : null;
      const hovItem = e.pointerType === 'mouse' && !UI.tool && !Renderer.hoverAgent ? Renderer.pickItem(e.clientX, e.clientY) : null;
      const pile = Game.piles.some(p => p.x === Renderer.hover.x && p.y === Renderer.hover.y);
      canvas.style.cursor = Renderer.hoverAgent || pile || (hovItem && (ITEMS[hovItem.type].station || ITEMS[hovItem.type].register)) ? 'pointer' : '';
    }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, clamp(pinch.zoom * d / pinch.d, 0.4, 2.5));
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) { Renderer.cam.x = drag.cx + dx; Renderer.cam.y = drag.cy + dy; }
    }
  });

  const end = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (drag && !drag.moved && e.type === 'pointerup') {
      const tile = Renderer.tileAt(e.clientX, e.clientY);
      Renderer.hover = tile;
      if (UI.tool) toolClick(tile);
      else if (!Game.nightMode) {
        const drop = Renderer.pickDrop(e.clientX, e.clientY);
        if (drop) { collectDrop(drop); drag = null; return; }
        const agent = Renderer.pickAgent(e.clientX, e.clientY);
        const item = Renderer.pickItem(e.clientX, e.clientY);
        handleWorldTap(agent, item, tile);
        if (!Game.selected && !agent && !item && UI.panel && window.innerWidth < 760) closePanel();
        updateInspector();
      }
    }
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') Renderer.hover = null; });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); setTool(null); });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, clamp(Renderer.cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.4, 2.5));
  }, { passive: false });

  function zoomAt(sx, sy, z) {
    const before = Renderer.toWorld(sx, sy);
    Renderer.cam.zoom = z;
    Renderer.cam.x = sx - Renderer.w / 2 - before.x * z;
    Renderer.cam.y = sy - Renderer.h / 2 - before.y * z;
  }

  // ---------- loop ----------
  let last = performance.now(), saveT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    Renderer.draw();
    updateHUD();
    saveT += dt;
    if (saveT > 20 && !Game.nightMode) { saveT = 0; saveGame(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.CANI = Game; // handy for debugging in the console
})();
