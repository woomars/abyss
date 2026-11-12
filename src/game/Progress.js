// Family level: experience from kills, automatic stat gains per level. Carries over through deaths
// (the heir inherits the level). Pure.
export function xpNeed(cfg, level) {
  return Math.round(cfg.need.base * Math.pow(level, cfg.need.exp));
}

export function xpForKill(cfg, enemy, floor = 1) {
  const x = cfg.xp;
  const kind = enemy.isBoss ? 'boss' : enemy.mods && enemy.mods.enhanced ? 'enhanced' : enemy.isElite ? 'elite' : 'normal';
  return x[kind] * (1 + x.perFloor * Math.max(0, floor - 1));
}

// adds xp to progress {level, xp}; returns how many levels were gained
export function addXp(cfg, progress, amount) {
  let gained = 0;
  progress.xp += amount;
  while (progress.level < cfg.maxLevel && progress.xp >= xpNeed(cfg, progress.level)) {
    progress.xp -= xpNeed(cfg, progress.level);
    progress.level += 1;
    gained += 1;
  }
  if (progress.level >= cfg.maxLevel) progress.xp = 0;
  return gained;
}

// bonus stats from the level (level 1 = nothing)
export function levelStats(cfg, level) {
  const n = Math.max(0, level - 1), out = {};
  for (const [k, v] of Object.entries(cfg.perLevel)) out[k] = v * n;
  return out;
}
