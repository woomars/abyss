import { floorLabel } from '../core/floorLabel.js';
import { t, fullName, trItemName } from '../i18n/index.js';


// Game over overlay: shown when the player's HP reaches 0.
export class GameOver {
  constructor(root, { onRetry }) {
    this.el = document.createElement('div');
    this.el.className = 'overlay game-over interactive hidden';
    this.el.innerHTML = `
      <div class="panel">
        <h2 class="go-title">GAME OVER</h2>
        <p class="go-sub" data-i18n="go.sub">${t('go.sub')}</p>
        <div class="go-stats">
          <div class="go-floor-box"><span data-i18n="go.floor">${t('go.floor')}</span><b class="go-floor">0</b></div>
          <div><span data-i18n="stat.kills">${t('stat.kills')}</span><b class="go-kills">0</b></div>
          <div><span data-i18n="stat.bestCombo">${t('stat.bestCombo')}</span><b class="go-combo">0</b></div>
        </div>
        <p class="go-best"></p>
        <div class="go-fate"></div>
        <button class="primary" data-act="retry">${t('go.retry')}</button>
      </div>`;
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.querySelector('[data-act="retry"]').addEventListener('click', () => { this.hide(); onRetry(); });
  }

  // floor 0 = practice arena (no floor stats)
  // the language changed while it is up: write it again
  relabel() { if (this.lastShow && !this.el.classList.contains('hidden')) this.show(this.lastShow); }

  show(args) {
    this.lastShow = args;
    this.render(args);
  }

  render({ kills, bestCombo, floor = 0, bestFloor = 0, isNew = false, unranked = false, fate = null }) {
    const fe = this.el.querySelector('.go-fate');
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    fe.innerHTML = fate ? `<div>${t('go.who', { name: esc(fullName(fate.record.family, fate.record.given)), gen: t('gen', { n: fate.record.generation }) })}</div>
      <div class="${fate.survived.length ? 'up' : 'dim'}">${fate.survived.length ? t('go.survived', { list: fate.survived.map((i) => esc(trItemName(i.name))).join(', ') }) : t('go.noSurvived')}</div>
      <div class="dim">${t('go.lost', { n: fate.lost.length })}</div>` : '';
    this.el.querySelector('[data-act="retry"]').textContent = fate ? t('go.carryOn') : t('go.retry');
    this.el.querySelector('.go-kills').textContent = String(kills);
    this.el.querySelector('.go-combo').textContent = String(bestCombo);
    this.el.querySelector('.go-floor').textContent = floorLabel(floor);
    this.el.querySelector('.go-floor-box').classList.toggle('hidden', !floor);
    const best = this.el.querySelector('.go-best');
    best.textContent = !floor ? ''
      : unranked ? t('go.unranked')
        : isNew ? t('go.newBest', { floor: floorLabel(bestFloor) }) : t('go.best', { floor: floorLabel(bestFloor) });
    best.classList.toggle('new', isNew);
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }
}
