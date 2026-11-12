import { itemCell, itemLabel } from './itemView.js';
import { relicIcon } from './relicIcons.js';

// Small stacked notices under the top HUD when an item is picked up.
export class LootToast {
  constructor(root, cfg) {
    this.cfg = cfg; // config.items
    this.el = document.createElement('div');
    this.el.className = 'loot-toasts';
    root.appendChild(this.el);
  }

  show(item) {
    const t = document.createElement('div');
    t.className = `loot-toast g-${item.grade}`;
    t.innerHTML = `${itemCell(item, this.cfg, { size: 14 })}<span style="color:${this.cfg.grades[item.grade].color}">${itemLabel(item, this.cfg)}</span>`;
    this.el.prepend(t);
    while (this.el.children.length > 3) this.el.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2200);
  }

  // a medal earned: tier-coloured badge, and a note when this hero is the first of his line to earn it
  medal(m, cfg, first) {
    const t = document.createElement('div'), c = cfg.tiers[m.tier].color;
    t.className = 'loot-toast medal';
    t.style.setProperty('--mc', c);
    t.innerHTML = `<span class="hl-badge" style="--mc:${c};width:18px;height:18px">${relicIcon(m.icon, 11)}</span><span style="color:${c}">메달 · ${m.name}</span>${first ? '<small>가문 최초</small>' : ''}`;
    this.el.prepend(t);
    while (this.el.children.length > 3) this.el.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  }

  text(msg) {
    const t = document.createElement('div');
    t.className = 'loot-toast warn';
    t.textContent = msg;
    this.el.prepend(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2200);
  }
}
