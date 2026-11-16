// How likely a special attack stuns, by where the foe stands (Phase 6). Pure.

export const clampStun = (p) => Math.max(0, Math.min(1, p));

// bosses get every stun chance scaled down (0.35 / 0.8): even a certain stun is ~44% on them
export const bossScale = (p, ratio) => clampStun(p) * ratio;

// the jump's landing: the core (coreRatio of the radius) always stuns; the rest of the radius is cut
// into equal rings with the chances in `zones` (inner to outer); outside the circle nothing
export function jumpStun(dist, radius, coreRatio, zones) {
  if (dist > radius) return 0;
  const core = radius * coreRatio;
  if (dist <= core) return 1;
  const n = zones.length;
  if (!n) return 0;
  const i = Math.min(n - 1, Math.floor(((dist - core) / (radius - core)) * n));
  return clampStun(zones[i]);
}

// the spin's blade: nothing inside nearZero of its length, rising in a straight line to `base` at the tip
export function spinStun(dist, radius, base, nearZero) {
  const start = radius * nearZero;
  if (dist <= start) return 0;
  return clampStun(base * Math.min(1, (dist - start) / (radius - start)));
}
