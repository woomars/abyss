import { DEBUG_PARAMS, getPath, setPath } from './debugParams.js';

const MUSIC_LABEL = { base: '거점', explore: '일반 전투', hard: '고난도', miniboss: '중간보스', boss: '대형 보스', rest: '보물방' };

// ?debug=1 — FPS, live sliders over the config object, JSON export, spawn helper, music preview.
export class DebugPanel {
  constructor(root, { config, game, onLayout, music = null, onFloor = null, onOpenChange = () => {} }) {
    this.onOpenChange = onOpenChange; // open panel = the game waits
    this.config = config;
    this.game = game;
    this.music = music;
    this.onFloor = onFloor;
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
        <div class="dbtns">층 이동 <select data-act="floor"><option value="">고르기</option><option value="0">연습장</option><option value="-1">보물방</option><option value="-2">대장간</option><option value="-3">증표 받기</option><option value="-4">보스 연전 (끝없는 보스방)</option>${
          Array.from({ length: 21 }, (_, i) => `<option value="${i + 1}">지하 ${i + 1}층</option>`).join('')}</select></div>
        <div class="dbtns">장비 지급 <select data-act="grant"><option value="">고르기</option><option value="common">일반</option><option value="uncommon">고급</option><option value="rare">희귀</option><option value="epic">영웅</option><option value="legendary">전설</option><option value="set">세트</option></select></div>
        <div class="dbtns">내 레벨 <input type="number" class="dlevel" min="1" max="99" step="1" value="1" inputmode="numeric" style="width:56px;user-select:text;-webkit-user-select:text"><button data-act="setLevel">적용</button><span class="dlevel-now"></span></div>
        <div class="dbtns">배경음악 <select data-act="music">${Object.keys(config.music.playlists).map((k) =>
          `<option value="${k}"${k === config.music.scenes.play ? ' selected' : ''}>${MUSIC_LABEL[k] || k} (${config.music.playlists[k].length}곡)</option>`).join('')}</select>
          <button data-act="nextTrack">다음 곡</button></div>
        ${rows}
        <textarea class="dexport hidden" readonly></textarea>
      </div>`;
    root.appendChild(this.el);
    this.fpsEl = this.el.querySelector('.fps');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('change', (e) => {
      if (e.target.dataset.act === 'music' && this.music) this.music.play(e.target.value);
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
      if (b.dataset.act === 'toggle') this.setOpen(this.el.classList.contains('collapsed'));
      if (b.dataset.act === 'setLevel') this.setLevel(Number(this.el.querySelector('.dlevel').value));
      if (b.dataset.act === 'copy') this.copy();
      if (b.dataset.act === 'spawn') this.spawn();
      if (b.dataset.act === 'nextTrack' && this.music) this.music.next();
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

  // drop an item of the chosen grade in front of the player (dungeon only)
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

  grant(grade) {
    const g = this.game;
    if (g.mode !== 'dungeon') return;
    const p = g.player.pos, h = g.combat.inputDir;
    const cfg = this.config.items;
    const opts = { id: g.allocItemId(), level: Math.max(1, g.dungeon.floor), quality: Math.floor(Math.random() * 3) };
    if (grade === 'set') opts.set = 'abyss'; else opts.grade = grade;
    import('../game/items/ItemFactory.js').then(({ createItem }) => {
      g.loot.dropAt({ x: p.x + h.x * 140, y: p.y + h.y * 140 }, { item: createItem(cfg, Math.random, opts) });
    });
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
