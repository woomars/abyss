import { loadConfig } from './game/config.js';
import { Game } from './game/Game.js';
import { GameLoop } from './game/GameLoop.js';
import { Events } from './core/Events.js';
import { createRng } from './core/rng.js';
import { Renderer } from './render/Renderer.js';
import { bindInput } from './systems/InputBinder.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { SkillButtons } from './ui/SkillButtons.js';

async function boot() {
  const config = await loadConfig((p) => fetch(p, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`load failed: ${p}`);
    return r.json();
  }));
  const events = new Events();
  const rng = createRng((Date.now() & 0xffffffff) >>> 0);
  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas, config);
  const game = new Game(config, { events, rng });

  const ui = document.getElementById('ui');
  const skillButtons = new SkillButtons(ui, game.skills);
  const resize = () => {
    renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    const v = renderer.viewWorld;
    game.camera.setViewport(v.w, v.h);
    game.strokes.setExcludedRects(skillButtons.rects());
  };
  window.addEventListener('resize', resize);
  resize();

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  const audio = new AudioSystem(events, rng);
  bindInput(canvas, game.strokes, { onFirstPointer: () => audio.unlock() });
  // some browsers re-suspend audio; retry on every touch
  canvas.addEventListener('pointerdown', () => audio.unlock());

  const loop = new GameLoop({
    step: 1 / 60,
    maxFrame: 0.25,
    update: (dt) => game.update(dt),
    render: (alpha) => { renderer.render(game, alpha); skillButtons.render(); },
  });
  const tick = (t) => { loop.frame(t / 1000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  window.__abyss = { game, config, renderer, loop, events, audio };
}

boot().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#e66;position:fixed;top:8px;left:8px;white-space:pre-wrap';
  pre.textContent = String(err && err.stack || err);
  document.body.appendChild(pre);
});
