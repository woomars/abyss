import { itemCell, itemLabel } from './itemView.js';
import { describeItem } from '../game/items/itemStats.js';
import { tokenCandidates, canTakeToken } from '../game/items/Forge.js';
import { floorLabel } from '../core/floorLabel.js';

const WHERE = { equipped: '착용 중', stash: '보관함', pocket: '주머니' };

// 유산의 증표: worn / stash / pocket items turn on a horizontal carousel; the one in front can take the
// token unless it already carries one (golden halo, button off). Swipe, arrows or tap a side card.
export class LegacyScene {
  constructor(root, { game, onClose, toLocal = (x, y) => ({ x, y }) }) {
    this.game = game;
    this.toLocal = toLocal; // screen -> stage coordinates (the stage may be rotated)
    this.onClose = onClose;
    this.index = 0;
    this.el = document.createElement('div');
    this.el.className = 'overlay legacy-scene interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.down = this.toLocal(e.clientX, e.clientY); });
    this.el.addEventListener('pointerup', (e) => {
      if (!this.down) return;
      const up = this.toLocal(e.clientX, e.clientY), d = up.x - this.down.x;
      this.down = null;
      if (Math.abs(d) > 40 && e.target.closest('.lg-ring')) { this.swiped = true; this.turn(d < 0 ? 1 : -1); }
    });
    this.el.addEventListener('click', (e) => {
      if (this.swiped) { this.swiped = false; return; }
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled) { this.act(b.dataset.act, b.dataset); return; }
      const card = e.target.closest('.lg-card');
      if (card) { this.index = Number(card.dataset.i); this.layout(); }
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  show({ floor = null } = {}) {
    this.floor = floor;
    this.list = tokenCandidates(this.game.forgeCtx());
    const first = this.list.findIndex((c) => canTakeToken(c.item));
    this.index = first >= 0 ? first : 0;
    this.el.classList.remove('hidden');
    this.render();
  }

  hide() { this.el.classList.add('hidden'); }

  close() { this.hide(); this.onClose(); }

  render() {
    const cfg = this.game.config.items, tokens = this.game.vault.tokens;
    const cards = this.list.map((c, i) => {
      const d = describeItem(c.item, cfg), sealed = !canTakeToken(c.item);
      return `<div class="lg-card${sealed ? ' sealed' : ''}" data-i="${i}" style="--gc:${d.gradeColor}">
        <div class="lg-where">${WHERE[c.where]}</div>
        ${itemCell(c.item, cfg, { size: 34 })}
        <div class="lg-name" style="color:${d.gradeColor}">${d.name}</div>
        <div class="lg-sub">${d.gradeLabel}${d.qualityLabel ? ' · ' + d.qualityLabel : ''} ${d.partLabel}</div>
        <div class="lg-lines">${d.lines.slice(0, 3).map((l) => `<div>${l}</div>`).join('')}</div>
        ${sealed ? '<div class="lg-sealed">이미 증표가 새겨짐</div>' : ''}
      </div>`;
    }).join('');
    this.el.innerHTML = `
      <div class="lg-wrap">
        <div class="lg-title">유산의 증표 <span>×${tokens}</span></div>
        <div class="lg-sub2">${this.floor ? `${floorLabel(this.floor)}에 닿았습니다. ` : ''}증표를 새긴 장비는 분해하지 않는 한 영원히 대를 잇습니다.</div>
        ${this.list.length ? `
          <div class="lg-stage">
            <button class="lg-arrow" data-act="prev">‹</button>
            <div class="lg-ring">${cards}</div>
            <button class="lg-arrow" data-act="next">›</button>
          </div>
          <div class="lg-pick"></div>` : '<div class="lg-empty">증표를 새길 장비가 없습니다. 나중에 대장간에서 쓸 수 있습니다.</div>'}
        <div class="lg-buttons">
          <button class="tm-btn small" data-act="later">${tokens > 0 && this.list.length ? '나중에' : '닫기'}</button>
          ${this.list.length ? '<button class="tm-btn primary" data-act="apply">이 장비에 증표 새기기</button>' : ''}
        </div>
      </div>`;
    this.layout();
  }

  // place the cards around the front one (a turning ring seen from the front)
  layout() {
    const cards = this.el.querySelectorAll('.lg-card');
    const n = cards.length;
    cards.forEach((card, i) => {
      let d = i - this.index;
      if (n > 4) { if (d > n / 2) d -= n; if (d < -n / 2) d += n; } // wrap around the ring
      const a = Math.abs(d);
      card.style.transform = `translateX(${d * 46}%) translateZ(${-a * 90}px) rotateY(${-d * 32}deg) scale(${1 - Math.min(a, 3) * 0.12})`;
      card.style.opacity = a > 2.5 ? '0' : String(1 - a * 0.25);
      card.style.zIndex = String(100 - a);
      card.classList.toggle('front', d === 0);
    });
    const c = this.list[this.index];
    const btn = this.el.querySelector('[data-act="apply"]');
    if (btn) btn.disabled = !c || !canTakeToken(c.item) || this.game.vault.tokens <= 0;
    const pick = this.el.querySelector('.lg-pick');
    if (pick && c) pick.textContent = canTakeToken(c.item) ? itemLabel(c.item, this.game.config.items) : '이 장비에는 이미 증표가 있습니다';
  }

  turn(step) {
    if (!this.list.length) return;
    this.index = (this.index + step + this.list.length) % this.list.length;
    this.layout();
  }

  act(a) {
    if (a === 'prev') this.turn(-1);
    else if (a === 'next') this.turn(1);
    else if (a === 'later') this.close();
    else if (a === 'apply') {
      const c = this.list[this.index];
      if (!c || !this.game.useToken(c.item.id)) return;
      const front = this.el.querySelector('.lg-card.front');
      if (front) front.classList.add('blessed');
      setTimeout(() => {
        if (this.game.vault.tokens > 0) this.render();
        else this.close();
      }, 900);
    }
  }
}
