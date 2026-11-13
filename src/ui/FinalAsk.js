// Floor 100 lost: the founder asks the fallen hero whether to give up or rise again.
// 다시 도전 -> the founder's room from the start; 포기 -> a death like any other.
import { t, fullName } from '../i18n/index.js';

export function founderTitle(f) {
  if (!f) return '';
  const name = fullName(f.family, f.given);
  return f.shadow ? t('final.shadowName', { name }) : t('final.bossName', { name });
}

export class FinalAsk {
  constructor(root, { onRetry, onGiveUp }) {
    this.el = document.createElement('div');
    this.el.className = 'overlay final-ask interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.hide();
      if (b.dataset.act === 'retry') onRetry(); else onGiveUp();
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  show(ask) { this.ask = ask; this.render(); this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }
  relabel() { if (this.isOpen) this.render(); }

  render() {
    this.el.innerHTML = `
      <div class="fa-panel">
        <div class="fa-who">${founderTitle(this.ask.founder)}</div>
        <p class="fa-line">${t('final.ask').replace(/\n/g, '<br>')}</p>
        <div class="fa-buttons">
          <button class="tm-btn" data-act="giveUp">${t('final.giveUp')}</button>
          <button class="tm-btn primary" data-act="retry">${t('final.retry')}</button>
        </div>
        <p class="fa-note">${t('final.giveUpNote')}</p>
      </div>`;
  }
}
