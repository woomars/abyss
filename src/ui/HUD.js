// Top HUD: HP bar (MVP: always full), level/floor, kill count, pause button.
export class HUD {
  constructor(root, { onPause }) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-left">
        <div class="hp"><div class="hp-fill"></div><span class="hp-text">HP 100 / 100</span></div>
        <div class="meta"><span class="lv">Lv 1</span><span class="floor">연습장</span></div>
      </div>
      <div class="hud-center"><span class="kills-label">처치</span> <span class="kills">0</span></div>
      <button class="pause interactive" aria-label="일시 정지">❚❚</button>`;
    root.appendChild(this.el);
    this.killsEl = this.el.querySelector('.kills');
    this.pauseBtn = this.el.querySelector('.pause');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onPause(); });
    this.lastKills = -1;
  }

  rect() {
    const r = this.pauseBtn.getBoundingClientRect();
    return { x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 };
  }

  update(game) {
    const k = game.stats.kills;
    if (k !== this.lastKills) {
      this.lastKills = k;
      this.killsEl.textContent = String(k);
    }
  }
}
