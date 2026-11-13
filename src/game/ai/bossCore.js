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

function shoot(e, game, dir, p) {
  const off = e.radius + 6;
  game.hazards.arrow({ x: e.pos.x + dir.x * off, y: e.pos.y + dir.y * off, dir: { x: dir.x, y: dir.y }, speed: p.speed, radius: p.radius, damage: p.damage * e.mods.attack, range: p.range, style: 'bolt' });
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
    fire(e, g, p, dir) {
      let t = p.dashTime;
      const sp = p.length / p.dashTime;
      return { update(dt) { t -= dt; return t > 0 ? { x: dir.x * sp, y: dir.y * sp } : null; } };
    },
  },
  // several circles around the player, landing one after another
  fields: {
    hold: (p, e) => (p.count + e.ai.extra - 1) * p.stagger,
    cast(e, g, p, w) {
      const n = p.count + e.ai.extra, c = g.player.pos;
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
  // a long thin line, then one very fast shot along it
  snipe: {
    cast(e, g, p, w, dir) { g.hazards.line({ x: e.pos.x, y: e.pos.y, dir, length: p.range, width: 10, delay: w }); },
    fire(e, g, p, dir) { shoot(e, g, dir, p); },
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

  minions(e, game) { return game.enemies.all().filter((m) => m !== e && m.alive && !m.dying && !m.isBoss).length; },

  pick(e, game) {
    const t = e.tcfg, n = this.minions(e, game);
    const z = game.config.enemies.summon, floor = (game.dungeon && game.dungeon.floor) || 1;
    const names = (e.patterns || Object.keys(t.patterns)).filter((name) => {
      const p = t.patterns[name];
      if (!p || !EXEC[p.kind]) return false;
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
    let zone = 'boss', r = rng() * (z.zones.boss + z.zones.near + z.zones.mid + z.zones.far);
    for (const k of ['boss', 'near', 'mid', 'far']) { r -= z.zones[k]; if (r <= 0) { zone = k; break; } }
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
    for (let i = 0; i < Math.round(p.count * scale); i++) list.push(p.type);
    for (let i = 0; i < Math.round((p.extraCount || 0) * scale); i++) list.push(p.extraType);
    const info = game.dungeon && game.dungeon.info;
    const mods = { ...(info ? info.mods : {}), minion: true }; // minions press the attack on their own
    list.slice(0, room).forEach((type, i, arr) => {
      const { pos, zone } = z ? this.summonPoint(e, game, i, arr.length) : { pos: { x: e.pos.x, y: e.pos.y }, zone: 'boss' };
      game.enemies.spawnAt(type, pos, mods);
      game.events.emit('minionSpawn', { pos, zone });
    });
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
    if (!s.opened) { // summoners arrive with their minions already attacking
      s.opened = true;
      if (t.ai === 'summoner') { const p = Object.values(t.patterns).find((x) => x.kind === 'summon'); if (p) this.summon(e, game, p); }
    }
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
    const sp = this.mods(e).speed;
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
  return { x: -v.y * s * sp * 0.55, y: v.x * s * sp * 0.55 };
}
