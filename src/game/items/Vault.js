// One save slot: the family (name, generation, history), its level, the stash, powder, set records,
// gear worn between runs and the run state (idle / run / rest at a forge). Pure data + (de)serialise.
import { OLD_BOSS_KEYS } from '../Medals.js';

export const VAULT_VERSION = 1;
const PARTS = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'amulet', 'ring'];

function migrateBestiary(b) {
  const out = {};
  for (const [k, r] of Object.entries(b)) {
    const id = OLD_BOSS_KEYS[k] || k;
    const o = out[id];
    if (!o) { out[id] = { ...r }; continue; }
    o.kills = (o.kills || 0) + (r.kills || 0);
    o.deepest = Math.max(o.deepest || 0, r.deepest || 0);
    if (r.first && (!o.first || (r.first.at || 0) < (o.first.at || 0))) o.first = r.first;
  }
  return out;
}

function migrateTally(t) {
  const out = {};
  for (const [k, r] of Object.entries(t || {})) {
    const id = OLD_BOSS_KEYS[k] || k;
    const o = out[id];
    if (!o) { out[id] = { ...r }; continue; }
    o.count = (o.count || 0) + (r.count || 0);
    o.deepest = Math.max(o.deepest || 0, r.deepest || 0);
  }
  return out;
}

export class Vault {
  constructor({ family = '', given = '' } = {}) {
    this.stash = [];
    this.powder = {};
    for (const p of PARTS) this.powder[p] = [0, 0, 0];
    this.seen = {};       // setId -> { slot: true }
    this.equipped = {};   // Loadout JSON
    this.state = 'idle';  // idle | run (left a forge, fighting) | rest (sitting in a forge mid-run)
    this.run = null;      // run snapshot while resting
    this.nextId = 1;
    this.lineage = { family, given, generation: 1, history: [], sex: null }; // sex: son | daughter (the first knight: null)
    this.progress = { level: 1, xp: 0 };
    this.savedAt = 0;
    this.lastFloor = 0; // floor of the run in progress (for a run cut short by closing the game)
    this.carry = [];    // pocket while at the start forge (taken along into the run)
    this.tokens = 0;    // 유산의 증표 not yet put on an item
    this.medals = {};   // medalId -> { count, first: { given, family, generation, floor, at } }
    this.bestiary = {}; // bossKey -> { name, title, kills, deepest, first }
    this.runStats = null; // the run in progress (kills, medals, bosses) for a run cut short
    this.medalsFilled = true; // older saves get their fallen's medals filled in once
    this.essence = { stats: {}, owned: {} }; // treasure-room essences the whole line keeps
    this.trophies = {}; // trophyId -> { given, family, generation, floor, at } (family milestones)
    this.skillUps = {}; // special-attack growth cards chosen: cardId -> count (earned every 10 levels)
    this.cycle = 1;       // how many times the story has gone round (floor-100 endings + 1)
    this.chronicles = []; // 지난 연대기: one summary per line that reached floor 100 (Cycle.newCycle)
  }

  allocId() { return this.nextId++; }

  markSeen(item) {
    if (!item || !item.set) return;
    (this.seen[item.set] = this.seen[item.set] || {})[item.slot] = true;
  }

  // what a save-slot row shows
  summary() {
    const l = this.lineage;
    return {
      family: l.family, given: l.given, generation: l.generation, level: this.progress.level,
      savedAt: this.savedAt, state: this.state, floor: this.run ? this.run.floor : null,
      cycle: this.cycle, final: !!(this.run && this.run.final), // n회차, and a floor-100 challenge to come back to
    };
  }

  toJSON() {
    return {
      version: VAULT_VERSION, stash: this.stash, powder: this.powder, seen: this.seen, equipped: this.equipped,
      state: this.state, run: this.run, nextId: this.nextId, lineage: this.lineage, progress: this.progress, savedAt: this.savedAt, lastFloor: this.lastFloor, carry: this.carry, tokens: this.tokens,
      medals: this.medals, bestiary: this.bestiary, runStats: this.runStats, medalsFilled: this.medalsFilled, essence: this.essence, trophies: this.trophies, skillUps: this.skillUps, cycle: this.cycle, chronicles: this.chronicles,
    };
  }

  // null for missing, broken or other-version data
  static fromJSON(data) {
    if (!data || typeof data !== 'object' || data.version !== VAULT_VERSION) return null;
    if (!data.lineage || typeof data.lineage.family !== 'string') return null;
    const v = new Vault();
    v.stash = Array.isArray(data.stash) ? data.stash.filter((i) => i && typeof i === 'object') : [];
    for (const p of PARTS) {
      const a = data.powder && data.powder[p];
      v.powder[p] = Array.isArray(a) && a.length === 3 ? a.map((n) => Math.max(0, Number(n) || 0)) : [0, 0, 0];
    }
    v.seen = data.seen && typeof data.seen === 'object' ? data.seen : {};
    v.equipped = data.equipped && typeof data.equipped === 'object' ? data.equipped : {};
    v.state = ['idle', 'run', 'rest'].includes(data.state) ? data.state : 'idle';
    // a run is kept while resting at a forge, or from the arrival on floor 100 (the founder's room)
    const run = data.run && typeof data.run === 'object' ? data.run : null;
    v.run = run && (data.state === 'rest' || (data.state === 'run' && run.final)) ? run : null;
    if (v.state === 'rest' && !v.run) v.state = 'idle';
    v.nextId = Number.isFinite(data.nextId) ? data.nextId : 1;
    v.lineage = {
      family: data.lineage.family, given: String(data.lineage.given || ''),
      generation: Number.isFinite(data.lineage.generation) ? data.lineage.generation : 1,
      history: Array.isArray(data.lineage.history) ? data.lineage.history : [],
      sex: data.lineage.sex === 'son' || data.lineage.sex === 'daughter' ? data.lineage.sex : null,
    };
    const pr = data.progress || {};
    v.progress = { level: Number.isFinite(pr.level) ? pr.level : 1, xp: Number.isFinite(pr.xp) ? pr.xp : 0 };
    v.savedAt = Number.isFinite(data.savedAt) ? data.savedAt : 0;
    v.lastFloor = Number.isFinite(data.lastFloor) ? data.lastFloor : 0;
    v.carry = Array.isArray(data.carry) ? data.carry.filter((i) => i && typeof i === 'object') : [];
    v.tokens = Number.isFinite(data.tokens) ? Math.max(0, data.tokens) : 0;
    const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
    v.medals = obj(data.medals);
    v.bestiary = migrateBestiary(obj(data.bestiary));
    for (const h of v.lineage.history) if (h && h.bosses) h.bosses = migrateTally(h.bosses);
    v.runStats = data.state === 'run' && data.runStats && typeof data.runStats === 'object' ? data.runStats : null;
    if (v.runStats && v.runStats.bosses) v.runStats.bosses = migrateTally(v.runStats.bosses);
    v.medalsFilled = data.medalsFilled === true;
    const nums = (o) => Object.fromEntries(Object.entries(obj(o)).filter(([, n]) => Number.isFinite(n)));
    v.essence = { stats: nums(data.essence && data.essence.stats), owned: nums(data.essence && data.essence.owned) };
    v.trophies = obj(data.trophies);
    v.skillUps = nums(data.skillUps);
    v.cycle = Number.isFinite(data.cycle) && data.cycle >= 1 ? Math.floor(data.cycle) : 1;
    v.chronicles = Array.isArray(data.chronicles) ? data.chronicles.filter((c) => c && typeof c === 'object') : [];
    // never hand out an id that a saved item already has
    const ids = [...v.stash, ...v.carry, ...Object.values(v.equipped), ...((v.run && v.run.pocket) || [])].map((i) => (i && Number.isFinite(i.id) ? i.id : 0));
    v.nextId = Math.max(v.nextId, ...ids.map((n) => n + 1), 1);
    return v;
  }
}
