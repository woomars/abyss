// The family line: when a hero falls his son takes over (same family name, a new given name from the
// prepared list), and the fallen father's record is kept. Pure.
const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

export function randomGiven(names, rng, avoid = null) {
  const pool = names.given.filter((n) => n !== avoid);
  return pick(pool.length ? pool : names.given, rng);
}

export function randomFamily(names, rng) { return pick(names.family, rng); }

// record: { given, family, generation, floor, kills, bestCombo, level, survived: [names], lost: n }
// returns the heir { given, family, generation }
export function succeed(vault, names, rng, record, historyMax = 20) {
  const l = vault.lineage;
  l.history.push(record);
  while (l.history.length > historyMax) l.history.shift();
  l.generation += 1;
  l.given = randomGiven(names, rng, record.given);
  return { given: l.given, family: l.family, generation: l.generation };
}
