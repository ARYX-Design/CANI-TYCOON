// Boot, main loop and input

(async function () {
  // the logo is painted onto signs and walls, so give it a moment to load
  await Promise.race([
    Promise.all([LOGO, LOGO_WORDMARK].map(img => (img.decode ? img.decode() : Promise.resolve()).catch(() => {}))),
    new Promise(res => setTimeout(res, 1500)),
  ]);
  const canvas = $('#game');
  Renderer.init(canvas);
  initR3();

  // sign in first: every player has their own shop
  await cloudProbe();
  const player = await accountGate();
  const saved = await loadProfileSave(player);
  initWorld(saved || newState());
  Renderer.fitCamera();
  window.addEventListener('resize', () => Renderer.fitCamera());
  cloudInit().then(() => submitScore(true));
  boardInit();

  Game.listeners.push(ev => {
    if (ev && ev.type === 'dayEnd') { submitScore(true); setTool(null); Game.selected = null; musicMuffle(true); showDaySummary(ev.summary); }
    if (ev === 'dayStart') musicMuffle(false);
    if (ev === 'items' || ev === 'expand') saveGame();
  });

  if (!Game.state.introSeen) { Game.paused = true; showIntro(); }
  else toast(`Welcome back, ${player.name}! ${stage().name}, day ${Game.state.day} ☀️`);

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
  $('#buildHint').addEventListener('click', e => {
    if (e.target.closest('[data-hint="cancel"]')) setTool(null);
    if (e.target.closest('[data-hint="rotate"]') && UI.tool) { UI.tool.rot = ((UI.tool.rot || 0) + 1) & 3; sfx('click'); }
  });
  $('#speedBtns').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = +b.dataset.speed;
    if (v === 0) Game.paused = !Game.paused;
    else { Game.paused = false; Game.speed = v; }
    updateHUD(true);
  });

  window.addEventListener('keyup', e => { if ('qQeE'.includes(e.key)) VIEW.spin = 0; });
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') { if (UI.tool) setTool(null); else if (Game.selected || Game.selectedItem) { Game.selected = null; Game.selectedItem = null; } else closePanel(); }
    if (e.key === ' ') { Game.paused = !Game.paused; e.preventDefault(); }
    if (['1', '2', '3'].includes(e.key)) { Game.paused = false; Game.speed = +e.key; }
    if (e.key === 'b') openPanel('build');
    // T turns the furniture being placed, or the selected piece
    if (e.key === 't' || e.key === 'T') {
      if (UI.tool && UI.tool.mode !== 'sell') UI.tool.rot = ((UI.tool.rot || 0) + 1) & 3;
      else if (Game.selectedItem) { rotateItem(Game.selectedItem); UI.inspectKey = ''; }
    }
    // hold Q / E to spin the 3D view
    if ((e.key === 'q' || e.key === 'Q') && !e.repeat) VIEW.spin = -1;
    if ((e.key === 'e' || e.key === 'E') && !e.repeat) VIEW.spin = 1;
    if (e.key === 'r' || e.key === 'R') resetRotation();
    updateHUD(true);
  });

  // ---------- pointer input: drag to pan, tap to act, wheel/pinch to zoom ----------
  const pointers = new Map();
  let drag = null, pinch = null;

  // audio may only start after a user gesture
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  // rotate buttons: tap turns 45°, press and hold spins smoothly; the compass turns back to the start
  let holdRot = null;
  $('#rotateBtns').addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-rot]');
    if (!b) return;
    e.preventDefault();
    holdRot = { dir: +b.dataset.rot, t0: performance.now(), spun: false };
    setTimeout(() => { if (holdRot && !holdRot.spun) { holdRot.spun = true; VIEW.spin = holdRot.dir; } }, 220);
  });
  const releaseRot = () => {
    if (!holdRot) return;
    if (!holdRot.spun) rotateView(holdRot.dir);
    VIEW.spin = 0;
    holdRot = null;
  };
  window.addEventListener('pointerup', releaseRot);
  window.addEventListener('pointercancel', releaseRot);
  $('#compassBtn').addEventListener('click', resetRotation);
  $('#hudCoins').addEventListener('click', () => openPanel('rewards'));
  $('#musicBtn').addEventListener('click', () => { unlockAudio(); setMusic(!Sound.musicOn); updateHUD(true); });

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // right-button or Shift + drag rotates the 3D view; a plain drag pans
    const rotating = R3.active && (e.button === 2 || e.shiftKey);
    if (pointers.size === 1) drag = { sx: e.clientX, sy: e.clientY, cx: Renderer.cam.x, cy: Renderer.cam.y, moved: false, rotate: rotating, lastX: e.clientX };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: Renderer.cam.zoom, ang: Math.atan2(b.y - a.y, b.x - a.x) };
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
      // twisting two fingers rotates the shop with them
      if (R3.active) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        let da = ang - pinch.ang;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        pinch.ang = ang;
        turnView(-da);
      }
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved && drag.rotate) { turnView((e.clientX - drag.lastX) * 0.008); drag.lastX = e.clientX; }
      else if (drag.moved) { Renderer.cam.x = drag.cx + dx; Renderer.cam.y = drag.cy + dy; }
    }
  });

  const end = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (drag && !drag.moved && !drag.rotate && e.type === 'pointerup') {
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
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (!R3.active) setTool(null); });
  // right-click without dragging still cancels the build tool in 3D
  canvas.addEventListener('pointerup', e => { if (e.button === 2 && drag === null && UI.tool && R3.active && !rightMoved) setTool(null); });
  let rightMoved = false;
  canvas.addEventListener('pointerdown', e => { if (e.button === 2) rightMoved = false; });
  canvas.addEventListener('pointermove', e => { if (e.buttons & 2) rightMoved = true; });

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
    // the first frame's timestamp can be slightly earlier than `last`; never run time backwards
    const rawDt = Math.max(0, Math.min(0.25, (now - last) / 1000));
    const dt = Math.min(0.05, rawDt);
    last = now;
    // keep the loop alive even if one part fails, so the game never freezes on a blank screen
    requestAnimationFrame(frame);
    const step = (name, fn) => {
      try { fn(); } catch (e) {
        frameErrors[name] = (frameErrors[name] || 0) + 1;
        if (frameErrors[name] === 1) { console.error(e); toast(`⚠️ Something went wrong (${name}): ${e.message}`, 5000, 'warn'); }
      }
    };
    step('game', () => update(dt));
    if (VIEW.spin && R3.active) turnView(VIEW.spin * rawDt * 1.6);
    VIEW.frameDt = rawDt;
    step('drawing', () => Renderer.draw());
    step('hud', () => updateHUD());
    saveT += dt;
    if (saveT > 20 && !Game.nightMode) { saveT = 0; saveGame(); }
  }
  const frameErrors = {};
  requestAnimationFrame(frame);

  window.CANI = Game; // handy for debugging in the console
  window.__caniStarted = true;
  window.__caniSave = saveGame;
  // save before the page is reloaded or updated
  window.addEventListener('pagehide', () => saveGame());
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
  try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => { saveGame(); return {}; }); } catch (e) { /* not in the viewer */ }
})();
