import { relicIcon } from './relicIcons.js';

// Top HUD: HP bar, floor (or practice), gold, owned treasures, kills, enemies left, pause button.
export class HUD {
  constructor(root, { onPause }) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-left">
        <div class="hp"><div class="hp-fill"></div><span class="hp-text">HP 100 / 100</span></div>
        <div class="meta"><span class="floor">연습장</span><span class="gold-wrap"><span class="gold-icon">◆</span> <span class="gold">0</span></span></div>
        <div class="relics"></div>
      </div>
      <div class="hud-center"><span class="kills-label">처치</span> <span class="kills">0</span><span class="left-wrap"> · 남은 적 <span class="left">0</span></span></div>
      <button class="pause interactive" aria-label="일시 정지">❚❚</button>`;
    root.appendChild(this.el);
    this.killsEl = this.el.querySelector('.kills');
    this.floorEl = this.el.querySelector('.floor');
    this.goldEl = this.el.querySelector('.gold');
    this.goldWrap = this.el.querySelector('.gold-wrap');
    this.leftEl = this.el.querySelector('.left');
    this.leftWrap = this.el.querySelector('.left-wrap');
    this.pauseBtn = this.el.querySelector('.pause');
    this.relicsEl = this.el.querySelector('.relics');
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onPause(); });
    this.last = {};
  }

  rect() {
    const r = this.pauseBtn.getBoundingClientRect();
    return { x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 };
  }

  // write only when the value changed (DOM writes are not free on phones)
  set(key, el, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el.textContent = value;
  }

  toggle(key, el, hidden) {
    if (this.last[key] === hidden) return;
    this.last[key] = hidden;
    el.classList.toggle('hidden', hidden);
  }

  update(game) {
    this.set('kills', this.killsEl, String(game.stats.kills));
    const d = game.dungeon, run = game.mode === 'dungeon';
    this.set('floor', this.floorEl, !run ? '연습장' : d.roomKind === 'treasure' ? `${d.floor}층 · 보물방` : `${d.floor}층`);
    this.set('gold', this.goldEl, String(d.gold));
    this.toggle('goldHidden', this.goldWrap, !run);
    const fighting = run && !d.exit.open && d.roomKind !== 'treasure';
    this.toggle('leftHidden', this.leftWrap, !fighting);
    if (fighting) this.set('left', this.leftEl, d.waveCount > 1 ? `${d.remaining} (웨이브 ${d.waveIndex}/${d.waveCount})` : String(d.remaining));
    const owned = game.relics.list();
    const key = owned.map((r) => r.id + r.count).join(',');
    if (this.last.relics !== key) {
      this.last.relics = key;
      this.relicsEl.innerHTML = owned.map((r) => `<span class="rl" title="${r.name}">${relicIcon(r.icon, 15)}${r.count > 1 ? `<b>${r.count}</b>` : ''}</span>`).join('');
    }
    const p = game.player;
    const hp = Math.ceil(p.hp);
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      if (!this.hpFill) { this.hpFill = this.el.querySelector('.hp-fill'); this.hpText = this.el.querySelector('.hp-text'); }
      this.hpFill.style.width = `${(100 * p.hp) / p.maxHp}%`;
      this.hpText.textContent = `HP ${hp} / ${p.maxHp}`;
      this.el.classList.toggle('low-hp', p.hp / p.maxHp <= 0.3);
    }
  }
}
