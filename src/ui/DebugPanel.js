// ?debug=1 — FPS and a few helpers: go to a room (floor 100 too), set the level, get an item (worn at once),
// set the special-attack growth cards, play the ending; and the hero's numbers (with the gear's share).
import { heroSheet } from './debugSheet.js';
import { owedPicks, picksTaken } from '../game/SkillGrowth.js';

// growth cards by name (debug is Korean only)
const CARD = { spinRadius: '회전 베기 반경', spinCooldown: '회전 베기 쿨타임', rushDistance: '점프 거리', rushCooldown: '점프 쿨타임', waveRange: '질풍 베기 사거리·기절', waveCooldown: '질풍 베기 쿨타임' };
export class DebugPanel {
  constructor(root, { config, game, onLayout, onFloor = null, onOpenChange = () => {}, onGear = () => {}, onEnding = () => {} }) {
    this.onEnding = onEnding; // debug: play the ending
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
          Array.from({ length: 21 }, (_, i) => `<option value="${i + 1}">지하 ${i + 1}층</option>`).join('')}<option value="100">지하 100층 (시조)</option></select></div>
        <div class="dbtns">장비 지급 <select data-act="grant"><option value="">고르기</option><option value="common">일반</option><option value="uncommon">고급</option><option value="rare">희귀</option><option value="epic">영웅</option><option value="legendary">전설</option><option value="set">세트</option></select></div>
        <div class="dbtns">내 레벨 <input type="number" class="dlevel" min="1" step="1" value="1" inputmode="numeric" style="width:56px;user-select:text;-webkit-user-select:text"><button data-act="setLevel">적용</button><span class="dlevel-now"></span></div>
        <div class="dbtns"><button data-act="ending">엔딩 보기</button></div>
        <div class="dsec">특수기술 성장 <span class="dups-note"></span></div>
        <div class="dups"></div>
        <div class="dsec">내 수치 <span class="dnote">(초록 = 장비가 더한 몫)</span></div>
        <div class="dsheet"></div>
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
      if (b.dataset.act === 'ending') { this.setOpen(false); this.onEnding(); }
      if (b.dataset.act === 'setLevel') this.setLevel(Number(this.el.querySelector('.dlevel').value));
      if (b.dataset.act === 'up') this.setUp(b.dataset.card, Number(b.dataset.v));
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
    if (open) this.refresh();
    this.onLayout();
    this.onOpenChange(open);
  }

  // debug: set the family level (stats and max hp follow; growth cards owed by the level show at the next cleared room)
  setLevel(n) {
    const g = this.game, max = (g.config.progress && g.config.progress.maxLevel) || Infinity;
    const lv = Math.max(1, Math.min(max, Math.round(n) || 1));
    g.vault.progress.level = lv;
    g.vault.progress.xp = 0;
    g.refreshBonus();
    g.applyMaxHp();
    g.player.hp = g.player.maxHp;
    if (g.vault.state !== 'idle' || g.forge) g.saveVault();
    this.el.querySelector('.dlevel-now').textContent = ` → Lv ${lv}`;
    this.refresh();
  }

  // debug: a growth card's count (the skill grows at once; the level's owed cards follow what is left)
  setUp(card, dv) {
    const g = this.game, ups = g.vault.skillUps || (g.vault.skillUps = {});
    ups[card] = Math.max(0, (ups[card] || 0) + dv);
    if (!ups[card]) delete ups[card];
    g.refreshBonus();
    if (g.vault.state !== 'idle' || g.forge) g.saveVault();
    this.onGear();
    this.refresh();
  }

  // the growth cards and the hero's numbers, as they stand
  refresh() {
    const g = this.game, growth = g.config.skills.growth, ups = g.vault.skillUps || {};
    const lv = g.vault.progress.level;
    this.el.querySelector('.dlevel').value = lv;
    this.el.querySelector('.dups-note').textContent = `(Lv ${lv}: 받을 카드 ${Math.floor(lv / growth.every)} · 고름 ${picksTaken(ups, growth)} · 남음 ${owedPicks(growth, lv, ups)})`;
    this.el.querySelector('.dups').innerHTML = growth.cards.map((c) => `<div class="dup"><span>${CARD[c.id] || c.id}</span><button data-act="up" data-card="${c.id}" data-v="-1">−</button><b>${ups[c.id] || 0}</b><button data-act="up" data-card="${c.id}" data-v="1">+</button></div>`).join('');
    const sh = heroSheet(g);
    const rows = sh.sections.map((s) => `<div class="dsh-t">${s.title}</div>${s.rows.map((r) => `<div class="dsh-r"><span>${r.label}</span><b>${r.value}</b><i class="${r.gear ? (r.good ? 'up' : 'down') : ''}">${r.gear}</i></div>`).join('')}`).join('');
    const gear = [...sh.sets, ...sh.gearFx];
    const boss = sh.boss ? `<div class="dsh-t">이 방의 보스</div>
      <div class="dsh-r"><span>체력</span><b>${sh.boss.hp} / ${sh.boss.maxHp}</b><i></i></div>
      ${sh.boss.guard ? `<div class="dsh-r"><span>방어막</span><b>${sh.boss.guard}</b><i></i></div>` : ''}
      <div class="dsh-r"><span>평타로 (평균 1타)</span><b>${sh.boss.hits}타</b><i></i></div>
      ${sh.boss.mirror != null ? `<div class="dsh-r"><span>거울의 평타 → 나</span><b>${sh.boss.mirror}</b><i></i></div>` : ''}` : '';
    this.el.querySelector('.dsheet').innerHTML = `${rows}<div class="dsh-t">장비 효과</div><div class="dsh-fx">${gear.length ? gear.join('<br>') : '없음'}</div>${boss}`;
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
      this.refresh();
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
