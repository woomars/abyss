// Shared boss machinery for the four boss brains (warrior, mage, ranged, summoner):
// chase/keep distance -> pick a pattern -> windup (the telegraph is on the floor) -> fire -> recover.
// The time between patterns and each telegraph's length come from the boss rhythm (more beats mixed
// at higher boss levels). Under enrageAt hp the boss moves faster and telegraphs/rests shorter.
// Brains supply `move(e, game, toPlayer)`; everything else lives here. Returns movement vectors.
import { rhythmFor, teleTime } from '../Rhythm.js';

const CALM = { speed: 1, windup: 1, cooldown: 1 };
const TAU = Math.PI * 2;
const rand = (a, b, rng) => a + rng() * (b - a);

function toward(e, p) {
  const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d, d };
}
const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

// a free spot at distance [min, max] from point c (inside the room, off the pillars)
export function freeSpot(game, c, min, max, radius) {
  const ar = game.arena, rng = game.rng, pad = radius + 30;
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU, d = rand(min, max, rng);
    const q = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
    if (q.x < pad || q.y < pad || q.x > ar.width - pad || q.y > ar.height - pad) continue;
    if (ar.resolveCircle(q, radius).hitWall) continue;
    return q;
  }
  return null;
}

// a spot behind or beside the player (seen from the boss), free of walls and pillars; null if none
export function behindSpot(e, game, dist) {
  const p = game.player.pos, ar = game.arena;
  const base = Math.atan2(p.y - e.pos.y, p.x - e.pos.x), pad = e.radius + 20;
  for (let i = 0; i < 12; i++) {
    const a = base + (game.rng() * 2 - 1) * (Math.PI / 2); // straight behind .. either side
    const q = { x: p.x + Math.cos(a) * dist, y: p.y + Math.sin(a) * dist };
    if (q.x < pad || q.y < pad || q.x > ar.width - pad || q.y > ar.height - pad) continue;
    if (ar.resolveCircle(q, e.radius).hitWall) continue;
    return q;
  }
  return freeSpot(game, p, dist * 0.8, dist * 1.4, e.radius);
}

// out of the smoke at a spot (assassin)
export function appear(e, game, to) {
  const from = { x: e.pos.x, y: e.pos.y };
  e.pos = { x: to.x, y: to.y }; e.prevPos = { x: to.x, y: to.y };
  e.hidden = false;
  game.events.emit('bossBlink', { enemy: e, from, to: { x: to.x, y: to.y } });
}

function shoot(e, game, dir, p) {
  const off = e.radius + 6;
  game.hazards.arrow({ x: e.pos.x + dir.x * off, y: e.pos.y + dir.y * off, dir: { x: dir.x, y: dir.y }, speed: p.speed, radius: p.radius, damage: p.damage * e.mods.attack, range: p.range, style: p.style || 'bolt', home: (p.home || 0) * e.ai.k, homeTime: p.homeTime || 0 });
}

// a string of straight moves/shots: do one, mark the next lane at the player, wait, do it again
function chained(e, g, p, first, again, mark) {
  let left = Math.round(((p.repeat || 1) - 1) * e.ai.k) + (p.repeat ? e.ai.extra : 0), wait = 0, cur = first();
  return {
    update(dt) {
      if (cur) { const mv = cur.update(dt); if (mv) return mv; cur = null; if (left <= 0) return null; wait = p.chainWindup || p.repeatWindup || 0.4; e.ai.dir = mark(); left--; return { x: 0, y: 0 }; }
      wait -= dt;
      if (wait <= 0) cur = again();
      return { x: 0, y: 0 };
    },
  };
}

// pattern kinds: cast(e, game, p, windup, dir) lays the telegraph; fire(...) runs when the windup ends
// and may return a task { update(dt) -> movement | null when done }
const EXEC = {
  cone: { cast(e, g, p, w, dir) { g.hazards.cone({ x: e.pos.x, y: e.pos.y, dir, radius: p.radius + e.radius * 0.5, arcDeg: p.arcDeg, delay: w, damage: p.damage * e.mods.attack }); } },
  ring: { cast(e, g, p, w) { g.hazards.ring({ x: e.pos.x, y: e.pos.y, delay: w, speed: p.speed, maxRadius: p.maxRadius, thickness: p.thickness, damage: p.damage * e.mods.attack }); } },
  slam: { cast(e, g, p, w) { g.hazards.circle({ x: g.player.pos.x, y: g.player.pos.y, radius: p.radius, delay: w, damage: p.damage * e.mods.attack }); } },
  sweep: { cast(e, g, p, w) { g.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: p.radius + e.radius * 0.5, delay: w, damage: p.damage * e.mods.attack }); } },
  // three quick cuts, alternating sides, each with its own short warning
  triple: {
    hold: (p) => 2 * p.gap,
    cast(e, g, p, w, dir) {
      [-1, 1, 0].forEach((s, i) => g.hazards.cone({ x: e.pos.x, y: e.pos.y, dir: rot(dir, (s * p.spread * Math.PI) / 180), radius: p.radius + e.radius * 0.5, arcDeg: p.arcDeg, delay: w + i * p.gap, damage: p.damage * e.mods.attack }));
    },
  },
  // a lane is marked, then the boss crashes along it
  charge: {
    cast(e, g, p, w, dir) { g.hazards.line({ x: e.pos.x, y: e.pos.y, dir, length: p.length, width: p.width, delay: w, damage: p.damage * e.mods.attack }); },
    // charges come in strings: crash along the lane, then mark a new lane at the player and crash again
    fire(e, g, p) {
      const dash = () => { const d = { ...e.ai.dir }; let t = p.dashTime; const sp = p.length / p.dashTime; return { update(dt) { t -= dt; return t > 0 ? { x: d.x * sp, y: d.y * sp } : null; } }; };
      const mark = () => { const v = toward(e, g.player.pos); g.hazards.line({ x: e.pos.x, y: e.pos.y, dir: { x: v.x, y: v.y }, length: p.length, width: p.width, delay: p.chainWindup || 0.4, damage: p.damage * e.mods.attack }); return { x: v.x, y: v.y }; };
      return chained(e, g, p, dash, dash, mark);
    },
  },
  // several circles around the player, landing one after another
  fields: {
    hold: (p, e) => (Math.round(p.count * (0.6 + 0.4 * e.ai.k)) + e.ai.extra - 1) * p.stagger,
    cast(e, g, p, w) {
      const n = Math.round(p.count * (0.6 + 0.4 * e.ai.k)) + e.ai.extra, c = g.player.pos;
      for (let i = 0; i < n; i++) {
        const q = i === 0 ? { x: c.x, y: c.y } : (freeSpot(g, c, p.radius * 0.6, p.spread, 10) || { x: c.x, y: c.y });
        g.hazards.circle({ x: q.x, y: q.y, radius: p.radius, delay: w + i * p.stagger, damage: p.damage * e.mods.attack });
      }
    },
  },
  // a circle that follows the player and locks shortly before it bursts
  seeker: { cast(e, g, p, w) { g.hazards.circle({ x: g.player.pos.x, y: g.player.pos.y, radius: p.radius, delay: w, damage: p.damage * e.mods.attack, follow: true, lockAt: Math.max(0.1, w - p.lock) }); } },
  // vanish and reappear near the player, then a quick burst on the player
  blink: {
    cast(e, g, p, w) {
      const q = freeSpot(g, g.player.pos, p.min, p.max, e.radius);
      if (q) {
        const from = { x: e.pos.x, y: e.pos.y };
        e.pos = { x: q.x, y: q.y }; e.prevPos = { x: q.x, y: q.y };
        g.events.emit('bossBlink', { enemy: e, from, to: { x: q.x, y: q.y } });
      }
      g.hazards.circle({ x: g.player.pos.x, y: g.player.pos.y, radius: p.radius, delay: w, damage: p.damage * e.mods.attack });
    },
  },
  // a glow marks the boss, then bolts spin out of it
  spiral: {
    cast(e, g, p, w) { g.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: p.tellRadius + e.radius, delay: w, damage: 0 }); },
    fire(e, g, p, dir) {
      let t = p.duration, next = 0, a = Math.atan2(dir.y, dir.x);
      const arms = p.arms + e.ai.extra;
      return {
        update(dt) {
          t -= dt; next -= dt;
          if (next <= 0) {
            next = p.every;
            for (let k = 0; k < arms; k++) { const b = a + (k * TAU) / arms; shoot(e, g, { x: Math.cos(b), y: Math.sin(b) }, p); }
            a += p.turn;
          }
          return t > 0 ? { x: 0, y: 0 } : null;
        },
      };
    },
  },
  // a line marks the aim, then a quick string of shots down it
  volley: {
    cast(e, g, p, w, dir) { g.hazards.line({ x: e.pos.x, y: e.pos.y, dir, length: p.range * 0.6, width: 18, delay: w }); },
    fire(e, g, p, dir) {
      let left = p.count + e.ai.extra, next = 0;
      return { update(dt) { next -= dt; if (next <= 0 && left > 0) { next = p.every; left--; shoot(e, g, dir, p); } return left > 0 ? { x: 0, y: 0 } : null; } };
    },
  },
  // an arc marks the spread, then shots fan out across it
  fan: {
    cast(e, g, p, w, dir) { g.hazards.cone({ x: e.pos.x, y: e.pos.y, dir, radius: p.range * 0.45, arcDeg: p.arcDeg, delay: w, damage: 0 }); },
    fire(e, g, p, dir) {
      const n = p.count + e.ai.extra;
      for (let i = 0; i < n; i++) shoot(e, g, rot(dir, ((i / Math.max(1, n - 1) - 0.5) * p.arcDeg * Math.PI) / 180), p);
    },
  },
  // rotating lines (ranged, 9.4): a fan of lines from the boss sweeps after the player; it turns back
  // only turnDelay after the player went the other way, and its tip outruns a walking player
  lines: {
    cast(e, g, p, w, dir) {
      const rl = g.config.enemies.rotatingLines, n = p.count || rl.count, spread = ((p.spread || rl.spread) * Math.PI) / 180;
      const aim = n % 2 ? 0 : spread / 2; // an even fan would leave the hero in its middle gap: put a line on him
      const center = Math.atan2(dir.y, dir.x) + aim, active = p.active || rl.active;
      const beams = [];
      for (let i = 0; i < n; i++) beams.push(g.hazards.beam({ owner: e, angle: center + (i - (n - 1) / 2) * spread, length: p.length, width: p.width, delay: w, duration: active, damage: p.damage * e.mods.attack }));
      e.ai.lines = { beams, center, spread, n, aim, spin: 0, flip: 0 };
    },
    fire(e, g, p) {
      const rl = g.config.enemies.rotatingLines, L = e.ai.lines;
      let t = p.active || rl.active;
      const turnDelay = p.turnDelay != null ? p.turnDelay : rl.turnDelay, tip = p.tipSpeed || rl.tipSpeed;
      return {
        update(dt) {
          t -= dt;
          if (t <= 0 || !L) { e.ai.lines = null; return null; }
          const hero = g.config.movement.cruiseSpeed * (1 + ((g.bonusStats && g.bonusStats.speed) || 0));
          const far = Math.max(80, Math.hypot(g.player.pos.x - e.pos.x, g.player.pos.y - e.pos.y));
          const step = ((tip * hero) / far) * dt; // faster than the hero walks, where the hero is
          const want = Math.atan2(g.player.pos.y - e.pos.y, g.player.pos.x - e.pos.x) + L.aim;
          const diff = Math.atan2(Math.sin(want - L.center), Math.cos(want - L.center));
          const side = Math.abs(diff) < 1e-6 ? 0 : Math.sign(diff);
          if (L.spin === 0) L.spin = side;
          else if (side !== 0 && side !== L.spin) { L.flip += dt; if (L.flip >= turnDelay) { L.spin = side; L.flip = 0; } } else L.flip = 0;
          if (L.spin === side && Math.abs(diff) <= step) L.center = want; else L.center += L.spin * step;
          L.beams.forEach((b, i) => { b.angle = L.center + (i - (L.n - 1) / 2) * L.spread; });
          return { x: 0, y: 0 };
        },
      };
    },
  },
  // assassin: its shadow falls behind or beside the player, then it steps out there with a quick cut
  shadowStrike: {
    cast(e, g, p, w) {
      const to = behindSpot(e, g, p.behind) || { x: e.pos.x, y: e.pos.y };
      g.hazards.circle({ x: to.x, y: to.y, radius: e.radius, delay: w, damage: 0 }); // the shadow
      const v = toward({ pos: to }, g.player.pos);
      g.hazards.cone({ x: to.x, y: to.y, dir: { x: v.x, y: v.y }, radius: p.radius + e.radius * 0.5, arcDeg: p.arcDeg, delay: w, damage: p.damage * e.mods.attack });
      e.hidden = true;
      e.ai.strikeAt = to;
      g.events.emit('bossSmoke', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
    },
    fire(e, g) { if (e.ai.strikeAt) appear(e, g, e.ai.strikeAt); e.ai.strikeAt = null; },
  },
  // assassin: it and its clones mark lanes at the player from three sides, then all dash at once
  cloneCharge: {
    cast(e, g, p, w, dir) {
      const c = g.player.pos, lanes = [{ from: { x: e.pos.x, y: e.pos.y }, dir }];
      const d0 = Math.max(220, Math.hypot(c.x - e.pos.x, c.y - e.pos.y)), base = Math.atan2(e.pos.y - c.y, e.pos.x - c.x);
      for (let i = 1; i <= (p.clones || 2); i++) {
        const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * ((p.spread || 110) * Math.PI) / 180;
        const from = g.arena.resolveCircle({ x: c.x + Math.cos(a) * d0, y: c.y + Math.sin(a) * d0 }, e.radius).pos;
        const v = toward({ pos: from }, c);
        lanes.push({ from, dir: { x: v.x, y: v.y } });
      }
      for (const l of lanes) g.hazards.line({ x: l.from.x, y: l.from.y, dir: l.dir, length: p.length, width: p.width, delay: w, damage: p.damage * e.mods.attack });
      e.ai.dir = { ...lanes[0].dir };
      e.ai.cloneLanes = lanes.slice(1).map((l) => ({ from: l.from, to: { x: l.from.x + l.dir.x * p.length, y: l.from.y + l.dir.y * p.length } }));
    },
    fire(e, g, p) {
      g.events.emit('cloneDash', { enemy: e, lanes: e.ai.cloneLanes || [] });
      const d = { ...e.ai.dir }, sp = p.length / p.dashTime;
      let t = p.dashTime;
      return { update(dt) { t -= dt; return t > 0 ? { x: d.x * sp, y: d.y * sp } : null; } };
    },
  },
  // assassin, whole room: clones cross the room one after another along marked lanes; find the gaps
  crossing: {
    hold: (p, e) => (p.count + e.ai.extra - 1) * p.gap,
    cast(e, g, p, w) {
      const ar = g.arena, n = p.count + e.ai.extra;
      for (let k = 0; k < n; k++) {
        const across = k % 2 === 0, span = across ? ar.height : ar.width, at = span * (0.12 + 0.76 * g.rng());
        const lane = across ? { x: 0, y: at, dir: { x: 1, y: 0 }, length: ar.width } : { x: at, y: 0, dir: { x: 0, y: 1 }, length: ar.height };
        g.hazards.line({ ...lane, width: p.width, delay: w + k * p.gap, damage: p.damage * e.mods.attack });
      }
    },
  },
  // golem: a slam where the player stands that leaves the ground cracked (it keeps hurting a while)
  crackSlam: {
    cast(e, g, p, w) {
      const c = g.player.pos;
      g.hazards.circle({ x: c.x, y: c.y, radius: p.radius, delay: w, damage: p.damage * e.mods.attack });
      g.hazards.pool({ x: c.x, y: c.y, radius: p.radius * 0.85, delay: w, duration: p.crack.duration, tick: p.crack.tick, damage: p.crack.damage * e.mods.attack, owner: e, style: 'crack' });
    },
  },
  // golem: a boulder thrown at the player; where it lands it stands as a pillar for a while (it never
  // lands on anyone — then it only hurts)
  boulder: {
    cast(e, g, p, w) {
      const c = g.player.pos;
      g.hazards.circle({ x: c.x, y: c.y, radius: p.radius, delay: w, damage: p.damage * e.mods.attack });
      e.ai.boulderAt = { x: c.x, y: c.y };
    },
    fire(e, g, p) {
      const q = e.ai.boulderAt;
      e.ai.boulderAt = null;
      if (!q) return;
      const half = p.size / 2, rect = { x: q.x - half, y: q.y - half, w: p.size, h: p.size };
      const hits = (o, r) => { const cx = Math.max(rect.x, Math.min(o.x, rect.x + rect.w)), cy = Math.max(rect.y, Math.min(o.y, rect.y + rect.h)); return Math.hypot(o.x - cx, o.y - cy) < r + 6; };
      if (hits(g.player.pos, g.player.radius)) return;
      for (const m of g.enemies.all()) if (m.alive && !m.dying && hits(m.pos, m.radius)) return;
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > g.arena.width || rect.y + rect.h > g.arena.height) return;
      g.arena.addTemp(rect, p.last);
      g.events.emit('boulderLand', { pos: { x: q.x, y: q.y }, size: p.size });
    },
  },
  // golem, whole room: falling rocks everywhere but a few safe cells
  earthquake: {
    cast(e, g, p, w) {
      const ar = g.arena, cells = [];
      for (let y = p.cell / 2; y < ar.height; y += p.cell) for (let x = p.cell / 2; x < ar.width; x += p.cell) cells.push({ x, y });
      const safe = new Set();
      while (safe.size < Math.min(p.safe, cells.length)) safe.add(Math.floor(g.rng() * cells.length) % cells.length);
      cells.forEach((c, i) => { if (!safe.has(i)) g.hazards.circle({ x: c.x, y: c.y, radius: p.cell * 0.72, delay: w + g.rng() * 0.25, damage: p.damage * e.mods.attack }); });
    },
  },
  summon: { cast() {}, fire(e, g, p) { bossCore.summon(e, g, p); } },
  // a thick band sweeps out across the whole room: too fast to outrun — roll through it
  band: {
    cast(e, g, p, w) {
      const R = Math.hypot(g.arena.width, g.arena.height);
      g.hazards.ring({ x: e.pos.x, y: e.pos.y, delay: w, speed: p.speed, maxRadius: R, thickness: p.thickness, damage: p.damage * e.mods.attack });
    },
  },
  // the whole room in rings around the boss, struck one after another (outward or inward)
  zones: {
    hold: (p, e) => (p.count + e.ai.extra - 1) * p.stagger,
    cast(e, g, p, w) {
      const n = p.count + e.ai.extra, R = Math.hypot(g.arena.width, g.arena.height) / 2 + 80, step = R / n;
      const inward = g.rng() < 0.5;
      for (let k = 0; k < n; k++) {
        const order = inward ? n - 1 - k : k;
        g.hazards.annulus({ x: e.pos.x, y: e.pos.y, r0: order * step, r1: (order + 1) * step, delay: w + k * p.stagger, damage: p.damage * e.mods.attack });
      }
    },
  },
  // barrage time: bursts, spirals, aimed fans and a rain of circles all over the room, then a long rest
  barrage: {
    cast(e, g, p, w) { g.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: p.tellRadius + e.radius, delay: w, damage: 0 }); },
    fire(e, g, p) {
      let t = p.duration, next = 0, wave = 0, spin = g.rng() * TAU;
      const ar = g.arena;
      return {
        update(dt) {
          t -= dt; next -= dt;
          if (next <= 0 && t > 0.3) {
            next = p.wave;
            const kind = wave++ % 4;
            if (kind === 0) { const n = 14 + e.ai.extra * 2; for (let k = 0; k < n; k++) { const a = spin + (k * TAU) / n; shoot(e, g, { x: Math.cos(a), y: Math.sin(a) }, p); } spin += 0.25; }
            else if (kind === 1) { for (let k = 0; k < 4; k++) { const a = spin + (k * TAU) / 4; for (let j = 0; j < 3; j++) shoot(e, g, { x: Math.cos(a + j * 0.12), y: Math.sin(a + j * 0.12) }, p); } spin += 0.6; }
            else if (kind === 2) { const v = toward(e, g.player.pos); for (let k = -3; k <= 3; k++) shoot(e, g, rot(v, k * 0.16), p); }
            else { for (let k = 0; k < 6 + e.ai.extra; k++) { const q = freeSpot(g, { x: ar.width / 2, y: ar.height / 2 }, 0, Math.max(ar.width, ar.height) / 2, 10) || g.player.pos; g.hazards.circle({ x: q.x, y: q.y, radius: p.rainRadius, delay: 0.7, damage: p.damage * e.mods.attack }); } }
          }
          return t > 0 ? { x: 0, y: 0 } : null;
        },
      };
    },
  },
  // a tight ring of bombers around the player: marks first, then they appear and rush in
  bombers: {
    cast(e, g, p, w) {
      const n = p.count + e.ai.extra * 2, c = g.player.pos, spots = [];
      for (let k = 0; k < n; k++) {
        const a = (k * TAU) / n + g.rng() * 0.3;
        const q = g.arena.resolveCircle({ x: c.x + Math.cos(a) * p.ring, y: c.y + Math.sin(a) * p.ring }, 12).pos;
        spots.push(q);
        g.hazards.circle({ x: q.x, y: q.y, radius: 18, delay: w, damage: 0 });
      }
      e.ai.spots = spots;
    },
    fire(e, g) {
      const info = g.dungeon && g.dungeon.info;
      for (const q of e.ai.spots || []) {
        g.enemies.spawnAt('bomber', q, { ...(info ? info.mods : {}), hp: 1, minion: true });
        g.events.emit('minionSpawn', { pos: q, zone: 'near' });
      }
      e.ai.spots = null;
    },
  },
  // minions hit harder and move faster for a while
  empower: {
    cast() {},
    fire(e, g, p) {
      for (const m of g.enemies.all()) {
        if (m === e || !m.alive || m.dying || m.isBoss || m.empowered) continue;
        m.mods = { ...m.mods, attack: m.mods.attack * (1 + p.attack), speed: m.mods.speed * (1 + p.speed) };
        m.empowered = true;
        e.ai.buffs.push({ m, t: p.duration, attack: p.attack, speed: p.speed });
      }
      g.events.emit('bossEmpower', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
    },
  },
  // while any minion lives, the boss takes far less damage
  shield: { cast() {}, fire(e, g, p) { e.ai.shield = p.duration; g.events.emit('bossShield', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } }); } },
};
export const PATTERN_KINDS = Object.keys(EXEC);

export const bossCore = {
  init(e) {
    const t = e.tcfg, b = t.basics, lv = e.mods.level || 1;
    e.level = lv;
    e.ai = {
      state: 'chase', t: t.openingDelay, pattern: null, last: null, enraged: false, dir: { x: -1, y: 0 }, task: null,
      bt: b ? b.every : Infinity, bw: 0, bi: 0,
      rhythm: rhythmFor(e.root, 'boss', Math.min(4, lv)), tele: Math.max(0.6, 1 - 0.08 * (lv - 1)), extra: Math.floor((lv - 1) / 2),
      k: Math.min(1, 0.5 + 0.25 * (lv - 1)), // how much of the full aggression this level shows (1 from level 3)
      wait: 0, shield: 0, buffs: [], strafe: e.id % 2 ? 1 : -1,
    };
  },

  // stunned: whatever it was winding up is dropped; the pattern clock and basic rhythm start over
  onStun(e) {
    const s = e.ai, t = e.tcfg;
    s.state = 'chase';
    s.t = t.retryDelay + 0.6;
    s.task = null;
    if (t.basics) s.bt = t.basics.every;
    s.bw = 0;
  },

  mods(e) { return e.ai.enraged ? e.tcfg.enrage : CALM; },

  minions(e, game) { return game.enemies.all().filter((m) => m !== e && m.alive && !m.dying && !m.isBoss && m.type !== 'sigil' && m.type !== 'clone').length; },

  // an assassin's clones still standing
  clones(e, game) { return game.enemies.all().filter((m) => m.type === 'clone' && m.cloneOf === e && m.alive && !m.dying); },

  // clones around the player, one of them real (assassin quest)
  spawnClones(e, game) {
    const n = ((e.tcfg.clones && e.tcfg.clones.count) || 3) + e.ai.extra, made = [];
    const info = game.dungeon && game.dungeon.info, base = e.root.types.clone;
    for (let i = 0; i < n; i++) {
      const q = freeSpot(game, game.player.pos, 220, 420, e.radius) || freeSpot(game, e.pos, 80, 300, e.radius);
      if (!q) continue;
      const c = game.enemies.spawnAt('clone', q, { ...(info ? info.mods : {}), minion: true, noReward: true, size: e.radius / base.radius });
      c.hp = c.maxHp = 1;
      c.cloneOf = e;
      made.push(c);
      game.events.emit('minionSpawn', { pos: q, zone: 'near' });
    }
    if (made.length) made[Math.floor(game.rng() * made.length) % made.length].real = true;
  },

  pick(e, game) {
    const t = e.tcfg, n = this.minions(e, game);
    const exposed = e.ai.qphase === 'exposed';
    const z = game.config.enemies.summon, floor = (game.dungeon && game.dungeon.floor) || 1;
    const names = (e.patterns || Object.keys(t.patterns)).filter((name) => {
      const p = t.patterns[name];
      if (!p || !EXEC[p.kind]) return false;
      if (exposed && (p.kind === 'summon' || p.kind === 'bombers')) return false; // the opening stays open
      if (p.kind === 'summon') return n < p.maxMinions + Math.floor((z ? z.capPerFloor : 0) * (floor - 1));
      if (p.kind === 'empower' || p.kind === 'shield') return n > 0 && !(p.kind === 'shield' && e.ai.shield > 0);
      return true;
    });
    if (names.length === 0) return null;
    const fresh = names.length > 1 ? names.filter((x) => x !== e.ai.last) : names;
    return fresh[Math.floor(game.rng() * fresh.length) % fresh.length];
  },

  // windup length of a pattern at this moment: its base, the beat's telegraph kind, the boss level, enrage
  windupOf(e, p, beat) {
    return teleTime(e.root, p.windup, beat.tele) * e.ai.tele * this.mods(e).windup;
  },

  start(e, game, name) {
    const p = e.tcfg.patterns[name], s = e.ai, m = this.mods(e);
    const beat = s.rhythm.next();
    const windup = this.windupOf(e, p, beat);
    const v = toward(e, game.player.pos);
    s.dir = { x: v.x, y: v.y };
    const ex = EXEC[p.kind];
    ex.cast(e, game, p, windup, s.dir);
    s.state = 'windup';
    s.t = windup + (ex.hold ? ex.hold(p, e) : 0);
    s.pattern = name;
    s.last = name;
    s.wait = beat.wait * m.cooldown;
    game.events.emit('bossPattern', { enemy: e, pattern: name, kind: p.kind, pos: { x: e.pos.x, y: e.pos.y } });
  },

  // basic attack around the boss (circle / cone / ring of small circles); the boss holds still for it
  basic(e, game) {
    const b = e.tcfg.basics, s = e.ai, m = this.mods(e);
    const a = b.list[s.bi % b.list.length];
    s.bi += 1;
    const windup = a.windup * m.windup;
    const v = toward(e, game.player.pos), dir = { x: v.x, y: v.y };
    const dmg = (a.damage || 0) * e.mods.attack;
    if (a.kind === 'circle') game.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: a.radius, delay: windup, damage: dmg });
    else if (a.kind === 'cone') game.hazards.cone({ x: e.pos.x, y: e.pos.y, dir, radius: a.radius + e.radius * 0.5, arcDeg: a.arcDeg, delay: windup, damage: dmg });
    else if (a.kind === 'circles') {
      const base = Math.atan2(dir.y, dir.x);
      for (let i = 0; i < a.count; i++) {
        const ang = base + (i / a.count) * TAU;
        game.hazards.circle({ x: e.pos.x + Math.cos(ang) * a.distance, y: e.pos.y + Math.sin(ang) * a.distance, radius: a.radius, delay: windup, damage: dmg });
      }
    }
    s.state = 'basic';
    s.bw = windup + a.recover;
    s.bt = b.every * m.cooldown;
    game.events.emit('bossBasic', { enemy: e, name: a.name, kind: a.kind, pos: { x: e.pos.x, y: e.pos.y } });
  },

  // where a minion appears: around the boss, or near / mid / far from the player
  summonPoint(e, game, i, n) {
    const z = game.config.enemies.summon, rng = game.rng, ar = game.arena;
    const zones = e.tcfg.summonZones || z.zones; // summoners also call minions out anywhere on the map
    let zone = 'boss', r = rng() * Object.values(zones).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(zones)) { r -= zones[k]; if (r <= 0) { zone = k; break; } }
    if (zone === 'map') {
      const q = freeSpot(game, { x: ar.width / 2, y: ar.height / 2 }, 0, Math.max(ar.width, ar.height) / 2, 16);
      if (q) return { pos: q, zone };
      zone = 'far';
    }
    let c, d;
    if (zone === 'boss') { c = e.pos; d = e.radius + (e.tcfg.summonRing || 50); }
    else { c = game.player.pos; d = z[zone][0] + rng() * (z[zone][1] - z[zone][0]); }
    const a = zone === 'boss' ? (i / n) * TAU + rng() * 0.5 : rng() * TAU;
    const pad = 40;
    const q = { x: Math.max(pad, Math.min(ar.width - pad, c.x + Math.cos(a) * d)), y: Math.max(pad, Math.min(ar.height - pad, c.y + Math.sin(a) * d)) };
    return { pos: ar.resolveCircle(q, 16).pos, zone };
  },

  summon(e, game, p) {
    const z = game.config.enemies.summon, floor = (game.dungeon && game.dungeon.floor) || 1;
    const scale = 1 + (z ? z.perFloor : 0) * (floor - 1);
    const cap = p.maxMinions + Math.floor((z ? z.capPerFloor : 0) * (floor - 1));
    const room = Math.max(0, cap - this.minions(e, game));
    const list = [];
    const lk = e.ai && e.ai.k != null ? 0.6 + 0.4 * e.ai.k : 1; // fewer at low boss levels
    for (let i = 0; i < Math.round(p.count * scale * lk); i++) list.push(p.type);
    for (let i = 0; i < Math.round((p.extraCount || 0) * scale * lk); i++) list.push(p.extraType);
    const info = game.dungeon && game.dungeon.info;
    const mods = { ...(info ? info.mods : {}), minion: true }; // minions press the attack on their own
    list.slice(0, room).forEach((type, i, arr) => {
      const { pos, zone } = z ? this.summonPoint(e, game, i, arr.length) : { pos: { x: e.pos.x, y: e.pos.y }, zone: 'boss' };
      game.enemies.spawnAt(type, pos, mods);
      game.events.emit('minionSpawn', { pos, zone });
    });
  },

  // ---- quests: what makes the boss open to harm ----
  // minions (summoner): untouchable while its minions live; sigils (mage): while its sigils stand;
  // guard (warrior): a guard soaks blows until enough of them land. Then an opening of `exposed` s.
  sigils(e, game) { return game.enemies.all().filter((m) => m.alive && !m.dying && m.type === 'sigil'); },

  // the quest in force: a founder (floor 100) changes it with each phase (e.ai.quest); others keep their type's
  questOf(e) { return e.ai && e.ai.quest !== undefined ? e.ai.quest : e.tcfg.quest; },

  raiseGuard(e, game) {
    const t = e.tcfg, s = e.ai, q = this.questOf(e);
    if (q === 'backWeak') return; // a golem is never untouchable: its front is guarded instead
    s.qphase = 'guarded';
    if (q === 'minions') {
      const p = Object.values(t.patterns).find((x) => x.kind === 'summon');
      if (p) this.summon(e, game, p);
    } else if (q === 'sigils') {
      const ar = game.arena, n = t.sigils.count + s.extra;
      const info = game.dungeon && game.dungeon.info;
      for (let i = 0; i < n; i++) {
        const q = freeSpot(game, { x: ar.width / 2, y: ar.height / 2 }, 0, Math.max(ar.width, ar.height) / 2, 28);
        if (!q) continue;
        game.enemies.spawnAt('sigil', q, { ...(info ? info.mods : {}), minion: true });
        game.events.emit('minionSpawn', { pos: q, zone: 'map' });
      }
    } else if (q === 'guard') {
      e.guardMax = e.maxHp * (t.guardFrac || 0.12);
      e.guard = e.guardMax;
    } else if (q === 'clones') this.spawnClones(e, game);
    if (q) game.events.emit('bossGuard', { enemy: e, quest: q, pos: { x: e.pos.x, y: e.pos.y } });
  },

  quest(e, dt, game) {
    const t = e.tcfg, s = e.ai, q = this.questOf(e);
    if (!q || q === 'backWeak') { e.immune = false; return; }
    if (s.qphase === 'guarded') {
      const done = q === 'minions' ? this.minions(e, game) === 0 : q === 'sigils' ? this.sigils(e, game).length === 0
        : q === 'clones' ? !this.clones(e, game).some((c) => c.real) : !(e.guard > 0);
      e.immune = !done && q !== 'guard';
      if (done) {
        s.qphase = 'exposed';
        s.qt = s.exposedFor || t.exposed || 5;
        e.immune = false;
        e.guard = 0;
        if (q === 'clones') for (const c of this.clones(e, game)) { c.dying = true; c.deathTimer = e.root.deathTime; } // the fakes go up in smoke
        game.events.emit('bossExposed', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
      }
    } else {
      e.immune = false;
      s.qt -= dt;
      if (s.qt <= 0 && s.state === 'chase') this.raiseGuard(e, game);
    }
  },

  // per-step bookkeeping shared by every brain: enrage, shield, minion buffs
  upkeep(e, dt, game) {
    const t = e.tcfg, s = e.ai;
    if (!s.enraged && e.hp <= e.maxHp * t.enrageAt) {
      s.enraged = true;
      game.events.emit('bossEnrage', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
    }
    if (s.shield > 0) s.shield -= dt;
    e.shieldOn = s.shield > 0 && this.minions(e, game) > 0;
    for (let i = s.buffs.length - 1; i >= 0; i--) {
      const b = s.buffs[i];
      b.t -= dt;
      if (b.t <= 0 || !b.m.alive) {
        b.m.mods = { ...b.m.mods, attack: b.m.mods.attack / (1 + b.attack), speed: b.m.mods.speed / (1 + b.speed) };
        b.m.empowered = false;
        s.buffs.splice(i, 1);
      }
    }
  },

  update(e, dt, game, brain) {
    const t = e.tcfg, s = e.ai;
    this.upkeep(e, dt, game);
    if (!s.opened) { // summoners arrive with their minions already attacking; mages raise their sigils
      s.opened = true;
      this.raiseGuard(e, game);
    }
    this.quest(e, dt, game);
    if (s.state === 'basic') { // the pattern clock waits while a basic attack plays out
      s.bw -= dt;
      if (s.bw <= 0) s.state = 'chase';
      return { x: 0, y: 0 };
    }
    if (s.state === 'act') {
      const mv = s.task ? s.task.update(dt) : null;
      if (mv) return mv;
      s.task = null;
      s.state = 'recover';
      s.t = t.patterns[s.pattern].recover;
      return { x: 0, y: 0 };
    }
    s.t -= dt;
    if (s.state === 'windup') {
      if (s.t <= 0) {
        const p = t.patterns[s.pattern], ex = EXEC[p.kind];
        const task = ex.fire ? ex.fire(e, game, p, s.dir) : null;
        if (task) { s.state = 'act'; s.task = task; }
        else { s.state = 'recover'; s.t = p.recover; }
      }
      return { x: 0, y: 0 };
    }
    if (s.state === 'recover') {
      if (s.t <= 0) { s.state = 'chase'; s.t = s.wait; }
      return { x: 0, y: 0 };
    }
    // chase / keep distance until the next beat
    if (s.t <= 0) {
      const name = this.pick(e, game);
      if (name) { this.start(e, game, name); return { x: 0, y: 0 }; }
      s.t = t.retryDelay;
    }
    const v = toward(e, game.player.pos);
    if (t.basics) {
      s.bt -= dt;
      if (s.bt <= 0 && v.d - e.radius <= t.basics.triggerRange) { this.basic(e, game); return { x: 0, y: 0 }; }
    }
    const mv = brain.move(e, game, v, dt);
    const sp = this.mods(e).speed * (0.8 + 0.2 * s.k);
    return { x: mv.x * sp, y: mv.y * sp };
  },
};

// the brains: only how they move differs
export function makeBrain(move) {
  const brain = {
    init: (e) => bossCore.init(e),
    onStun: (e) => bossCore.onStun(e),
    update: (e, dt, game) => bossCore.update(e, dt, game, brain),
    move,
  };
  return brain;
}

// keep a distance band [near, far] from the player, circling inside it
export function keepBand(e, game, v, near, far) {
  const sp = e.speed;
  if (v.d < near) return { x: -v.x * sp, y: -v.y * sp };
  if (v.d > far) return { x: v.x * sp, y: v.y * sp };
  const s = e.ai.strafe;
  if (game.rng() < 0.004) e.ai.strafe *= -1; // change sides now and then
  return { x: -v.y * s * sp * 0.9, y: v.x * s * sp * 0.9 };
}
