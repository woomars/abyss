// ?debug=1 — FPS and three helpers only: go to a room, set the level, get an item (worn at once).
export class DebugPanel {
  constructor(root, { config, game, onLayout, onFloor = null, onOpenChange = () => {}, onGear = () => {} }) {
    this.onGear = onGear; // an item was put on (the HUD / forge refresh)
    this.onOpenChange = onOpenChange; // open panel = the game waits
    this.config = config;
    this.game = game;
    this.onFloor = onFloor;
    this.onLayout = onLayout;
    this.frames = 0;
    this.fpsTime = performance.now();

    this.el = document.createElement('div');
    this.el.className = 'debug interactive collapsed';
    this.el.innerHTML = `
      <div class="dhead"><button data-act="toggle">DEBUG</button><span class="fps">-- fps</span></div>
      <div class="dbody">
        <div class="dbtns">방 이동 <select data-act="floor"><option value="">고르기</option><option value="0">연습장</option><option value="-1">보물방</option><option value="-2">대장간</option><option value="-3">증표 받기</option><option value="-4">보스 연전 (끝없는 보스방)</option>${
          Array.from({ length: 21 }, (_, i) => `<option value="${i + 1}">지하 ${i + 1}층</option>`).join('')}</select></div>
        <div class="dbtns">장비 지급 <select data-act="grant"><option value="">고르기</option><option value="common">일반</option><option value="uncommon">고급</option><option value="rare">희귀</option><option value="epic">영웅</option><option value="legendary">전설</option><option value="set">세트</option></select></div>
        <div class="dbtns">내 레벨 <input type="number" class="dlevel" min="1" max="99" step="1" value="1" inputmode="numeric" style="width:56px;user-select:text;-webkit-user-select:text"><button data-act="setLevel">적용</button><span class="dlevel-now"></span></div>
      </div>`;
    root.appendChild(this.el);
    this.fpsEl = this.el.querySelector('.fps');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('change', (e) => {
      if (e.target.dataset.act === 'grant' && e.target.value !== '') {
        this.grant(e.target.value);
        e.target.value = '';
      }
      if (e.target.dataset.act === 'floor' && e.target.value !== '' && this.onFloor) {
        this.onFloor(Number(e.target.value));
        e.target.value = '';
        this.setOpen(false); // straight into the chosen floor
      }
    });
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'toggle') this.setOpen(this.el.classList.contains('collapsed'));
      if (b.dataset.act === 'setLevel') this.setLevel(Number(this.el.querySelector('.dlevel').value));
    });
  }

  rect() {
    const r = this.el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  get isOpen() { return !this.el.classList.contains('collapsed'); }

  // opening the panel pauses the game; closing it (or going back to the game) carries on
  setOpen(open) {
    this.el.classList.toggle('collapsed', !open);
    this.onLayout();
    this.onOpenChange(open);
  }

  // debug: set the family level (stats and max hp follow; growth cards owed by the level show at the next cleared room)
  setLevel(n) {
    const g = this.game, max = (g.config.progress && g.config.progress.maxLevel) || 99;
    const lv = Math.max(1, Math.min(max, Math.round(n) || 1));
    g.vault.progress.level = lv;
    g.vault.progress.xp = 0;
    g.refreshBonus();
    g.applyMaxHp();
    g.player.hp = g.player.maxHp;
    if (g.vault.state !== 'idle' || g.forge) g.saveVault();
    this.el.querySelector('.dlevel-now').textContent = ` → Lv ${lv}`;
  }

  // a new item of the chosen grade is put on at once; what was worn in that slot goes to the pocket
  grant(grade) {
    const g = this.game;
    const cfg = this.config.items;
    const floor = g.dungeon && g.dungeon.floor > 0 ? g.dungeon.floor : 1;
    const opts = { id: g.allocItemId(), level: floor, quality: Math.floor(Math.random() * 3) };
    if (grade === 'set') opts.set = Object.keys(cfg.sets)[Math.floor(Math.random() * Object.keys(cfg.sets).length)]; else opts.grade = grade;
    import('../game/items/ItemFactory.js').then(({ createItem }) => {
      g.wearNew(createItem(cfg, Math.random, opts));
      this.onGear();
    });
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
