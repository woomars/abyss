import { loadConfig } from './game/config.js';
import { Game } from './game/Game.js';
import { GameLoop } from './game/GameLoop.js';
import { Events } from './core/Events.js';
import { createRng } from './core/rng.js';
import { Renderer } from './render/Renderer.js';
import { bindInput } from './systems/InputBinder.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { SkillButtons } from './ui/SkillButtons.js';
import { HUD } from './ui/HUD.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { GameOver } from './ui/GameOver.js';
import { chooseRotation, stageSize, stageTransform, toStage } from './systems/orientation.js';

function safeStorage() {
  try { return window.localStorage; } catch (_) { return null; }
}

async function enterFullscreenLandscape() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) { /* not supported or denied: game still works */ }
}

async function boot() {
  const config = await loadConfig((p) => fetch(p, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`load failed: ${p}`);
    return r.json();
  }));
  const events = new Events();
  const rng = createRng((Date.now() & 0xffffffff) >>> 0);
  const canvas = document.getElementById('game');
  const ui = document.getElementById('ui');
  const renderer = new Renderer(canvas, config);
  const game = new Game(config, { events, rng });
  const audio = new AudioSystem(events, rng, config.audio);
  const save = new SaveSystem(safeStorage());
  const settings = save.load();

  const applySettings = (s) => {
    game.camera.setShakeEnabled(s.shake);
    audio.setEnabled(s.sound);
  };
  applySettings(settings);

  const stage = document.getElementById('stage');
  const startEl = document.getElementById('start');
  let started = false;
  let menu = null;
  const updatePaused = () => {
    game.paused = !started || (menu && menu.isOpen);
  };

  const skillButtons = new SkillButtons(ui, game.skills, { toLocal: (x, y) => toLocal(x, y) });
  const hud = new HUD(ui, { onPause: () => menu.open() });
  const gameOver = new GameOver(ui, { onRetry: () => game.restart() });
  events.on('playerDown', (s) => gameOver.show(s));
  menu = new PauseMenu(ui, {
    settings,
    onChange: (s) => { applySettings(s); save.save(s); },
    onRestart: () => { game.restart(); gameOver.hide(); },
    onOpenChange: updatePaused,
  });

  // --- forced landscape: rotate the whole stage when the viewport is portrait ---
  let rot = 0;
  let gx = null; // low-passed gravity along the device x axis (m/s²)
  const toLocal = (x, y) => toStage(rot, x, y, window.innerWidth, window.innerHeight);
  // client-space rect -> stage-space rect (for stroke exclusion zones)
  const rectToStage = (r) => {
    const a = toLocal(r.x, r.y), b = toLocal(r.x + r.w, r.y + r.h);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  };

  let debug = null;
  const layout = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    rot = chooseRotation(rot, { vw, vh, gx });
    const s = stageSize(rot, vw, vh);
    stage.style.width = s.w + 'px';
    stage.style.height = s.h + 'px';
    stage.style.transform = stageTransform(rot, vw, vh);
    renderer.resize(s.w, s.h, window.devicePixelRatio || 1);
    const v = renderer.viewWorld;
    game.camera.setViewport(v.w, v.h);
    const rects = [...skillButtons.rects(), hud.rect()];
    if (debug) rects.push(debug.rect());
    game.strokes.setExcludedRects(rects.map(rectToStage));
    updatePaused();
  };
  // in development the tuning panel is on by default; ?debug=0 hides it
  if (new URLSearchParams(location.search).get('debug') !== '0') {
    debug = new DebugPanel(ui, { config, game, onLayout: () => layout() });
  }
  window.addEventListener('resize', layout);
  // turning the phone 180° while auto-rotate is off: follow gravity
  window.addEventListener('devicemotion', (e) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    gx = gx == null ? g.x : gx * 0.8 + g.x * 0.2;
    if (window.innerWidth < window.innerHeight && chooseRotation(rot, { vw: window.innerWidth, vh: window.innerHeight, gx }) !== rot) layout();
  });
  layout();

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { menu.open(); audio.suspend(); } else { audio.resume(); }
  });

  bindInput(canvas, game.strokes, { toLocal });
  // Chrome grants user activation for touch on pointerup/touchend, not pointerdown:
  // unlock audio and request fullscreen + landscape lock there, retrying until it sticks.
  const onGesture = (e) => {
    audio.unlock();
    if (e.pointerType === 'touch' && !document.fullscreenElement) enterFullscreenLandscape().then(layout);
  };
  document.addEventListener('pointerup', onGesture, true);
  document.addEventListener('pointerdown', () => audio.unlock(), true);
  // start screen: the first tap is the gesture that allows fullscreen, landscape lock and sound
  startEl.addEventListener('pointerup', (e) => {
    e.preventDefault();
    started = true;
    startEl.classList.add('hidden');
    updatePaused();
  });

  const loop = new GameLoop({
    step: 1 / 60,
    maxFrame: 0.25,
    update: (dt) => game.update(dt),
    render: (alpha) => {
      renderer.render(game, alpha);
      skillButtons.render();
      hud.update(game);
      if (debug) debug.frame();
    },
  });
  const tick = (t) => { loop.frame(t / 1000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  window.__abyss = { game, config, renderer, loop, events, audio, menu };
}

boot().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#e66;position:fixed;top:8px;left:8px;white-space:pre-wrap';
  pre.textContent = String(err && err.stack || err);
  document.body.appendChild(pre);
});
