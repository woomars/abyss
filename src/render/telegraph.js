// How an attack warning (circle, cone, melee reach) looks at progress k (0 = just shown, 1 = lands) and
// age seconds since it appeared: a thick bright edge that never fades into the crowd, a fill that
// deepens toward the hit, and a short flash when it first appears so a new warning catches the eye.
export const FLASH_TIME = 0.12;

export function telegraphStyle(k, age) {
  const kk = Math.max(0, Math.min(1, k));
  const flash = age < FLASH_TIME;
  return {
    flash,
    lineWidth: flash ? 5 : 3.5,
    strokeAlpha: flash ? 1 : 0.75 + 0.25 * kk,
    fillAlpha: 0.15 + 0.3 * kk,
  };
}
