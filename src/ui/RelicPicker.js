import { relicIcon } from './relicIcons.js';

// Treasure-room scene: three cards rise from the chest; tap one to keep it. Cards ignore taps for a
// moment after appearing so the swipe that walked into the chest cannot pick one by accident.
export class RelicPicker {
  constructor(root, { onPick, pickDelay = () => 0.6 }) {
    this.onPick = onPick;
    this.pickDelay = pickDelay;
    this.isOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'overlay relic-picker interactive hidden';
    this.el.innerHTML = `
      <div class="rp-wrap">
        <h2 class="rp-title">보물을 하나 고르세요</h2>
        <div class="rp-cards"></div>
        <p class="rp-hint">카드를 눌러 가져갑니다</p>
      </div>`;
    root.appendChild(this.el);
    this.cards = this.el.querySelector('.rp-cards');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.cards.addEventListener('click', (e) => {
      const card = e.target.closest('.rp-card');
      if (!card || !this.ready || this.chosen) return;
      this.choose(Number(card.dataset.i));
    });
  }

  show(offers) {
    this.isOpen = true;
    this.ready = false;
    this.chosen = false;
    this.cards.innerHTML = offers.map((o, i) => `
      <button class="rp-card r-${o.rarity}" data-i="${i}" style="--rc:${o.color};--d:${i * 0.12}s">
        <span class="rp-rarity">${o.rarityLabel}</span>
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
