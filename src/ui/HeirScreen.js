// "가문의 계승": the father's record and the son who takes up the sword. fate = Game.endRunByDeath() result.
import { floorLabel } from '../core/floorLabel.js';
import { relicIcon } from './relicIcons.js';
import { t, tr, trItemName, trPerson, fullName } from '../i18n/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class HeirScreen {
  constructor(root, { onContinue, medals = null }) {
    this.onContinue = onContinue;
    this.medals = medals; // config.medals
    this.el = document.createElement('div');
    this.el.className = 'overlay heir-screen interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="go"]')) { this.hide(); this.onContinue(); }
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  // the medals this life earned, and the bosses it slew
  medalLine(r) {
    const cfg = this.medals, ms = cfg ? (r.medals || []).map((id) => cfg.list.find((m) => m.id === id)).filter(Boolean) : [];
    const bosses = Object.values(r.bosses || {});
    const chips = ms.map((m) => `<span class="hl-chip"><span class="hl-badge" style="--mc:${cfg.tiers[m.tier].color};width:18px;height:18px">${relicIcon(m.icon, 10)}</span>${esc(tr(m.name))}</span>`).join('');
    const slain = bosses.length ? `<div class="hs-kept">${t('heir.slain', { list: bosses.map((b) => `<b>${esc(tr(b.name))}</b> ×${b.count}`).join(', ') })}</div>` : '';
    return (chips ? `<div class="hl-medals hs-medals">${chips}</div>` : '') + slain;
  }

  // the language changed while it is up: write it again (note and label are keys, see main.js)
  relabel() { if (this.isOpen && this.lastShow) this.show(...this.lastShow); }

  // note / label: i18n keys for the notice above and the button (label may be a function returning text)
  show(fate, { note = '', label = 'toForge' } = {}) {
    this.lastShow = [fate, { note, label }];
    const r = fate.record, h = fate.heir;
    const kept = fate.survived.length
      ? `<div class="hs-kept">${t('heir.kept', { list: fate.survived.map((i) => `<b>${esc(trItemName(i.name))}</b>`).join(', ') })}</div>`
      : `<div class="hs-kept dim">${t('heir.noKept')}</div>`;
    this.el.innerHTML = `
      <div class="hs-panel">
        ${note ? `<p class="hs-note">${esc(t(note))}</p>` : ''}
        <div class="hs-father">
          <div class="hs-label">${t('gen', { n: r.generation })}</div>
          <div class="hs-name">${esc(fullName(r.family, r.given))}</div>
          <div class="hs-fell">${t('heir.fell', { floor: floorLabel(r.floor) })}</div>
          <div class="hs-stats">
            <span>${t('stat.level')}<b>${r.level}</b></span><span>${t('stat.kills')}<b>${r.kills}</b></span><span>${t('stat.bestCombo')}<b>${r.bestCombo}</b></span><span>${t('stat.lost')}<b>${r.lost}</b></span>
          </div>
          ${kept}
          ${this.medalLine(r)}
        </div>
        <div class="hs-arrow">▼</div>
        <div class="hs-heir">${t('heir.son', { name: esc(trPerson(h.given, 'given')) })} <small>${t('gen', { n: h.generation })} ${esc(fullName(h.family, h.given))}</small></div>
        <button class="tm-btn primary" data-act="go">${typeof label === 'function' ? label() : t(label)}</button>
      </div>`;
    this.el.classList.remove('hidden');
  }
}
