// Creates equipment: grade (affix count, base strength), quality (multiplier on everything),
// item level (the floor it dropped on), random affixes, legendaries and set pieces. Pure.
const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

export function gradeIndex(cfg, grade) { return cfg.gradeOrder.indexOf(grade); }

// grade weights on a floor from the drop table (tuning/drops.json gradeTable): straight lines between
// its rows, the first / last row beyond them
export function gradeWeightsAt(table, floor) {
  const cols = table.columns, rows = table.rows;
  const at = (row) => Object.fromEntries(cols.slice(1).map((g, i) => [g, row[i + 1]]));
  if (floor <= rows[0][0]) return at(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (floor <= b[0]) { const k = (floor - a[0]) / (b[0] - a[0]); return at(a.map((v, j) => v + (b[j] - v) * k)); }
  }
  return at(rows[rows.length - 1]);
}

// weighted grade for a drop on this floor; deeper floors and bosses lean to higher grades
export function rollGrade(cfg, rng, floor = 1, boss = false, minGrade = null) {
  const d = cfg.drops, w = gradeWeightsAt(d.gradeTable, floor + (boss ? d.boss.floorBonus : 0));
  const min = minGrade ? gradeIndex(cfg, minGrade) : 0;
  const entries = cfg.gradeOrder.map((g, i) => [g, i < min ? 0 : Math.max(0, w[g] || 0)]);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rng() * total;
  for (const [g, w] of entries) { r -= w; if (w > 0 && r <= 0) return g; }
  return entries[entries.length - 1][0];
}

// 0 normal, 1 상급, 2 최상급 — same rule as the treasure cards
export function rollQuality(cfg, rng, floor = 1, boss = false) {
  const q = cfg.drops.quality, chance = [null, q.superior, q.masterwork];
  let r = rng();
  for (let i = chance.length - 1; i >= 1; i--) {
    const c = chance[i];
    const p = Math.min(c.max, c.base + c.perFloor * (floor - 1)) + (boss ? q.bossBonus * (i === 1 ? 1 : 0.5) : 0);
    if (r < p) return i;
    r -= p;
  }
  return 0;
}

export function rollAffixes(cfg, rng, grade, count, exclude) {
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
  if (!opts.set && (opts.legendary || (grade === 'legendary' && !opts.slot))) { // set pieces pick their slot below, evenly
    legendary = opts.legendary || pick(Object.keys(cfg.legendaries), rng);
    const L = cfg.legendaries[legendary];
    grade = 'legendary'; slot = L.slot; name = L.name; effect = L.effect;
  } else if (!opts.set && grade === 'legendary') {
    // a legendary forced into a slot: use one made for that slot if there is one
    const fits = Object.keys(cfg.legendaries).filter((k) => cfg.legendaries[k].slot === slot);
    if (fits.length) { legendary = pick(fits, rng); name = cfg.legendaries[legendary].name; effect = cfg.legendaries[legendary].effect; }
  }
  if (opts.set) {
    set = opts.set;
    const pieces = cfg.sets[set].pieces;
    if (!pieces[slot]) slot = pick(Object.keys(pieces), rng);
    name = pieces[slot];
    grade = 'legendary'; // every set piece is legendary (Phase 6), with its set instead of a unique effect
    legendary = null; effect = null;
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
  const sc = cfg.drops.set;
  const setIds = Object.keys(cfg.sets);
  if (setIds.length && grade === 'legendary' && rng() < Math.min(sc.max, sc.base + sc.perFloor * (floor - 1))) { // some legendaries are set pieces
    return createItem(cfg, rng, { id, level: floor, grade: 'legendary', quality, set: pick(setIds, rng) });
  }
  return createItem(cfg, rng, { id, level: floor, grade, quality });
}
