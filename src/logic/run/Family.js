// The family line: when a hero falls his son takes over (same family name, a new given name from the
// prepared list), and the fallen father's record is kept. Pure.
const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

export function randomGiven(names, rng, avoid = null, sex = 'son') {
  const list = (sex === 'daughter' && names.givenF && names.givenF.length) ? names.givenF : names.given;
  const pool = list.filter((n) => n !== avoid);
  return pick(pool.length ? pool : list, rng);
}

export function randomFamily(names, rng) { return pick(names.family, rng); }

// record: { given, family, generation, floor, kills, bestCombo, level, survived: [names], lost: n }
// returns the heir { given, family, generation, sex } — a son or a daughter, at random
export function succeed(vault, names, rng, record, historyMax = 20) {
  const l = vault.lineage;
  l.history.push(record);
  while (l.history.length > historyMax) l.history.shift();
  l.generation += 1;
  l.sex = rng() < 0.5 ? 'son' : 'daughter';
  l.given = randomGiven(names, rng, record.given, l.sex);
  return { given: l.given, family: l.family, generation: l.generation, sex: l.sex };
}
