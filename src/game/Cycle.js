// After the floor-100 ending the story goes round again: the hero's child (same family name) becomes the
// first knight of a new line. The old line is kept as a chronicle (지난 연대기) and the house starts over —
// level 1, no essences, growth cards, medals, trophies or bestiary — keeping its stash, powder, set
// records and the gear that survived (worked out by the caller, like a death). Pure.

const count = (o) => Object.keys(o || {}).length;
const kills = (b) => Object.values(b || {}).reduce((n, r) => n + (r && r.kills ? r.kills : 0), 0);

// finale: { family, father, child, sex, item, at, floor }
export function newCycle(vault, finale, { survived = [] } = {}) {
  const l = vault.lineage;
  const people = [
    ...l.history.map((h) => ({ given: h.given, generation: h.generation, floor: h.floor, sex: h.sex || null })),
    { given: l.given, generation: l.generation, floor: finale.floor || 100, sex: l.sex || null, reached: true },
  ];
  const chronicle = {
    cycle: vault.cycle || 1,
    family: l.family,
    founder: people[0].given,
    last: l.given,
    generations: l.generation,
    level: vault.progress.level,
    at: finale.at || Date.now(),
    people,
    medals: count(vault.medals),
    trophies: count(vault.trophies),
    bosses: kills(vault.bestiary),
    survived: survived.slice(),
    ending: { family: l.family, father: l.given, child: finale.child, sex: finale.sex, item: finale.item || null },
  };
  vault.chronicles.push(chronicle);
  vault.cycle = (vault.cycle || 1) + 1;
  vault.lineage = { family: l.family, given: finale.child, generation: 1, history: [], sex: finale.sex };
  vault.progress = { level: 1, xp: 0 };
  vault.essence = { stats: {}, owned: {} };
  vault.skillUps = {};
  vault.medals = {};
  vault.bestiary = {};
  vault.trophies = {};
  vault.state = 'idle';
  vault.run = null;
  vault.lastFloor = 0;
  vault.carry = [];
  vault.runStats = null;
  return chronicle;
}
