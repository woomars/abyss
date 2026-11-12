// Creates equipment: grade (affix count, base strength), quality (multiplier on everything),
// item level (the floor it dropped on), random affixes, legendaries and set pieces. Pure.
const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

export function gradeIndex(cfg, grade) { return cfg.gradeOrder.indexOf(grade); }

// weighted grade for a drop on this floor; deeper floors and bosses lean to higher grades
export function rollGrade(cfg, rng, floor = 1, boss = false, minGrade = null) {
  const d = cfg.drops, f = Math.max(0, floor - 1) + (boss ? d.boss.floorBonus : 0);
  const min = minGrade ? gradeIndex(cfg, minGrade) : 0;
  const entries = cfg.gradeOrder.map((g, i) => [g, i < min ? 0 : Math.max(d.gradeMin, d.gradeWeights[g] + d.gradePerFloor[g] * f)]);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rng() * total;
  for (const [g, w] of entries) { r -= w; if (w > 0 && r <= 0) return g; }
  return entries[entries.length - 1][0];
}

// 0 normal, 1 상급, 2 최상급 — same rule as the treasure cards
export function rollQuality(cfg, rng, floor = 1, boss = false) {
  const q = cfg.drops.quality;
  let r = rng();
  for (let i = q.chance.length - 1; i >= 1; i--) {
    const c = q.chance[i];
    const p = Math.min(c.max, c.base + c.perFloor * (floor - 1)) + (boss ? q.bossBonus * (i === 1 ? 1 : 0.5) : 0);
    if (r < p) return i;
    r -= p;
  }
  return 0;
}

function rollAffixes(cfg, rng, grade, count, exclude) {
  const gi = gradeIndex(cfg, grade);
  const pool = Object.keys(cfg.affixes).filter((k) => !exclude.includes(k) && !(cfg.affixes[k].minGrade && gradeIndex(cfg, cfg.affixes[k].minGrade) > gi));
  const out = [];
  for (let i = 0; i < count && pool.length; i++) {
    const k = pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0];
    out.push({ stat: k, value: cfg.affixes[k].value });
  }
  return out;
}

// opts: { id, level, slot?, grade?, quality?, legendary?, set? }
export function createItem(cfg, rng, opts) {
  const level = Math.max(1, opts.level || 1);
  let grade = opts.grade || 'common';
  let slot = opts.slot || pick(cfg.slots, rng);
  let name = null, effect = null, legendary = null, set = null;
  if (opts.legendary || (grade === 'legendary' && !opts.slot)) {
    legendary = opts.legendary || pick(Object.keys(cfg.legendaries), rng);
    const L = cfg.legendaries[legendary];
    grade = 'legendary'; slot = L.slot; name = L.name; effect = L.effect;
  } else if (grade === 'legendary') {
    // a legendary forced into a slot: use one made for that slot if there is one
    const fits = Object.keys(cfg.legendaries).filter((k) => cfg.legendaries[k].slot === slot);
    if (fits.length) { legendary = pick(fits, rng); name = cfg.legendaries[legendary].name; effect = cfg.legendaries[legendary].effect; }
  }
  if (opts.set) {
    set = opts.set;
    const pieces = cfg.sets[set].pieces;
    if (!pieces[slot]) slot = pick(Object.keys(pieces), rng);
    name = pieces[slot];
    grade = 'epic';
  }
  const quality = opts.quality != null ? opts.quality : 0;
  const b = cfg.base[slot];
  let base;
  if (b.stat) base = { stat: b.stat, value: b.value };
  else { // rings: their base is one random affix
    const [a] = rollAffixes(cfg, rng, 'common', 1, []); // grade-limited affixes are filtered by 'common'
    base = { stat: a.stat, value: a.value };
  }
  const affixes = rollAffixes(cfg, rng, grade, cfg.grades[grade].affixes, [base.stat]);
  if (!name) {
    const part = cfg.parts[slot];
    const prefix = affixes.length ? cfg.affixes[affixes[0].stat].prefix + ' ' : '';
    name = prefix + pick(part.names, rng);
  }
  return { id: opts.id, slot, grade, quality, level, base, affixes, name, legendary, effect, set, enhance: 0, points: 0, invested: 0, scar: false };
}

// a random drop for this floor: grade, maybe a set piece (rare+ drops only), quality
export function rollDrop(cfg, rng, { id, floor = 1, boss = false, minGrade = null }) {
  const grade = rollGrade(cfg, rng, floor, boss, minGrade);
  const quality = rollQuality(cfg, rng, floor, boss);
  const sc = cfg.drops.setChance;
  const setIds = Object.keys(cfg.sets);
  if (setIds.length && (grade === 'rare' || grade === 'epic') && rng() < Math.min(sc.max, sc.base + sc.perFloor * (floor - 1))) {
    return createItem(cfg, rng, { id, level: floor, grade: 'epic', quality, set: pick(setIds, rng) });
  }
  return createItem(cfg, rng, { id, level: floor, grade, quality });
}
