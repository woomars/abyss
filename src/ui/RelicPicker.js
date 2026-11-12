import { relicIcon } from './relicIcons.js';

// Chest scene: three cards rise from the chest; tap one to keep it, or pay gold to draw three new
// ones. Cards ignore taps for a moment after appearing so the swipe that walked into the chest
// cannot pick one by accident.
export class RelicPicker {
  constructor(root, { onPick, onReroll, pickDelay = () => 0.6 }) {
    this.onPick = onPick;
    this.onReroll = onReroll;
    this.pickDelay = pickDelay;
    this.isOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'overlay relic-picker interactive hidden';
    this.el.innerHTML = `
      <div class="rp-wrap">
        <div class="rp-room"></div>
        <h2 class="rp-title">보물을 하나 고르세요</h2>
        <div class="rp-cards"></div>
        <div class="rp-bottom">
          <span class="rp-hint">카드를 눌러 가져갑니다</span>
          <button class="rp-reroll">다시 뽑기 <span class="gold-icon">◆</span> <b class="rp-cost">0</b></button>
          <span class="rp-gold">보유 <span class="gold-icon">◆</span> <b>0</b></span>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.cards = this.el.querySelector('.rp-cards');
    this.rerollBtn = this.el.querySelector('.rp-reroll');
    this.rerollBtn.addEventListener('click', () => {
      if (this.ready && !this.chosen && !this.rerollBtn.disabled) this.onReroll();
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.cards.addEventListener('click', (e) => {
      const card = e.target.closest('.rp-card');
      if (!card || !this.ready || this.chosen) return;
      this.choose(Number(card.dataset.i));
    });
  }

  // cost / gold: price of a redraw and the gold the player has
  show(offers, { cost = 0, gold = 0, title = '', found = 0 } = {}) {
    const room = this.el.querySelector('.rp-room');
    room.innerHTML = title ? `<b>${title}</b>${found ? ` · 골드 +${found}` : ''}` : '';
    room.classList.toggle('hidden', !title);
    this.el.classList.toggle('static', !!title);
    this.isOpen = true;
    this.ready = false;
    this.chosen = false;
    this.rerollBtn.disabled = gold < cost;
    this.el.querySelector('.rp-cost').textContent = String(cost);
    this.el.querySelector('.rp-gold b').textContent = String(gold);
    this.cards.innerHTML = offers.map((o, i) => `
      <button class="rp-card r-${o.rarity}${o.tier ? ` t-${o.tier}` : ''}" data-i="${i}" style="--rc:${o.color};--tc:${o.tierColor || o.color};--d:${i * 0.12}s">
        <span class="rp-rarity">${o.rarityLabel}${o.tierLabel ? ` · <em>${o.tierLabel}</em>` : ''}</span>
        <span class="rp-icon">${relicIcon(o.icon, 34)}</span>
        <b class="rp-name">${o.name}</b>
        <span class="rp-desc">${o.desc}</span>
        ${o.owned ? `<span class="rp-owned">보유 ${o.owned}</span>` : ''}
      </button>`).join('');
    this.el.classList.remove('hidden', 'ready');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.ready = true; this.el.classList.add('ready'); }, this.pickDelay() * 1000);
  }

  choose(i) {
    this.chosen = true;
    this.cards.querySelectorAll('.rp-card').forEach((c, k) => c.classList.add(k === i ? 'picked' : 'dropped'));
    setTimeout(() => { this.hide(); this.onPick(i); }, 420);
  }

  hide() {
    clearTimeout(this.timer);
    this.isOpen = false;
    this.el.classList.add('hidden');
  }
}
