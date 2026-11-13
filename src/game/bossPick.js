// Which boss guards a boss floor: one of the bosses of that tier (mid / region / great) unlocked by the
// loop (cycle) the floor is in, at random — avoiding the one met last time in that tier when possible.
export function bossCandidates(types, tier, cycle) {
  return Object.keys(types).filter((k) => types[k].rank === 'boss' && types[k].tier === tier && (types[k].minCycle || 0) <= cycle);
}

export function pickBoss(types, tier, cycle, rng, avoid = null) {
  let list = bossCandidates(types, tier, cycle);
  if (list.length > 1 && avoid) list = list.filter((k) => k !== avoid);
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length) % list.length];
}

// boss level: the tier's base level plus the loop; drives rhythm stage, telegraph speed, extra shots
export function bossLevel(tier, cycle, cfg) {
  const t = cfg.bossTiers && cfg.bossTiers[tier];
  return (t ? t.level : 1) + cycle;
}
