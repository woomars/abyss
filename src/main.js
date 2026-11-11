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
  const audio = new AudioSystem(events, rng);
  const save = new SaveSystem(safeStorage());
  const settings = save.load();

  const applySettings = (s) => {
    game.camera.setShakeEnabled(s.shake);
    audio.setEnabled(s.sound);
  };
  applySettings(settings);

  const portraitQuery = window.matchMedia('(orientation: portrait)');
  let menu = null;
  const updatePaused = () => {
    game.paused = (menu && menu.isOpen) || portraitQuery.matches;
  };

  const skillButtons = new SkillButtons(ui, game.skills);
  const hud = new HUD(ui, { onPause: () => menu.open() });
  menu = new PauseMenu(ui, {
    settings,
    onChange: (s) => { applySettings(s); save.save(s); },
    onRestart: () => game.restart(),
    onOpenChange: updatePaused,
  });

  let debug = null;
  const resize = () => {
    renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    const v = renderer.viewWorld;
    game.camera.setViewport(v.w, v.h);
    const rects = [...skillButtons.rects(), hud.rect()];
    if (debug) rects.push(debug.rect());
    game.strokes.setExcludedRects(rects);
    menu.setPortrait(portraitQuery.matches);
    updatePaused();
  };
  if (new URLSearchParams(location.search).get('debug') === '1') {
    debug = new DebugPanel(ui, { config, game, onLayout: () => resize() });
  }
  window.addEventListener('resize', resize);
  portraitQuery.addEventListener('change', resize);
  resize();

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { menu.open(); audio.suspend(); } else { audio.resume(); }
  });

  bindInput(canvas, game.strokes, {});
  // Chrome grants user activation for touch on pointerup/touchend, not pointerdown:
  // unlock audio and request fullscreen + landscape lock there, retrying until it sticks.
  const onGesture = (e) => {
    audio.unlock();
    if (e.pointerType === 'touch' && !document.fullscreenElement) enterFullscreenLandscape();
  };
  document.addEventListener('pointerup', onGesture, true);
  document.addEventListener('pointerdown', () => audio.unlock(), true);

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
