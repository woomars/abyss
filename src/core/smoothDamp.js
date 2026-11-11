// Critically damped spring (Unity SmoothDamp). velRef = {v} carries velocity between calls.
export function smoothDamp(current, target, velRef, smoothTime, dt) {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velRef.v + omega * change) * dt;
  velRef.v = (velRef.v - omega * temp) * exp;
  let output = target + (change + temp) * exp;
  // prevent overshooting the target
  if ((target - current > 0) === (output > target)) {
    output = target;
    velRef.v = 0;
  }
  return output;
}
