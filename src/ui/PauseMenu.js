// Pause overlay: resume, restart (with confirmation), screen-shake, sound and music toggles, language.
import { t, setLang, getLang } from '../i18n/index.js';
import { langSwitch } from './TitleMenu.js';

export class PauseMenu {
  constructor(root, { settings, onChange, onRestart, onOpenChange, onSkillLayout = () => {} }) {
    this.onSkillLayout = onSkillLayout;
    this.settings = settings;
    this.onChange = onChange;
    this.onRestart = onRestart;
    this.onOpenChange = onOpenChange;
    this.isOpen = false;

    this.el = document.createElement('div');
    this.el.className = 'overlay pause-menu interactive hidden';
    this.el.innerHTML = `
      <div class="panel main-view">
        <h2 data-i18n="pause.title">${t('pause.title')}</h2>
        <button data-act="resume" class="primary" data-i18n="pause.resume">${t('pause.resume')}</button>
        <button data-act="restart" data-i18n="pause.giveUp">${t('pause.giveUp')}</button>
        <button data-act="shake" class="toggle"></button>
        <button data-act="sound" class="toggle"></button>
        <button data-act="music" class="toggle"></button>
        <button data-act="layout" data-i18n="pause.skillLayout">${t('pause.skillLayout')}</button>
        <div class="pm-lang"></div>
      </div>
      <div class="panel confirm-view hidden">
        <h2 data-i18n="pause.confirm">${t('pause.confirm')}</h2>
        <p data-i18n="pause.confirmNote">${t('pause.confirmNote')}</p>
        <div class="row">
          <button data-act="confirm-yes" class="danger" data-i18n="yes">${t('yes')}</button>
          <button data-act="confirm-no" class="primary" data-i18n="no">${t('no')}</button>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.mainView = this.el.querySelector('.main-view');
    this.confirmView = this.el.querySelector('.confirm-view');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn && btn.dataset.act === 'lang') { setLang(btn.dataset.lang); return; } // main.js relabels everything
      if (btn) this.act(btn.dataset.act);
    });

    this.renderToggles();
  }

  renderToggles() {
    const row = (k, key) => { this.el.querySelector(`[data-act="${k}"]`).textContent = t('pause.toggle', { name: t(key), state: t(this.settings[k] ? 'on' : 'off') }); };
    row('shake', 'pause.shake');
    row('sound', 'pause.sound');
    row('music', 'pause.music');
    const lang = this.el.querySelector('.pm-lang');
    if (lang.dataset.lang !== getLang()) { lang.dataset.lang = getLang(); lang.innerHTML = langSwitch('pm-switch'); }
  }

  act(a) {
    if (a === 'resume') this.close();
    else if (a === 'restart') { this.mainView.classList.add('hidden'); this.confirmView.classList.remove('hidden'); }
    else if (a === 'confirm-no') { this.confirmView.classList.add('hidden'); this.mainView.classList.remove('hidden'); }
    else if (a === 'confirm-yes') { this.onRestart(); this.close(); }
    else if (a === 'layout') { this.close(); this.onSkillLayout(); }
    else if (a === 'shake' || a === 'sound' || a === 'music') {
      this.settings[a] = !this.settings[a];
      this.renderToggles();
      this.onChange(this.settings);
    }
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.confirmView.classList.add('hidden');
    this.mainView.classList.remove('hidden');
    this.el.classList.remove('hidden');
    this.onOpenChange();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.add('hidden');
    this.onOpenChange();
  }
}
