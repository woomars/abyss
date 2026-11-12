// Boss: chase -> pick a pattern -> windup (the telegraph is the hazard's own delay) -> recover -> chase.
// Patterns come from the floor (enemy.patterns) or the type config. Under enrageAt hp the boss moves
// faster and telegraphs/rests shorter. Between patterns, while the player is close, the boss also
// swings basic attacks around itself on a fixed rhythm, cycling through its list (tcfg.basics).
// Returns the movement vector for this step.
const rand = ([a, b], rng) => a + rng() * (b - a);
const CALM = { speed: 1, windup: 1, cooldown: 1 };

export const bossAI = {
  init(e) {
    const b = e.tcfg.basics;
    e.ai = { state: 'chase', t: e.tcfg.openingDelay, pattern: null, last: null, enraged: false, dir: { x: -1, y: 0 },
      bt: b ? b.every : Infinity, bw: 0, bi: 0 };
  },

  // stunned: whatever it was winding up is dropped; the pattern clock and basic rhythm start over
  onStun(e) {
    const s = e.ai, t = e.tcfg;
    s.state = 'chase';
    s.t = t.retryDelay + t.cooldown[0];
    if (t.basics) s.bt = t.basics.every;
    s.bw = 0;
  },

  mods(e) { return e.ai.enraged ? e.tcfg.enrage : CALM; },

  minions(e, game) { return game.enemies.all().filter((m) => m !== e && m.alive && !m.dying && !m.isBoss).length; },

  pick(e, game) {
    const t = e.tcfg;
    const names = (e.patterns || Object.keys(t.patterns)).filter((n) => {
      const p = t.patterns[n];
      return p && !(p.kind === 'summon' && this.minions(e, game) >= p.maxMinions);
    });
    if (names.length === 0) return null;
    const fresh = names.length > 1 ? names.filter((n) => n !== e.ai.last) : names;
    return fresh[Math.floor(game.rng() * fresh.length) % fresh.length];
  },

  start(e, game, name) {
    const p = e.tcfg.patterns[name], s = e.ai, m = this.mods(e);
    const windup = p.windup * m.windup;
    const pp = game.player.pos;
    const dx = pp.x - e.pos.x, dy = pp.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    s.dir = { x: dx / d, y: dy / d };
    const dmg = (p.damage || 0) * e.mods.attack;
    if (p.kind === 'cone') game.hazards.cone({ x: e.pos.x, y: e.pos.y, dir: { ...s.dir }, radius: p.radius + e.radius * 0.5, arcDeg: p.arcDeg, delay: windup, damage: dmg });
    else if (p.kind === 'ring') game.hazards.ring({ x: e.pos.x, y: e.pos.y, delay: windup, speed: p.speed, maxRadius: p.maxRadius, thickness: p.thickness, damage: dmg });
    s.state = 'windup';
    s.t = windup;
    s.pattern = name;
    s.last = name;
    game.events.emit('bossPattern', { enemy: e, pattern: name, kind: p.kind, pos: { x: e.pos.x, y: e.pos.y } });
  },

  // basic attack around the boss (circle / cone / ring of small circles); the boss holds still for it
  basic(e, game) {
    const b = e.tcfg.basics, s = e.ai, m = this.mods(e);
    const a = b.list[s.bi % b.list.length];
    s.bi += 1;
    const windup = a.windup * m.windup;
    const pp = game.player.pos;
    const dx = pp.x - e.pos.x, dy = pp.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / d, y: dy / d };
    const dmg = (a.damage || 0) * e.mods.attack;
    if (a.kind === 'circle') game.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: a.radius, delay: windup, damage: dmg });
    else if (a.kind === 'cone') game.hazards.cone({ x: e.pos.x, y: e.pos.y, dir, radius: a.radius + e.radius * 0.5, arcDeg: a.arcDeg, delay: windup, damage: dmg });
    else if (a.kind === 'circles') {
      const base = Math.atan2(dir.y, dir.x);
      for (let i = 0; i < a.count; i++) {
        const ang = base + (i / a.count) * Math.PI * 2;
        game.hazards.circle({ x: e.pos.x + Math.cos(ang) * a.distance, y: e.pos.y + Math.sin(ang) * a.distance, radius: a.radius, delay: windup, damage: dmg });
      }
    }
    s.state = 'basic';
    s.bw = windup + a.recover;
    s.bt = b.every * m.cooldown;
    game.events.emit('bossBasic', { enemy: e, name: a.name, kind: a.kind, pos: { x: e.pos.x, y: e.pos.y } });
  },

  summon(e, game, p) {
    const room = Math.max(0, p.maxMinions - this.minions(e, game));
    const list = [];
    for (let i = 0; i < p.count; i++) list.push(p.type);
    for (let i = 0; i < (p.extraCount || 0); i++) list.push(p.extraType);
    const info = game.dungeon && game.dungeon.info;
    const mods = { ...(info ? info.mods : {}), minion: true }; // minions press the attack on their own
    list.slice(0, room).forEach((type, i, arr) => {
      const a = (i / arr.length) * Math.PI * 2 + game.rng() * 0.5;
      const r = e.radius + e.tcfg.summonRing;
      game.enemies.spawnAt(type, { x: e.pos.x + Math.cos(a) * r, y: e.pos.y + Math.sin(a) * r }, mods);
    });
  },

  update(e, dt, game) {
    const t = e.tcfg, s = e.ai;
    if (!s.enraged && e.hp <= e.maxHp * t.enrageAt) {
      s.enraged = true;
      game.events.emit('bossEnrage', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
    }
    const m = this.mods(e);
    if (s.state === 'basic') { // the pattern clock waits while a basic attack plays out
      s.bw -= dt;
      if (s.bw <= 0) s.state = 'chase';
      return { x: 0, y: 0 };
    }
    s.t -= dt;
    if (s.state === 'windup') {
      if (s.t <= 0) {
        const p = t.patterns[s.pattern];
        if (p.kind === 'summon') this.summon(e, game, p);
        s.state = 'recover';
        s.t = p.recover;
      }
      return { x: 0, y: 0 };
    }
    if (s.state === 'recover') {
      if (s.t <= 0) { s.state = 'chase'; s.t = rand(t.cooldown, game.rng) * m.cooldown; }
      return { x: 0, y: 0 };
    }
    // chase
    if (s.t <= 0) {
      const name = this.pick(e, game);
      if (name) { this.start(e, game, name); return { x: 0, y: 0 }; }
      s.t = t.retryDelay;
    }
    const pp = game.player.pos;
    const dx = pp.x - e.pos.x, dy = pp.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    if (t.basics) {
      s.bt -= dt;
      if (s.bt <= 0 && d - e.radius <= t.basics.triggerRange) { this.basic(e, game); return { x: 0, y: 0 }; }
    }
    if (d < e.radius + game.player.radius + t.stopDistance) return { x: 0, y: 0 };
    const sp = e.speed * m.speed;
    return { x: (dx / d) * sp, y: (dy / d) * sp };
  },
};
