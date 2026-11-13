// Special-attack growth: every `every` levels the family earns one growth card (pick one of `choices`).
// Picks are kept in the vault (vault.skillUps: cardId -> count) and pass down with the level. Pure.

// summed growth per skill: { skillId: { damage, radius, distance, range, width, cooldown } }
export function skillUps(growth, picks = {}) {
  const out = {};
  if (!growth) return out;
  for (const c of growth.cards) {
    const n = picks[c.id] || 0;
    if (!n) continue;
    const u = out[c.skill] || (out[c.skill] = {});
    u[c.kind] = (u[c.kind] || 0) + c.add * n;
  }
  return out;
}

export const picksTaken = (picks = {}) => Object.values(picks).reduce((n, c) => n + (c || 0), 0);

// growth cards the family has earned by its level but not yet chosen
export function owedPicks(growth, level, picks = {}) {
  if (!growth) return 0;
  return Math.max(0, Math.floor(level / growth.every) - picksTaken(picks));
}

// n distinct cards
export function rollSkillCards(growth, rng, n = growth.choices) {
  const pool = growth.cards.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0]);
  return out;
}

// a skill definition with its growth applied (cooldown can shrink at most to cooldownMin of the base)
export function grownDef(def, up, growth) {
  if (!up) return def;
  const g = { ...def };
  for (const k of ['damage', 'radius', 'distance', 'range', 'width']) if (up[k] && g[k] != null) g[k] = def[k] * (1 + up[k]);
  if (up.cooldown) g.cooldown = def.cooldown * Math.max((growth && growth.cooldownMin) || 0.4, 1 - up.cooldown);
  return g;
}
