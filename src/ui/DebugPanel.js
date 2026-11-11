import { DEBUG_PARAMS, getPath, setPath } from './debugParams.js';

// ?debug=1 — FPS, live sliders over the config object, JSON export, spawn helper.
export class DebugPanel {
  constructor(root, { config, game, onLayout }) {
    this.config = config;
    this.game = game;
    this.onLayout = onLayout;
    this.frames = 0;
    this.fpsTime = performance.now();

    this.el = document.createElement('div');
    this.el.className = 'debug interactive collapsed';
    const rows = DEBUG_PARAMS.map((p, i) => `
      <label class="drow"><span>${p.path}</span>
        <input type="range" data-i="${i}" min="${p.min}" max="${p.max}" step="${p.step}" value="${getPath(config, p.path)}">
        <output data-o="${i}">${getPath(config, p.path)}</output></label>`).join('');
    this.el.innerHTML = `
      <div class="dhead"><button data-act="toggle">DEBUG</button><span class="fps">-- fps</span></div>
      <div class="dbody">
        <div class="dbtns"><button data-act="copy">JSON 복사</button><button data-act="spawn">적 무리 소환</button></div>
        ${rows}
        <textarea class="dexport hidden" readonly></textarea>
      </div>`;
    root.appendChild(this.el);
    this.fpsEl = this.el.querySelector('.fps');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('input', (e) => {
      const i = e.target.dataset.i;
      if (i === undefined) return;
      const p = DEBUG_PARAMS[+i];
      const v = Number(e.target.value);
      setPath(this.config, p.path, v);
      this.el.querySelector(`[data-o="${i}"]`).textContent = String(v);
    });
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'toggle') { this.el.classList.toggle('collapsed'); this.onLayout(); }
      if (b.dataset.act === 'copy') this.copy();
      if (b.dataset.act === 'spawn') this.spawn();
    });
  }

  rect() {
    const r = this.el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  copy() {
    const json = JSON.stringify(this.config, null, 2);
    const ta = this.el.querySelector('.dexport');
    const show = () => { ta.value = json; ta.classList.remove('hidden'); ta.select(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(() => { ta.classList.add('hidden'); }, show);
    } else show();
  }

  spawn() {
    const g = this.game;
    const p = g.player.pos, h = g.combat.inputDir;
    const cx = p.x + h.x * 200, cy = p.y + h.y * 200;
    for (let i = 0; i < 5; i++) g.enemies.spawnAt('soldier', { x: cx + (Math.random() * 2 - 1) * 70, y: cy + (Math.random() * 2 - 1) * 70 });
    g.enemies.spawnAt('elite', { x: cx + h.x * 60, y: cy + h.y * 60 });
  }

  frame() {
    this.frames++;
    const now = performance.now();
    if (now - this.fpsTime >= 1000) {
      this.fpsEl.textContent = `${Math.round((this.frames * 1000) / (now - this.fpsTime))} fps`;
      this.frames = 0;
      this.fpsTime = now;
    }
  }
}
