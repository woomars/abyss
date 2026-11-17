// Which boss guards a boss floor: one of the bosses of that tier (mid / region / great) unlocked by the
// loop (cycle) the floor is in, at random — avoiding the one met last time in that tier when possible,
// and any attack type (ai) already met in this 20-floor cycle while another type is left (9.5).
export function bossCandidates(types, tier, cycle) {
  return Object.keys(types).filter((k) => types[k].rank === 'boss' && types[k].tier === tier && (types[k].minCycle || 0) <= cycle);
}

export function pickBoss(types, tier, cycle, rng, avoid = null, usedTypes = null) {
  let list = bossCandidates(types, tier, cycle);
  if (usedTypes && usedTypes.length) { const fresh = list.filter((k) => !usedTypes.includes(types[k].ai)); if (fresh.length) list = fresh; }
  if (list.length > 1 && avoid) list = list.filter((k) => k !== avoid);
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length) % list.length];
}

// two bosses (floor 61 on): a pair of this tier's bosses whose pair of types (sorted, same type twice
// allowed) has not come yet in this cycle; returns [typeA, typeB, key] or null
export function pickPair(types, tier, cycle, rng, usedPairs = []) {
  const list = bossCandidates(types, tier, cycle), all = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) all.push([list[i], list[j], [types[list[i]].ai, types[list[j]].ai].sort().join('+')]);
  if (!all.length) return null;
  const fresh = all.filter((p) => !usedPairs.includes(p[2]));
  const from = fresh.length ? fresh : all;
  return from[Math.floor(rng() * from.length) % from.length];
}

// boss level: the tier's base level plus the loop; drives rhythm stage, telegraph speed, extra shots
export function bossLevel(tier, cycle, cfg) {
  const t = cfg.bossTiers && cfg.bossTiers[tier];
  return (t ? t.level : 1) + cycle;
}
