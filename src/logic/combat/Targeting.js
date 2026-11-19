// Pure target-selection helpers.
// Cones (coneDeg) are half-angles around dir. arcDeg (slash) is the full arc width.
const DEG = Math.PI / 180;

function pick(pos, dir, enemies, accept, angleWeight) {
  let best = null, bestScore = Infinity, bestElite = false;
  for (const e of enemies) {
    if (!e.targetable) continue;
    const dx = e.pos.x - pos.x, dy = e.pos.y - pos.y;
    const d = Math.hypot(dx, dy);
    const cos = d > 1e-6 ? (dx * dir.x + dy * dir.y) / d : 1;
    if (!accept(e, d, cos)) continue;
    const score = d * (1 + angleWeight * (1 - cos));
    // elites (bosses) always win over regular enemies
    if (e.isElite && !bestElite) { best = e; bestScore = score; bestElite = true; continue; }
    if (!e.isElite && bestElite) continue;
    if (score < bestScore) { best = e; bestScore = score; }
  }
  return best;
}

export function selectAttackTarget(pos, dir, enemies, { range, coneDeg, angleWeight }) {
  const minCos = Math.cos(coneDeg * DEG);
  return pick(pos, dir, enemies, (e, d, cos) => d - e.radius <= range && (d <= e.radius || cos >= minCos), angleWeight);
}

export function selectChainTarget(pos, dir, enemies, { range, minDistance, coneDeg, excludeIds, angleWeight }) {
  const useCone = coneDeg > 0;
  const minCos = Math.cos(coneDeg * DEG);
  return pick(pos, dir, enemies, (e, d, cos) =>
    !excludeIds.has(e.id) && d >= minDistance && d - e.radius <= range && (!useCone || cos >= minCos), angleWeight);
}

export function slashHits(origin, dir, enemies, { radius, arcDeg, maxTargets }) {
  const minCos = Math.cos((arcDeg / 2) * DEG);
  const out = [];
  for (const e of enemies) {
    if (!e.targetable) continue;
    const dx = e.pos.x - origin.x, dy = e.pos.y - origin.y;
    const d = Math.hypot(dx, dy);
    if (d - e.radius > radius) continue;
    const cos = d > 1e-6 ? (dx * dir.x + dy * dir.y) / d : 1;
    if (d > e.radius && cos < minCos) continue;
    out.push({ e, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, maxTargets).map((o) => o.e);
}
