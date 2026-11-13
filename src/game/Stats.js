// Bonus stats shared by treasure cards and equipment. Everything that boosts the player is summed into
// one object of these keys; combat, skills, movement and health read it.
export const STAT_KEYS = [
  'damage', 'attackFlat', 'maxHp', 'crit', 'critDamage', 'speed', 'cooldown', 'lifesteal', 'armor',
  'chain', 'chainRange', 'chainDamage', 'range', 'dashRange', 'knockback', 'attackSpeed', 'skillDamage', 'comboStep', 'jumpRadius', 'jumpDamage',
  'waveDamage', 'waveStun', 'waveFalloff', 'waveAngle',
];

export function zeroStats() {
  const o = {};
  for (const k of STAT_KEYS) o[k] = 0;
  return o;
}

// adds every known key of `from` into `into` (returns into)
export function addStats(into, from) {
  if (!from) return into;
  for (const k of STAT_KEYS) if (from[k]) into[k] += from[k];
  return into;
}
