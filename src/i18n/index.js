// Language: ko (the source), en, ja. Shared with the woomars hub through localStorage 'woomars.lang'.
// Order: ?lang= in the address (also saved) -> saved choice -> browser language -> en.
// UI strings: t(key, params). Data strings from src/data/*.json stay Korean in the json and in saves;
// tr(korean) shows them in the current language (falls back to the Korean when a word is missing).
import KO from './ko.js';
import EN from './en.js';
import JA from './ja.js';
import DATA_EN from './data-en.js';
import DATA_JA from './data-ja.js';

export const LANGS = ['ko', 'en', 'ja'];
export const LANG_NAMES = { ko: '한국어', en: 'English', ja: '日本語' };
export const STORAGE_KEY = 'woomars.lang';
const DICTS = { ko: KO, en: EN, ja: JA };
const DATA = { en: DATA_EN, ja: DATA_JA };
const LOCALES = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' };

let lang = 'ko';
const listeners = new Set();

// pure: which language to use
export function pickLang({ search = '', stored = null, languages = [] } = {}) {
  let q = null;
  try { q = new URLSearchParams(search).get('lang'); } catch (_) { /* ignore */ }
  if (LANGS.includes(q)) return { lang: q, fromQuery: true };
  if (LANGS.includes(stored)) return { lang: stored, fromQuery: false };
  const first = String((languages && languages[0]) || '').toLowerCase();
  return { lang: first.startsWith('ko') ? 'ko' : first.startsWith('ja') ? 'ja' : 'en', fromQuery: false };
}

function storage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (_) { return null; }
}

// <html lang>, the tab title and the home-screen install name (no manifest: iOS and Windows read these two metas;
// index.html carries the Korean name as the static default)
export const INSTALL_METAS = ['apple-mobile-web-app-title', 'application-name'];
function applyDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = t('app.title');
  if (typeof document.querySelector !== 'function') return;
  for (const name of INSTALL_METAS) {
    const m = document.querySelector(`meta[name="${name}"]`);
    if (m) m.setAttribute('content', t('app.title'));
  }
}

// browser start-up: decide before anything is drawn
export function initLang() {
  const st = storage();
  let stored = null;
  try { stored = st ? st.getItem(STORAGE_KEY) : null; } catch (_) { /* private mode */ }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) : [];
  const r = pickLang({ search: typeof location !== 'undefined' ? location.search : '', stored, languages: nav });
  lang = r.lang;
  if (r.fromQuery) { try { if (st) st.setItem(STORAGE_KEY, lang); } catch (_) { /* ignore */ } }
  applyDocument();
  return lang;
}

export function getLang() { return lang; }
export function locale() { return LOCALES[lang]; }

export function setLang(next, { save = true } = {}) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  if (save) { try { const st = storage(); if (st) st.setItem(STORAGE_KEY, lang); } catch (_) { /* ignore */ } }
  applyDocument();
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// UI string; a dictionary value is a string with {param} slots or a function of the params
export function t(key, p = {}) {
  let v = DICTS[lang][key];
  if (v == null) v = KO[key];
  if (v == null) return key;
  if (typeof v === 'function') return v(p);
  return v.replace(/\{(\w+)\}/g, (_, k) => (p[k] != null ? String(p[k]) : ''));
}

// every [data-i18n] element under root gets its text again (static labels built once)
export function applyI18n(root) {
  if (!root || !root.querySelectorAll) return;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

// ---- data strings (Korean in json and saves) ----
export function tr(s) {
  if (lang === 'ko' || s == null || s === '') return s;
  const d = DATA[lang];
  const v = d.text[s] ?? d.prefix[s];
  return v != null ? v : s;
}

// item names are built as "<affix prefix> <base name>" (or a fixed legendary / set name)
export function trItemName(name) {
  if (lang === 'ko' || !name) return name;
  const d = DATA[lang];
  if (d.text[name] != null) return d.text[name];
  let best = null;
  for (const p of Object.keys(d.prefix)) if (name.startsWith(p + ' ') && (!best || p.length > best.length)) best = p;
  if (!best) return name;
  const base = tr(name.slice(best.length + 1));
  return lang === 'ja' ? d.prefix[best] + base : `${d.prefix[best]} ${base}`;
}

// person names: the ko list (names.json) and the en/ja lists are index-aligned, so a name saved in any
// of the three languages is shown in the current one. Names typed by the player stay as typed.
let nameIndex = null;
export function registerNames(koNames) {
  nameIndex = { given: new Map(), family: new Map() };
  for (const kind of ['given', 'family']) {
    const lists = [koNames && koNames[kind], DATA_EN.names[kind], DATA_JA.names[kind]];
    for (const list of lists) (list || []).forEach((n, i) => { if (!nameIndex[kind].has(n)) nameIndex[kind].set(n, i); });
    nameIndex[kind].ko = (koNames && koNames[kind]) || [];
  }
}
export function trPerson(name, kind = 'given') {
  if (!nameIndex || name == null) return name;
  const i = nameIndex[kind].get(name);
  if (i == null) return name;
  const list = lang === 'ko' ? nameIndex[kind].ko : DATA[lang].names[kind];
  return list[i] || name;
}
// the generated-name list for the current language (new families)
export function nameList(koNames, kind) {
  if (lang === 'ko') return koNames[kind];
  const l = DATA[lang].names[kind];
  return l && l.length ? l : koNames[kind];
}

// "블랙우드 아르덴" / "Arden Blackwood" / "アルデン・ブラックウッド" (already escaped by the caller if needed)
export function fullName(family, given) {
  return t('person', { family: trPerson(family, 'family'), given: trPerson(given, 'given') });
}

// relic card description in the current language (the offer keeps the Korean one)
export function relicDesc(o, relicsCfg) {
  if (lang === 'ko' || !relicsCfg || !relicsCfg.list[o.id]) return o.desc;
  const d = relicsCfg.list[o.id];
  const v = d.fmt === 'pct' ? `${Math.round(o.value * 100)}%` : String(Math.round(o.value));
  return tr(d.desc).replace('{v}', v);
}

export function formatDate(ms, withTime = true) {
  if (!ms) return '';
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  if (lang === 'ko') return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}${withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : ''}`;
  const o = { year: 'numeric', month: lang === 'en' ? 'short' : '2-digit', day: '2-digit' };
  if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toLocaleString(LOCALES[lang], o);
}

export const DATA_DICTS = DATA;
export const UI_DICTS = DICTS;
