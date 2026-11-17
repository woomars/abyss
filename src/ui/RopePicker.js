// Ariadne's rope (10.4): the floors the family's ropes reach, picked from the warp zone; or step back.
import { t } from '../i18n/index.js';
import { floorLabel } from '../core/floorLabel.js';

export class RopePicker {
  constructor(root, { onPick, onCancel }) {
    this.onPick = onPick;
    this.onCancel = onCancel;
    this.el = document.createElement('div');
    this.el.className = 'overlay rope-picker interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !this.ready) return; // a moment first: a tap still running into the zone must not pick
      this.hide();
      if (b.dataset.floor) this.onPick(Number(b.dataset.floor)); else this.onCancel();
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  show(floors) {
    this.floors = floors;
    this.el.innerHTML = `<div class="panel"><h2>${t('rope.title')}</h2><p>${t('rope.pick')}</p>
      <div class="rp-list">${floors.map((f) => `<button class="primary" data-floor="${f}">${floorLabel(f)}</button>`).join('')}</div>
      <button>${t('rope.cancel')}</button></div>`;
    this.el.classList.remove('hidden');
    this.ready = false;
    clearTimeout(this.readyT);
    this.readyT = setTimeout(() => { this.ready = true; }, 400);
  }

  hide() { this.el.classList.add('hidden'); }

  relabel() { if (this.isOpen) this.show(this.floors); }
}
