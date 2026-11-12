import { itemCell, itemLabel } from './itemView.js';

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

  text(msg) {
    const t = document.createElement('div');
    t.className = 'loot-toast warn';
    t.textContent = msg;
    this.el.prepend(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2200);
  }
}
