// Debug [튜닝] tab (Korean only): every table of src/data/tuning as a form — the "_" notes shown above
// the values they explain. [적용] puts the tab's table into the running game, [기본값] brings back the
// shipped file, [전체 저장] writes every table (notes kept) to a folder the player picks (or the share
// sheet / downloads where folders cannot be picked).
import { TUNING_FILES } from '../game/config.js';
import { setAt, applyEdit } from './tuningEdit.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = (path) => encodeURIComponent(JSON.stringify(path));
const isPlain = (v) => v === null || typeof v !== 'object';

export class TuningEditor {
  // onApplied: () => void — after a table went into the game (stats and hp follow)
  constructor(el, { config, onApplied = () => {} }) {
    this.el = el;
    this.config = config;
    this.onApplied = onApplied;
    this.cur = TUNING_FILES[0];
    this.base = {};  // name -> the shipped file (with notes)
    this.edit = {};  // name -> the table being edited
    this.dirty = new Set(); // edited since the last [적용]
    this.msg = '';
    el.addEventListener('change', (e) => this.onInput(e.target));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) { this.cur = b.dataset.tab; this.show(); }
      else if (b.dataset.tact === 'apply') this.apply(this.cur);
      else if (b.dataset.tact === 'reset') this.reset(this.cur);
      else if (b.dataset.tact === 'save') this.saveAll();
    });
  }

  async load(name) {
    if (this.base[name]) return;
    const r = await fetch(`src/data/tuning/${name}.json`, { cache: 'no-store' });
    this.base[name] = await r.json();
    this.edit[name] = structuredClone(this.base[name]);
  }

  async show() {
    try { await this.load(this.cur); } catch (err) { this.msg = `불러오기 실패: ${err.message}`; }
    this.render();
  }

  apply(name) {
    if (!this.edit[name]) return;
    applyEdit(this.config, name, this.edit[name]);
    this.dirty.delete(name);
    this.onApplied();
    this.msg = `${name}.json 적용됨`;
    this.render();
  }

  reset(name) {
    if (!this.base[name]) return;
    this.edit[name] = structuredClone(this.base[name]);
    this.apply(name);
    this.msg = `${name}.json 기본값으로 되돌려 적용함`;
    this.render();
  }

  onInput(t) {
    if (!t.dataset.p) return;
    const path = JSON.parse(decodeURIComponent(t.dataset.p));
    let v;
    if (t.type === 'checkbox') v = t.checked;
    else if (t.dataset.kind === 'number') { v = Number(t.value); if (t.value.trim() === '' || !Number.isFinite(v)) { this.render(); return; } }
    else if (t.dataset.kind === 'null') v = t.value.trim() === '' ? null : t.value;
    else v = t.value;
    setAt(this.edit[this.cur], path, v);
    this.dirty.add(this.cur);
    this.el.querySelector(`[data-tab="${this.cur}"]`).classList.add('dirty');
  }

  // every table, notes kept, as files named like the originals (so they can go back into src/data/tuning)
  async saveAll() {
    try {
      for (const n of TUNING_FILES) await this.load(n);
      const files = TUNING_FILES.map((n) => ({ name: `${n}.json`, text: JSON.stringify(this.edit[n], null, 2) + '\n' }));
      if (window.showDirectoryPicker) {
        const dir = await window.showDirectoryPicker({ id: 'abyss-tuning', mode: 'readwrite' });
        for (const f of files) {
          const w = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
          await w.write(f.text);
          await w.close();
        }
        this.msg = `폴더 "${dir.name}"에 ${files.length}개 저장함`;
      } else {
        const list = files.map((f) => new File([f.text], f.name, { type: 'application/json' }));
        if (navigator.canShare && navigator.canShare({ files: list })) {
          await navigator.share({ files: list, title: 'abyss tuning' }); // "파일에 저장"에서 폴더를 고른다
          this.msg = '공유 화면으로 보냄 — "파일에 저장"에서 폴더를 고르세요';
        } else {
          for (const f of files) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }));
            a.download = f.name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          }
          this.msg = `다운로드 폴더에 ${files.length}개 저장함`;
        }
      }
    } catch (err) {
      this.msg = err && err.name === 'AbortError' ? '저장 취소' : `저장 실패: ${err.message}`;
    }
    this.render();
  }

  // ---- the form ----
  field(key, v, path) {
    const label = `<span class="tk">${esc(key)}</span>`;
    if (typeof v === 'boolean') return `<label class="trow">${label}<input type="checkbox" data-p="${enc(path)}"${v ? ' checked' : ''}></label>`;
    if (typeof v === 'number') return `<label class="trow">${label}<input type="number" step="any" inputmode="decimal" data-kind="number" data-p="${enc(path)}" value="${v}"></label>`;
    if (v === null) return `<label class="trow">${label}<input type="text" data-kind="null" data-p="${enc(path)}" value="" placeholder="null"></label>`;
    if (String(v).length > 36) return `<label class="trow wide">${label}<textarea data-p="${enc(path)}" rows="2">${esc(v)}</textarea></label>`;
    return `<label class="trow">${label}<input type="text" data-p="${enc(path)}" value="${esc(v)}"></label>`;
  }

  tree(obj, path) {
    let out = '';
    for (const [k, v] of Object.entries(obj)) {
      const p = [...path, Array.isArray(obj) ? Number(k) : k];
      if (!Array.isArray(obj) && k.startsWith('_')) { out += `<div class="tnote">${esc(isPlain(v) ? v : JSON.stringify(v))}</div>`; continue; }
      if (isPlain(v)) { out += this.field(k, v, p); continue; }
      if (Array.isArray(v) && v.every((x) => typeof x === 'number' || typeof x === 'boolean')) { // a short list of numbers on one line
        out += `<div class="trow"><span class="tk">${esc(k)}</span><span class="tarr">${v.map((x, i) => (typeof x === 'number'
          ? `<input type="number" step="any" inputmode="decimal" data-kind="number" data-p="${enc([...p, i])}" value="${x}">`
          : `<input type="checkbox" data-p="${enc([...p, i])}"${x ? ' checked' : ''}>`)).join('')}</span></div>`;
        continue;
      }
      out += `<details class="tgrp"${path.length < 1 ? ' open' : ''}><summary>${esc(k)}</summary>${this.tree(v, p)}</details>`;
    }
    return out;
  }

  render() {
    const t = this.edit[this.cur], form = this.el.querySelector('.tform');
    const top = form && this.shown === this.cur ? form.scrollTop : 0; // a redraw keeps the place in the same table
    this.shown = this.cur;
    this.el.innerHTML = `
      <div class="ttabs">${TUNING_FILES.map((n) => `<button data-tab="${n}" class="${n === this.cur ? 'on' : ''}${this.dirty.has(n) ? ' dirty' : ''}">${n}</button>`).join('')}</div>
      <div class="tacts"><button data-tact="apply">적용</button><button data-tact="reset">기본값</button><span class="tsp"></span><button data-tact="save">전체 저장</button></div>
      ${this.msg ? `<div class="tmsg">${esc(this.msg)}</div>` : ''}
      <div class="tform">${t ? this.tree(t, []) : '불러오는 중…'}</div>`;
    this.el.querySelector('.tform').scrollTop = top;
  }
}
