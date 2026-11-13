import { relicIcon } from './relicIcons.js';
import { t, tr, relicDesc } from '../i18n/index.js';

// Chest scene: three cards rise from the chest; tap one to keep it, or pay gold to draw three new
// ones. Cards ignore taps for a moment after appearing so the swipe that walked into the chest
// cannot pick one by accident.
export class RelicPicker {
  constructor(root, { onPick, onReroll, pickDelay = () => 0.6, relics = () => null }) {
    this.relics = relics; // config.relics (to show card text in the current language)
    this.onPick = onPick;
    this.onReroll = onReroll;
    this.pickDelay = pickDelay;
    this.isOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'overlay relic-picker interactive hidden';
    this.el.innerHTML = `
      <div class="rp-wrap">
        <div class="rp-room"></div>
        <h2 class="rp-title" data-i18n="rp.title">${t('rp.title')}</h2>
        <div class="rp-cards"></div>
        <div class="rp-bottom">
          <span class="rp-hint" data-i18n="rp.hint">${t('rp.hint')}</span>
          <button class="rp-reroll"><span data-i18n="rp.reroll">${t('rp.reroll')}</span> <span class="gold-icon">◆</span> <b class="rp-cost">0</b></button>
          <span class="rp-gold"><span data-i18n="rp.have">${t('rp.have')}</span> <span class="gold-icon">◆</span> <b>0</b></span>
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
  // mode 'skill': special-attack growth cards (no redraw, no gold)
  show(offers, { cost = 0, gold = 0, title = '', found = 0, mode = '', level = 0 } = {}) {
    const room = this.el.querySelector('.rp-room');
    this.lastShow = [offers, { cost, gold, title, found, mode, level }];
    const skill = mode === 'skill';
    room.innerHTML = skill ? `<b>${t('sk.sub', { level })}</b>` : title ? `<b>${t(title)}</b>${found ? ` · ${t('banner.gold', { gold: found })}` : ''}` : '';
    room.classList.toggle('hidden', !title && !skill);
    this.el.classList.toggle('static', !!title || skill);
    this.el.classList.toggle('skill-mode', skill);
    this.el.querySelector('.rp-title').textContent = t(skill ? 'sk.title' : 'rp.title');
    this.isOpen = true;
    this.ready = false;
    this.chosen = false;
    this.rerollBtn.disabled = gold < cost;
    this.el.querySelector('.rp-cost').textContent = String(cost);
    this.el.querySelector('.rp-gold b').textContent = String(gold);
    this.cards.innerHTML = offers.map((o, i) => (o.skillCard ? `
      <button class="rp-card r-epic sk-card" data-i="${i}" style="--rc:${o.color};--tc:${o.color};--d:${i * 0.12}s">
        <span class="rp-rarity">${t('sk.card')}</span>
        <span class="rp-icon">${relicIcon(o.icon, 34)}</span>
        <b class="rp-name">${tr(o.name)}</b>
        <span class="rp-desc">${o.stun ? t('sk.rangeStun', { v: `${Math.round(o.value * 100)}%`, s: `${Math.round(o.stun * 100)}%` }) : t(`sk.${o.kind}`, { v: `${Math.round(o.value * 100)}%` })}</span>
        ${o.owned ? `<span class="rp-owned">${t('sk.owned', { n: o.owned })}</span>` : ''}
      </button>` : `
      <button class="rp-card r-${o.rarity}${o.tier ? ` t-${o.tier}` : ''}" data-i="${i}" style="--rc:${o.color};--tc:${o.tierColor || o.color};--d:${i * 0.12}s">
        <span class="rp-rarity">${tr(o.rarityLabel)}${o.tierLabel ? ` · <em>${tr(o.tierLabel)}</em>` : ''}</span>
        <span class="rp-icon">${relicIcon(o.icon, 34)}</span>
        <b class="rp-name">${tr(o.name)}</b>
        <span class="rp-desc">${relicDesc(o, this.relics())}</span>
        ${o.essence ? `<span class="rp-pass${o.inherit ? '' : ' life'}">${t(o.inherit ? 'rp.inherit' : 'rp.lifeOnly')}</span>` : ''}
        ${o.owned ? `<span class="rp-owned">${t(o.inherit ? 'rp.familyOwned' : 'rp.owned', { n: o.owned })}</span>` : ''}
      </button>`)).join('');
    this.el.classList.remove('hidden', 'ready');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.ready = true; this.el.classList.add('ready'); }, this.pickDelay() * 1000);
  }

  // the language changed while the cards are up: write the card text again (no new entrance)
  relabel() {
    if (!this.isOpen || this.chosen || !this.lastShow) return;
    const [offers, o] = this.lastShow;
    const ready = this.ready;
    this.show(offers, o);
    if (ready) { clearTimeout(this.timer); this.ready = true; this.el.classList.add('ready'); }
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
