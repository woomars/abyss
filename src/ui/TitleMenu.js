// Title inside the (landscape) stage: 이어하기 / 새로하기, the save-slot list, and naming a new family.
// store: VaultStore; names: config.names; onContinue(slot); onHall(slot); onNew(slot, family, given)
import { floorLabel } from '../core/floorLabel.js';
import { t, getLang, setLang, LANGS, LANG_NAMES, fullName, trPerson, nameList, formatDate } from '../i18n/index.js';
import { LANG_FLAGS } from './langFlags.js';


const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const when = (ms) => formatDate(ms);
const whereText = (s) => (s.state === 'rest' ? t('where.rest', { floor: floorLabel(s.floor) }) : s.state === 'run' ? t('where.run') : t('where.idle'));

// start screen: three small flag buttons (Korea · USA · Japan), named in their own language
function flagSwitch() {
  const cur = getLang();
  return `<div class="lang-flags tm-lang" role="group" aria-label="${t('lang.label')}">${LANGS.map((l) =>
    `<button class="lang-flag${l === cur ? ' on' : ''}" data-act="lang" data-lang="${l}" lang="${l}" aria-label="${LANG_NAMES[l]}" title="${LANG_NAMES[l]}" aria-pressed="${l === cur}">${LANG_FLAGS[l]}</button>`).join('')}</div>`;
}

// options (pause menu): language names as text (한국어 · English · 日本語), each in its own language
export function langSwitch(cls = '') {
  const cur = getLang();
  return `<div class="lang-switch ${cls}" role="group" aria-label="${t('lang.label')}">${LANGS.map((l) =>
    `<button class="lang-btn${l === cur ? ' on' : ''}" data-act="lang" data-lang="${l}" lang="${l}" aria-pressed="${l === cur}">${LANG_NAMES[l]}</button>`).join('')}</div>`;
}

export class TitleMenu {
  constructor(root, { store, names, rng = Math.random, onContinue, onHall = () => {}, onNew }) {
    this.onHall = onHall;
    this.store = store;
    this.names = names;
    this.rng = rng;
    this.onContinue = onContinue;
    this.onNew = onNew;
    this.el = document.createElement('div');
    this.el.className = 'overlay title-menu interactive';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act, b.dataset);
    });
    this.showMain();
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  hide() { this.el.classList.add('hidden'); }
  open() { this.el.classList.remove('hidden'); this.showMain(); }

  pickName(kind) {
    const list = nameList(this.names, kind);
    return list[Math.floor(this.rng() * list.length) % list.length];
  }

  // the language changed: draw the screen again (the switch lives on the main view)
  relabel() {
    if (!this.isOpen) return;
    if (this.view === 'slots') this.showSlots(this.mode);
    else if (this.view === 'family') this.showFamily(this.slot);
    else if (this.view === 'main') this.showMain();
  }

  showMain() {
    this.view = 'main';
    const any = this.store.list().some((r) => r.summary);
    this.el.innerHTML = `
      <div class="tm-main">
        <div class="brand">${t('app.title')}</div>
        <div class="brand-sub">ABYSS</div>
        <div class="tagline">${t('title.tagline')}</div>
        <div class="blade"></div>
        <div class="tm-buttons">
          <button class="tm-btn primary" data-act="continue" ${any ? '' : 'disabled'}>${t('title.continue')}</button>
          <button class="tm-btn" data-act="new">${t('title.new')}</button>
        </div>
      </div>
      ${flagSwitch()}`;
  }

  showSlots(mode) {
    this.mode = mode; // continue | new
    this.view = 'slots';
    const rows = this.store.list().map(({ slot, summary: s }) => {
      if (!s) {
        return `<button class="tm-slot empty" data-act="slot" data-slot="${slot}" ${mode === 'continue' ? 'disabled' : ''}>
          <span class="tm-no">${slot}</span><span class="tm-empty">${t('title.emptySlot')}</span></button>`;
      }
      const where = whereText(s);
      return `<button class="tm-slot" data-act="slot" data-slot="${slot}">
        <span class="tm-no">${slot}</span>
        <span class="tm-who"><b>${esc(fullName(s.family, s.given))}</b><small>${t('gen', { n: s.generation })} · Lv ${s.level}</small></span>
        <span class="tm-when"><small>${where}</small><small>${when(s.savedAt)}</small></span>
      </button>`;
    }).join('');
    this.el.innerHTML = `
      <div class="tm-panel">
        <h2>${mode === 'continue' ? t('title.continue') : t('title.pickSlot')}</h2>
        <div class="tm-slots">${rows}</div>
        <div class="tm-row"><button class="tm-btn small" data-act="back">${t('back')}</button></div>
      </div>`;
  }

  // 이어하기 -> a family: go down into the dungeon, or visit the hall of ancestors
  showFamily(slot) {
    const v = this.store.load(slot);
    if (!v) { this.showSlots('continue'); return; }
    this.slot = slot;
    this.view = 'family';
    const s = v.summary(), fallen = v.lineage.history.length;
    const where = whereText(s);
    this.el.innerHTML = `
      <div class="tm-panel tm-family">
        <h2>${t('title.house', { family: esc(trPerson(s.family, 'family')) })}</h2>
        <p><b>${t('gen', { n: s.generation })} ${esc(fullName(s.family, s.given))}</b> · Lv ${s.level} · ${where}</p>
        <p class="dim">${fallen ? t('title.fallen', { n: fallen }) : t('title.noFallen')}</p>
        <div class="tm-row">
          <button class="tm-btn primary" data-act="dungeon">${t('title.dungeon')}</button>
          <button class="tm-btn" data-act="hall">${t('title.hall')}</button>
        </div>
        <div class="tm-row"><button class="tm-btn small" data-act="continue">${t('back')}</button></div>
      </div>`;
  }

  showConfirm(slot) {
    this.view = 'confirm';
    this.el.innerHTML = `
      <div class="tm-panel">
        <h2>${t('title.overwrite', { n: slot })}</h2>
        <p>${t('title.overwriteNote')}</p>
        <div class="tm-row"><button class="tm-btn danger" data-act="overwrite" data-slot="${slot}">${t('title.overwriteYes')}</button><button class="tm-btn" data-act="new">${t('no')}</button></div>
      </div>`;
  }

  showName(slot) {
    this.slot = slot;
    this.view = 'name';
    const max = getLang() === 'en' ? 14 : 8; // English names run longer
    this.el.innerHTML = `
      <div class="tm-panel">
        <h2>${t('title.firstKnight')}</h2>
        <p>${t('title.nameNote')}</p>
        <div class="tm-name">
          <label>${t('title.familyName')} <input class="tm-family" maxlength="${max}" value="${esc(this.pickName('family'))}"></label>
          <button class="tm-btn small" data-act="rollFamily">${t('title.random')}</button>
        </div>
        <div class="tm-name">
          <label>${t('title.givenName')} <input class="tm-given" maxlength="${max}" value="${esc(this.pickName('given'))}"></label>
          <button class="tm-btn small" data-act="rollGiven">${t('title.random')}</button>
        </div>
        <div class="tm-row"><button class="tm-btn small" data-act="new">${t('back')}</button><button class="tm-btn primary" data-act="begin">${t('title.begin')}</button></div>
      </div>`;
  }

  act(a, data) {
    if (a === 'lang') { setLang(data.lang); return; } // main.js re-renders every open screen
    if (a === 'continue') this.showSlots('continue');
    else if (a === 'new') this.showSlots('new');
    else if (a === 'back') this.showMain();
    else if (a === 'slot') {
      const slot = Number(data.slot);
      const filled = !!this.store.load(slot);
      if (this.mode === 'continue') { if (filled) this.showFamily(slot); }
      else if (filled) this.showConfirm(slot);
      else this.showName(slot);
    } else if (a === 'dungeon') { this.hide(); this.onContinue(this.slot); }
    else if (a === 'hall') this.onHall(this.slot);
    else if (a === 'overwrite') this.showName(Number(data.slot));
    else if (a === 'rollFamily') this.el.querySelector('.tm-family').value = this.pickName('family');
    else if (a === 'rollGiven') this.el.querySelector('.tm-given').value = this.pickName('given');
    else if (a === 'begin') {
      const family = this.el.querySelector('.tm-family').value.trim() || this.pickName('family');
      const given = this.el.querySelector('.tm-given').value.trim() || this.pickName('given');
      this.hide();
      this.onNew(this.slot, family, given);
    }
  }
}
