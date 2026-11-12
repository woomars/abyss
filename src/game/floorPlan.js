// Floor number -> what that floor is (pure). Floors repeat every cycleLength with a loop bonus.
export function floorInfo(n, cfg) {
  const len = cfg.cycleLength;
  const cycle = Math.floor((n - 1) / len);
  const base = ((n - 1) % len) + 1;
  const band = cfg.bands.find((b) => base >= b.from && base <= b.to) || cfg.bands[cfg.bands.length - 1];
  const mods = {
    hp: (1 + cfg.perFloor.hp * (base - 1)) * (1 + cfg.perLoop.hp * cycle),
    attack: (1 + cfg.perFloor.attack * (base - 1)) * (1 + cfg.perLoop.attack * cycle),
    speed: 1 + cfg.perLoop.speed * cycle,
  };
  // how long a hit enemy stays ready to strike back: grows over the cycle, full on later loops
  if (cfg.riposteWindow) {
    const [a, b] = cfg.riposteWindow;
    mods.riposteWindow = cycle > 0 ? b : a + (b - a) * ((base - 1) / Math.max(1, len - 1));
  }
  return {
    floor: n, base, cycle, band, mods,
    kind: band.kind,
    music: band.music,
    boss: band.boss || null,
    treasureAfter: cfg.treasureAfter.includes(base),
  };
}

// weighted pick from { key: weight }
export function pickWeighted(weights, rng) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rng() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

export const randRange = ([a, b], rng) => a + rng() * (b - a);
export const randInt = ([a, b], rng) => a + Math.floor(rng() * (b - a + 1));
