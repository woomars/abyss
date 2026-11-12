// One save slot: the family (name, generation, history), its level, the stash, powder, set records,
// gear worn between runs and the run state (idle / run / rest at a forge). Pure data + (de)serialise.
export const VAULT_VERSION = 1;
const PARTS = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'amulet', 'ring'];

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
    this.lineage = { family, given, generation: 1, history: [] };
    this.progress = { level: 1, xp: 0 };
    this.savedAt = 0;
    this.lastFloor = 0; // floor of the run in progress (for a run cut short by closing the game)
    this.carry = [];    // pocket while at the start forge (taken along into the run)
    this.tokens = 0;    // 유산의 증표 not yet put on an item
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
    };
  }

  toJSON() {
    return {
      version: VAULT_VERSION, stash: this.stash, powder: this.powder, seen: this.seen, equipped: this.equipped,
      state: this.state, run: this.run, nextId: this.nextId, lineage: this.lineage, progress: this.progress, savedAt: this.savedAt, lastFloor: this.lastFloor, carry: this.carry, tokens: this.tokens,
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
    v.run = data.state === 'rest' && data.run && typeof data.run === 'object' ? data.run : null;
    if (v.state === 'rest' && !v.run) v.state = 'idle';
    v.nextId = Number.isFinite(data.nextId) ? data.nextId : 1;
    v.lineage = {
      family: data.lineage.family, given: String(data.lineage.given || ''),
      generation: Number.isFinite(data.lineage.generation) ? data.lineage.generation : 1,
      history: Array.isArray(data.lineage.history) ? data.lineage.history : [],
    };
    const pr = data.progress || {};
    v.progress = { level: Number.isFinite(pr.level) ? pr.level : 1, xp: Number.isFinite(pr.xp) ? pr.xp : 0 };
    v.savedAt = Number.isFinite(data.savedAt) ? data.savedAt : 0;
    v.lastFloor = Number.isFinite(data.lastFloor) ? data.lastFloor : 0;
    v.carry = Array.isArray(data.carry) ? data.carry.filter((i) => i && typeof i === 'object') : [];
    v.tokens = Number.isFinite(data.tokens) ? Math.max(0, data.tokens) : 0;
    // never hand out an id that a saved item already has
    const ids = [...v.stash, ...v.carry, ...Object.values(v.equipped), ...((v.run && v.run.pocket) || [])].map((i) => (i && Number.isFinite(i.id) ? i.id : 0));
    v.nextId = Math.max(v.nextId, ...ids.map((n) => n + 1), 1);
    return v;
  }
}
