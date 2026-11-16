// Pause overlay: resume, restart (with confirmation), screen-shake, sound and music toggles, language.
import { t, setLang, getLang } from '../i18n/index.js';
import { langSwitch } from './TitleMenu.js';

export class PauseMenu {
  // onDebug: given only when the debug panel exists (not with ?debug=0) — then a [디버그] button
  constructor(root, { settings, onChange, onRestart, onOpenChange, onDebug = null }) {
    this.onDebug = onDebug;
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
        <div class="pm-cols">
          <div class="pm-col">
            <button data-act="resume" class="primary" data-i18n="pause.resume">${t('pause.resume')}</button>
            <button data-act="shake" class="toggle"></button>
            <button data-act="sound" class="toggle"></button>
            <button data-act="music" class="toggle"></button>
            <button data-act="sort" class="toggle"></button>
          </div>
          <div class="pm-col">
            <div class="pm-lang"></div>
            ${onDebug ? `<button data-act="debug" data-i18n="pause.debug">${t('pause.debug')}</button>` : ''}
            <span class="pm-gap"></span>
            <button data-act="restart" data-i18n="pause.giveUp">${t('pause.giveUp')}</button>
          </div>
        </div>
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
    this.el.querySelector('[data-act="sort"]').textContent = t('pause.toggle', { name: t('pause.sort'), state: t(this.settings.sortMode === 'type' ? 'pause.sortType' : 'pause.sortGrade') });
    const lang = this.el.querySelector('.pm-lang');
    if (lang.dataset.lang !== getLang()) { lang.dataset.lang = getLang(); lang.innerHTML = langSwitch('pm-switch'); }
  }

  act(a) {
    if (a === 'resume') this.close();
    else if (a === 'restart') { this.mainView.classList.add('hidden'); this.confirmView.classList.remove('hidden'); }
    else if (a === 'confirm-no') { this.confirmView.classList.add('hidden'); this.mainView.classList.remove('hidden'); }
    else if (a === 'confirm-yes') { this.onRestart(); this.close(); }
    else if (a === 'debug' && this.onDebug) { this.close(); this.onDebug(); }
    else if (a === 'sort') { // pocket/stash order: grade first <-> part first
      this.settings.sortMode = this.settings.sortMode === 'type' ? 'grade' : 'type';
      this.renderToggles();
      this.onChange(this.settings);
    } else if (a === 'shake' || a === 'sound' || a === 'music') {
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
