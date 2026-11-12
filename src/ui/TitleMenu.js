// Title inside the (landscape) stage: 이어하기 / 새로하기, the save-slot list, and naming a new family.
// store: VaultStore; names: config.names; onContinue(slot); onHall(slot); onNew(slot, family, given)
import { floorLabel } from '../core/floorLabel.js';


const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function when(ms) {
  if (!ms) return '';
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export class TitleMenu {
  constructor(root, { store, names, rng = Math.random, onContinue, onHall = () => {}, onNew }) {
    this.onHall = onHall;
    this.store = store;
    this.names = names;
    this.rng = rng;
    this.onContinue = onContinue;
    this.onNew = onNew;
    this.el = document.createElement('div');
    this.el.className = 'overlay title-menu interactive';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act, b.dataset);
    });
    this.showMain();
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  hide() { this.el.classList.add('hidden'); }
  open() { this.el.classList.remove('hidden'); this.showMain(); }

  pickName(kind) {
    const list = this.names[kind];
    return list[Math.floor(this.rng() * list.length) % list.length];
  }

  showMain() {
    const any = this.store.list().some((r) => r.summary);
    this.el.innerHTML = `
      <div class="tm-main">
        <div class="brand">심연의 기사</div>
        <div class="brand-sub">ABYSS</div>
        <div class="tagline">한 사람이 쓰러지면, 그 아들이 칼을 든다</div>
        <div class="blade"></div>
        <div class="tm-buttons">
          <button class="tm-btn primary" data-act="continue" ${any ? '' : 'disabled'}>이어하기</button>
          <button class="tm-btn" data-act="new">새로하기</button>
        </div>
      </div>`;
  }

  showSlots(mode) {
    this.mode = mode; // continue | new
    const rows = this.store.list().map(({ slot, summary: s }) => {
      if (!s) {
        return `<button class="tm-slot empty" data-act="slot" data-slot="${slot}" ${mode === 'continue' ? 'disabled' : ''}>
          <span class="tm-no">${slot}</span><span class="tm-empty">빈 저장 칸</span></button>`;
      }
      const where = s.state === 'rest' ? `${floorLabel(s.floor)} 대장간에서 쉬는 중` : s.state === 'run' ? '싸우던 중 중단됨' : '대장간에서 출발 준비';
      return `<button class="tm-slot" data-act="slot" data-slot="${slot}">
        <span class="tm-no">${slot}</span>
        <span class="tm-who"><b>${esc(s.family)} ${esc(s.given)}</b><small>${s.generation}대손 · Lv ${s.level}</small></span>
        <span class="tm-when"><small>${where}</small><small>${when(s.savedAt)}</small></span>
      </button>`;
    }).join('');
    this.el.innerHTML = `
      <div class="tm-panel">
        <h2>${mode === 'continue' ? '이어하기' : '새로하기 — 저장 칸 고르기'}</h2>
        <div class="tm-slots">${rows}</div>
        <div class="tm-row"><button class="tm-btn small" data-act="back">뒤로</button></div>
      </div>`;
  }

  // 이어하기 -> a family: go down into the dungeon, or visit the hall of ancestors
  showFamily(slot) {
    const v = this.store.load(slot);
    if (!v) { this.showSlots('continue'); return; }
    this.slot = slot;
    const s = v.summary(), fallen = v.lineage.history.length;
    const where = s.state === 'rest' ? `${floorLabel(s.floor)} 대장간에서 쉬는 중` : s.state === 'run' ? '싸우던 중 중단됨' : '대장간에서 출발 준비';
    this.el.innerHTML = `
      <div class="tm-panel tm-family">
        <h2>${esc(s.family)} 가문</h2>
        <p><b>${s.generation}대손 ${esc(s.family)} ${esc(s.given)}</b> · Lv ${s.level} · ${where}</p>
        <p class="dim">${fallen ? `앞서 쓰러진 선조 ${fallen}명` : '아직 쓰러진 선조가 없습니다'}</p>
        <div class="tm-row">
          <button class="tm-btn primary" data-act="dungeon">던전으로</button>
          <button class="tm-btn" data-act="hall">선조의 전당</button>
        </div>
        <div class="tm-row"><button class="tm-btn small" data-act="continue">뒤로</button></div>
      </div>`;
  }

  showConfirm(slot) {
    this.el.innerHTML = `
      <div class="tm-panel">
        <h2>${slot}번 칸을 덮어쓸까요?</h2>
        <p>그 가문의 기록, 보관함, 가루가 모두 사라집니다.</p>
        <div class="tm-row"><button class="tm-btn danger" data-act="overwrite" data-slot="${slot}">덮어쓰기</button><button class="tm-btn" data-act="new">아니오</button></div>
      </div>`;
  }

  showName(slot) {
    this.slot = slot;
    this.el.innerHTML = `
      <div class="tm-panel">
        <h2>새 가문의 첫 기사</h2>
        <p>성은 대대로 이어지고, 이름은 대마다 새로 붙습니다.</p>
        <div class="tm-name">
          <label>성 <input class="tm-family" maxlength="8" value="${esc(this.pickName('family'))}"></label>
          <button class="tm-btn small" data-act="rollFamily">무작위</button>
        </div>
        <div class="tm-name">
          <label>이름 <input class="tm-given" maxlength="8" value="${esc(this.pickName('given'))}"></label>
          <button class="tm-btn small" data-act="rollGiven">무작위</button>
        </div>
        <div class="tm-row"><button class="tm-btn small" data-act="new">뒤로</button><button class="tm-btn primary" data-act="begin">시작</button></div>
      </div>`;
  }

  act(a, data) {
    if (a === 'continue') this.showSlots('continue');
    else if (a === 'new') this.showSlots('new');
    else if (a === 'back') this.showMain();
    else if (a === 'slot') {
      const slot = Number(data.slot);
      const filled = !!this.store.load(slot);
      if (this.mode === 'continue') { if (filled) this.showFamily(slot); }
      else if (filled) this.showConfirm(slot);
      else this.showName(slot);
    } else if (a === 'dungeon') { this.hide(); this.onContinue(this.slot); }
    else if (a === 'hall') this.onHall(this.slot);
    else if (a === 'overwrite') this.showName(Number(data.slot));
    else if (a === 'rollFamily') this.el.querySelector('.tm-family').value = this.pickName('family');
    else if (a === 'rollGiven') this.el.querySelector('.tm-given').value = this.pickName('given');
    else if (a === 'begin') {
      const family = this.el.querySelector('.tm-family').value.trim() || this.pickName('family');
      const given = this.el.querySelector('.tm-given').value.trim() || this.pickName('given');
      this.hide();
      this.onNew(this.slot, family, given);
    }
  }
}
