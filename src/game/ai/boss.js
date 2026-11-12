// Boss: chase -> pick a pattern -> windup (the telegraph is the hazard's own delay) -> recover -> chase.
// Patterns come from the floor (enemy.patterns) or the type config. Under enrageAt hp the boss moves
// faster and telegraphs/rests shorter. Returns the movement vector for this step.
const rand = ([a, b], rng) => a + rng() * (b - a);
const CALM = { speed: 1, windup: 1, cooldown: 1 };

export const bossAI = {
  init(e) {
    e.ai = { state: 'chase', t: 1.2, pattern: null, last: null, enraged: false, dir: { x: -1, y: 0 } };
  },

  mods(e) { return e.ai.enraged ? e.tcfg.enrage : CALM; },

  minions(e, game) { return game.enemies.targetable().filter((m) => m !== e && !m.isBoss).length; },

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

  summon(e, game, p) {
    const room = Math.max(0, p.maxMinions - this.minions(e, game));
    const list = [];
    for (let i = 0; i < p.count; i++) list.push(p.type);
    for (let i = 0; i < (p.extraCount || 0); i++) list.push(p.extraType);
    const info = game.dungeon && game.dungeon.info;
    const mods = info ? { ...info.mods } : null;
    list.slice(0, room).forEach((type, i, arr) => {
      const a = (i / arr.length) * Math.PI * 2 + game.rng() * 0.5;
      const r = e.radius + 50;
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
      s.t = 0.5;
    }
    const pp = game.player.pos;
    const dx = pp.x - e.pos.x, dy = pp.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    if (d < e.radius + game.player.radius + 30) return { x: 0, y: 0 };
    const sp = e.speed * m.speed;
    return { x: (dx / d) * sp, y: (dy / d) * sp };
  },
};
