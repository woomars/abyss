// The hall's timeline (Phase 6, 12): everything the family won, in time order — ancestors' deaths, medals,
// trophies, bosses (the codex), essences handed down and past chronicles. Records from before times were
// kept go by generation and floor. Pure: the hall screen lists these and the recollection strip walks them.
import { bossRoster } from '../game/Medals.js';

const ORDER = { medal: 0, boss: 1, trophy: 2, essence: 3, death: 4, chronicle: 5 }; // same moment: what he won, then his death
const TAB = { ancestors: 'death', essence: 'essence', medals: 'medal', trophies: 'trophy', bosses: 'boss', chronicle: 'chronicle' };

const who = (p) => ({ given: p.given, generation: p.generation, family: p.family });

function compare(a, b) {
  if (a.at && b.at && a.at !== b.at) return a.at - b.at;
  if (!a.at || !b.at) { // an old record (no time, or 0): by generation, then floor
    const g = (a.who.generation || 0) - (b.who.generation || 0);
    if (g) return g;
    const f = (a.floor || 0) - (b.floor || 0);
    if (f) return f;
  }
  return ORDER[a.kind] - ORDER[b.kind];
}

// tab: 'all' or one of the hall's tabs
export function buildTimeline(vault, config, tab = 'all') {
  const out = [], v = vault, fam = v.lineage.family;
  for (const h of v.lineage.history || []) {
    const p = { ...who(h), family: h.family || fam };
    out.push({ kind: 'death', at: h.at, who: p, floor: h.floor, killer: h.killer || null, person: h });
    for (const [id, e] of Object.entries(h.essences || {})) if (!e.life) out.push({ kind: 'essence', at: h.at, who: p, floor: h.floor, key: id, count: e.count });
  }
  for (const m of config.medals.list) {
    const r = v.medals[m.id];
    if (r && r.first) out.push({ kind: 'medal', at: r.first.at, who: { ...who(r.first), family: r.first.family || fam }, floor: r.first.floor, key: m.id, medal: m });
  }
  for (const x of config.medals.trophies || []) {
    const r = v.trophies[x.id];
    if (r) out.push({ kind: 'trophy', at: r.at, who: { ...who(r), family: r.family || fam }, floor: r.floor, key: x.id, trophy: x });
  }
  for (const b of bossRoster(config.dungeon, config.enemies)) {
    const r = v.bestiary[b.key];
    if (r && r.first) out.push({ kind: 'boss', at: r.first.at, who: { ...who(r.first), family: r.first.family || fam }, floor: r.first.floor, key: b.key, boss: b });
  }
  for (const c of v.chronicles || []) {
    out.push({ kind: 'chronicle', at: c.at, who: { given: c.last, generation: c.generations, family: c.family || fam }, floor: 100, chronicle: c });
  }
  const want = tab === 'all' ? null : TAB[tab];
  return out.filter((e) => !want || e.kind === want).sort(compare);
}
