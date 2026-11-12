// Which recorded sound plays for a combat event (pure; config.audio drives it).
// Consistency rule: soldier / elite (mid-boss) / boss each have their own hit and death sound.

export function hitSound({ crit, enemy, skill }, audio) {
  if (skill && audio.skillHit) return audio.skillHit; // special skills keep their own impact
  if (crit) return 'crit';
  const t = enemy && audio.byType[enemy.type];
  return t ? t.hit : 'hit';
}

export function deathSound(type, audio) {
  const t = audio.byType[type];
  return t ? t.death : audio.byType.soldier.death;
}

// use sound of a special skill (falls back to its synthesized voice name)
export function skillSound(id, audio) {
  return (audio.bySkill && audio.bySkill[id]) || `skill_${id}`;
}
