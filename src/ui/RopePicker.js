// Ariadne's rope (10.4): where the hero is, and the family's rope floors on a wheel — turn it left or
// right to the floor wanted, then [이동]. It starts on the floor the hero is on, so a stray tap moves
// nowhere.
import { t, floorText } from '../i18n/index.js';

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
      if (!b || b.disabled) return;
      const a = b.dataset.act;
      if (a === 'prev' || a === 'next') { this.i = (this.i + (a === 'next' ? 1 : -1) + this.list.length) % this.list.length; this.render(); }
      else if (a === 'go') { this.hide(); this.onPick(this.list[this.i]); }
      else if (a === 'cancel') { this.hide(); this.onCancel(); }
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  // floors: the other rope floors; current: the floor the hero is on
  show(floors, current) {
    this.floors = floors;
    this.current = current;
    this.list = [...new Set([...floors, current])].sort((a, b) => a - b);
    this.i = this.list.indexOf(current);
    this.render();
    this.el.classList.remove('hidden');
  }

  render() {
    const f = this.list[this.i], here = f === this.current;
    this.el.innerHTML = `<div class="panel rp-panel"><h2>${t('rope.title')}</h2>
      <p>${t('rope.here')}: <b>${floorText(this.current)}</b></p>
      <div class="rp-wheel"><button data-act="prev" aria-label="◀">◀</button>
        <div class="rp-floor${here ? ' here' : ''}"><b>${floorText(f)}</b>${here ? `<small>${t('rope.here')}</small>` : ''}</div>
        <button data-act="next" aria-label="▶">▶</button></div>
      <p class="rp-dots">${this.list.map((x, k) => `<i class="${k === this.i ? 'on' : ''}${x === this.current ? ' cur' : ''}"></i>`).join('')}</p>
      <p>${t('rope.pick')}</p>
      <div class="row"><button data-act="cancel">${t('rope.cancel')}</button><button data-act="go" class="primary" ${here ? 'disabled' : ''}>${t('rope.go')}</button></div></div>`;
  }

  hide() { this.el.classList.add('hidden'); }

  relabel() { if (this.isOpen) this.render(); }
}
