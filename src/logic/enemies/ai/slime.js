// Splitting slime (61층~, 9.7): crawls up slowly; close to the player it crouches (a warned circle where the
// player stands) and throws itself there. When it falls it splits in two, twice (big 1 -> 2 -> small 4);
// the split ones are smaller, weaker and quicker and give nothing (Game.splitSlime).
export const slimeAI = {
  init(e) { e.ai = { cd: e.root.ai.slime.firstLeap + ((e.id * 0.37) % 1), leap: null }; },
  onStun(e) { e.ai.leap = null; },
  update(e, dt, game) {
    const s = e.ai, p = game.player.pos, A = e.root.ai.slime;
    if (s.leap) {
      s.leap.t -= dt;
      if (s.leap.t <= 0) { s.leap = null; return { x: 0, y: 0 }; }
      if (s.leap.t > A.fly) return { x: 0, y: 0 }; // crouching
      const sp = s.leap.dist / A.fly;
      return { x: s.leap.dir.x * sp, y: s.leap.dir.y * sp };
    }
    s.cd -= dt;
    const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    if (s.cd <= 0 && e.aggressive && d - e.radius - game.player.radius <= A.leapRange) {
      s.cd = A.leapEvery;
      s.leap = { t: A.crouch + A.fly, dir: { x: dx / d, y: dy / d }, dist: Math.max(0, d - e.radius * 0.5) };
      game.hazards.circle({ x: p.x, y: p.y, radius: e.radius * A.warnRadiusMul, delay: A.crouch + A.fly, damage: e.attack, owner: e });
      return { x: 0, y: 0 };
    }
    if (d < e.radius + game.player.radius) return { x: 0, y: 0 };
    return { x: (dx / d) * e.speed, y: (dy / d) * e.speed };
  },
};
