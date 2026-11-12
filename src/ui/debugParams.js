// Live-tunable parameters exposed in the ?debug=1 panel. Paths point into the config object.
export const DEBUG_PARAMS = [
  { path: 'input.flickMaxTime', min: 0.08, max: 0.6, step: 0.01 },
  { path: 'input.flickMinPx', min: 10, max: 150, step: 5 },
  { path: 'input.flickMinSpeed', min: 100, max: 2000, step: 50 },
  { path: 'movement.cruiseSpeed', min: 80, max: 500, step: 10 },
  { path: 'movement.burstSpeed', min: 200, max: 1200, step: 10 },
  { path: 'movement.burstDuration', min: 0, max: 1.5, step: 0.05 },
  { path: 'combat.dashRange', min: 60, max: 400, step: 5 },
  { path: 'combat.dashSpeed', min: 400, max: 2500, step: 25 },
  { path: 'combat.attackConeDeg', min: 10, max: 180, step: 5 },
  { path: 'combat.slashRadius', min: 30, max: 160, step: 2 },
  { path: 'combat.critChance', min: 0, max: 1, step: 0.01 },
  { path: 'combat.rushWindow', min: 0.1, max: 3, step: 0.05 },
  { path: 'combat.normalAttackInterval', min: 0.1, max: 1.5, step: 0.05 },
  { path: 'combat.chain.count', min: 0, max: 8, step: 1 },
  { path: 'combat.chain.range', min: 60, max: 400, step: 5 },
  { path: 'combat.chain.minDistance', min: 0, max: 120, step: 5 },
  { path: 'combat.chain.coneDeg', min: 0, max: 180, step: 5 },
  { path: 'feedback.hitStopMs.normal', min: 0, max: 120, step: 5 },
  { path: 'feedback.hitStopMs.strong', min: 0, max: 150, step: 5 },
  { path: 'feedback.hitStopMs.crit', min: 0, max: 200, step: 5 },
  { path: 'feedback.hitStopScale', min: 0, max: 1, step: 0.01 },
  { path: 'camera.followTime', min: 0.02, max: 1, step: 0.01 },
  { path: 'camera.combatFollowTime', min: 0.05, max: 1.5, step: 0.05 },
  { path: 'camera.returnTime', min: 0.05, max: 1, step: 0.01 },
  { path: 'camera.lookAhead', min: 0, max: 250, step: 5 },
  { path: 'camera.freeRadiusFrac', min: 0, max: 0.5, step: 0.01 },
  { path: 'enemies.targetCount', min: 0, max: 60, step: 1 },
  { path: 'enemies.counterWindow', min: 0, max: 3, step: 0.1 },
];

export function getPath(obj, path) {
  let o = obj;
  for (const k of path.split('.')) {
    if (o == null || typeof o !== 'object') return undefined;
    o = o[k];
  }
  return o;
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}
