// One save slot: the family (name, generation, history), its level, the stash, powder, set records,
// gear worn between runs and the run state (idle / run / rest at a forge). Pure data + (de)serialise.
import { OLD_BOSS_KEYS } from '../Medals.js';

export const VAULT_VERSION = 1;
const PARTS = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'amulet', 'ring']; // the old per-part powder (before Phase 6)
const OLD_STASH_SIZE = 60; // a save from before Phase 6 had 60 stash places: they count as bought
const ESSENCE_KEEP = ['chain', 'jumpDamage']; // not shrunk by the Phase 6 x0.1 (jumpDamage is moved to jumpRadius right after)

// set pieces: the Phase 6 names (세트 이름 + 부위, no 의) and all legendary, whatever an old save says
const SET_NAMES = {"abyss":"번개","arcaneVeil":"폭풍","meteor":"유성","galeHunter":"질풍","gravecall":"망령"};
const PART_NAMES = {"weapon":"검","helm":"투구","armor":"갑옷","gloves":"장갑","boots":"장화"};
// legendaries changed in Phase 6 stage 3: 세 갈래 팔찌 became another gloves legendary; two effects changed
const OLD_LEGEND = { tridentBracers: { legendary: 'earthshatter', effect: 'earthshatter', name: '대지 파쇄자' } };
const OLD_EFFECT = { quakestride: 'earthStep', wraithCrown: 'lastStand' };
const fixLegend = (it) => {
  if (!it || !it.legendary) return it;
  const to = OLD_LEGEND[it.legendary];
  if (to) Object.assign(it, to);
  if (OLD_EFFECT[it.legendary]) it.effect = OLD_EFFECT[it.legendary];
  return it;
};
const renameSetPiece = (it) => {
  fixLegend(it);
  if (!it || !it.set || !SET_NAMES[it.set] || it.legendary) return it; // an engraved unique keeps its own name
  if (PART_NAMES[it.slot]) it.name = `${SET_NAMES[it.set]} ${PART_NAMES[it.slot]}`;
  it.grade = 'legendary';
  return it;
};

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
    this.powder = [0, 0, 0]; // 일반 · 상급 · 최상급 (any part)
    this.stashSlots = 0;     // stash places bought with gold
    this.phase6 = true;      // saved in the Phase 6 shape (old saves are moved once on load)
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
    this.gold = 0;      // the family purse: kept through death and new lines (Phase 6)
    this.medals = {};   // medalId -> { count, first: { given, family, generation, floor, at } }
    this.bestiary = {}; // bossKey -> { name, title, kills, deepest, first }
    this.runStats = null; // the run in progress (kills, medals, bosses) for a run cut short
    this.medalsFilled = true; // older saves get their fallen's medals filled in once
    this.essence = { stats: {}, owned: {} }; // treasure-room essences the whole line keeps
    this.trophies = {}; // trophyId -> { given, family, generation, floor, at } (family milestones)
    this.skillUps = {}; // special-attack growth cards chosen: cardId -> count (earned every 10 levels)
    this.cycle = 1;       // how many times the story has gone round (floor-100 endings + 1)
    this.engraveBags = {};    // 각인 shuffle bags by chance ("90": { win, lose } balls left of 100)
    this.ropes = [];          // Ariadne's rope floors the family has set (21, 41, 61, 81); a new cycle clears them
    this.waveInterval = null; // seconds between timed waves (21층~), measured and kept by the family (C5)
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
      saved: !!(this.run && this.run.saved), // [저장하고 나가기]
      auto: !!(this.run && this.run.auto), // closed mid-fight: back to that floor's start
    };
  }

  toJSON() {
    return {
      version: VAULT_VERSION, stash: this.stash, powder: this.powder, stashSlots: this.stashSlots, phase6: true, seen: this.seen, equipped: this.equipped,
      state: this.state, run: this.run, nextId: this.nextId, lineage: this.lineage, progress: this.progress, savedAt: this.savedAt, lastFloor: this.lastFloor, carry: this.carry, tokens: this.tokens, gold: this.gold,
      medals: this.medals, bestiary: this.bestiary, runStats: this.runStats, medalsFilled: this.medalsFilled, essence: this.essence, trophies: this.trophies, skillUps: this.skillUps, cycle: this.cycle, chronicles: this.chronicles, waveInterval: this.waveInterval, ropes: this.ropes, engraveBags: this.engraveBags,
    };
  }

  // null for missing, broken or other-version data
  static fromJSON(data) {
    if (!data || typeof data !== 'object' || data.version !== VAULT_VERSION) return null;
    if (!data.lineage || typeof data.lineage.family !== 'string') return null;
    const v = new Vault();
    v.stash = Array.isArray(data.stash) ? data.stash.filter((i) => i && typeof i === 'object') : [];
    const n0 = (n) => Math.max(0, Number(n) || 0);
    if (data.phase6) {
      v.powder = Array.isArray(data.powder) && data.powder.length === 3 ? data.powder.map(n0) : [0, 0, 0];
      v.stashSlots = Math.max(0, Math.floor(Number(data.stashSlots) || 0));
    } else { // a save from before Phase 6: powder by part -> by quality, the old 60 places count as bought
      for (const p of PARTS) {
        const a = data.powder && data.powder[p];
        if (Array.isArray(a)) for (let q = 0; q < 3; q++) v.powder[q] += n0(a[q]);
      }
      v.stashSlots = OLD_STASH_SIZE;
    }
    v.seen = data.seen && typeof data.seen === 'object' ? data.seen : {};
    v.equipped = data.equipped && typeof data.equipped === 'object' ? data.equipped : {};
    v.state = ['idle', 'run', 'rest'].includes(data.state) ? data.state : 'idle';
    // a run is kept while resting at a forge, after [저장하고 나가기], or from the arrival on floor 100 (the founder's room)
    const run = data.run && typeof data.run === 'object' ? data.run : null;
    v.run = run && (data.state === 'rest' || (data.state === 'run' && (run.final || run.saved || run.auto))) ? run : null; // (saved: [저장하고 나가기])
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
    v.gold = Math.max(0, Number(data.gold) || 0);
    if (!data.phase6 && v.run && Number(v.run.gold) > 0) v.gold += Number(v.run.gold); // gold of an old run in progress joins the purse (once)
    const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
    v.medals = obj(data.medals);
    v.bestiary = migrateBestiary(obj(data.bestiary));
    v.stash.forEach(renameSetPiece); v.carry.forEach(renameSetPiece);
    Object.values(v.equipped).forEach(renameSetPiece);
    if (v.run && Array.isArray(v.run.pocket)) v.run.pocket.forEach(renameSetPiece);
    for (const h of v.lineage.history) if (h && h.bosses) h.bosses = migrateTally(h.bosses);
    v.runStats = data.state === 'run' && data.runStats && typeof data.runStats === 'object' ? data.runStats : null;
    if (v.runStats && v.runStats.bosses) v.runStats.bosses = migrateTally(v.runStats.bosses);
    v.medalsFilled = data.medalsFilled === true;
    const nums = (o) => Object.fromEntries(Object.entries(obj(o)).filter(([, n]) => Number.isFinite(n)));
    v.essence = { stats: nums(data.essence && data.essence.stats), owned: nums(data.essence && data.essence.owned) };
    if (!data.phase6) for (const k of Object.keys(v.essence.stats)) if (!ESSENCE_KEEP.includes(k)) v.essence.stats[k] *= 0.1; // essences are a tenth now
    if (v.essence.stats.jumpDamage != null) { // the essence of the leap widens the landing now (1% a card)
      v.essence.stats.jumpRadius = (v.essence.stats.jumpRadius || 0) + (v.essence.owned.leap || 0) * 0.01;
      delete v.essence.stats.jumpDamage;
    }
    v.trophies = obj(data.trophies);
    v.skillUps = nums(data.skillUps);
    v.cycle = Number.isFinite(data.cycle) && data.cycle >= 1 ? Math.floor(data.cycle) : 1;
    v.engraveBags = data.engraveBags && typeof data.engraveBags === 'object' ? data.engraveBags : {};
    v.ropes = Array.isArray(data.ropes) ? data.ropes.filter((f) => Number.isInteger(f) && f > 1) : [];
    v.waveInterval = Number.isFinite(data.waveInterval) && data.waveInterval > 0 ? data.waveInterval : null;
    v.chronicles = Array.isArray(data.chronicles) ? data.chronicles.filter((c) => c && typeof c === 'object') : [];
    // never hand out an id that a saved item already has
    const ids = [...v.stash, ...v.carry, ...Object.values(v.equipped), ...((v.run && v.run.pocket) || [])].map((i) => (i && Number.isFinite(i.id) ? i.id : 0));
    v.nextId = Math.max(v.nextId, ...ids.map((n) => n + 1), 1);
    return v;
  }
}
