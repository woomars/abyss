// Splitting slime (61층~, 9.7): crawls up slowly; close to the player it crouches (a warned circle where the
// player stands) and throws itself there. When it falls it splits in two, twice (big 1 -> 2 -> small 4);
// the split ones are smaller, weaker and quicker and give nothing (Game.splitSlime).
const LEAP_RANGE = 110, CROUCH = 0.5, FLY = 0.2, LEAP_EVERY = 2.2;

export const slimeAI = {
  init(e) { e.ai = { cd: 1 + ((e.id * 0.37) % 1), leap: null }; },
  onStun(e) { e.ai.leap = null; },
  update(e, dt, game) {
    const s = e.ai, p = game.player.pos;
    if (s.leap) {
      s.leap.t -= dt;
      if (s.leap.t <= 0) { s.leap = null; return { x: 0, y: 0 }; }
      if (s.leap.t > FLY) return { x: 0, y: 0 }; // crouching
      const sp = s.leap.dist / FLY;
      return { x: s.leap.dir.x * sp, y: s.leap.dir.y * sp };
    }
    s.cd -= dt;
    const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    if (s.cd <= 0 && d - e.radius - game.player.radius <= LEAP_RANGE) {
      s.cd = LEAP_EVERY;
      s.leap = { t: CROUCH + FLY, dir: { x: dx / d, y: dy / d }, dist: Math.max(0, d - e.radius * 0.5) };
      game.hazards.circle({ x: p.x, y: p.y, radius: e.radius * 1.4, delay: CROUCH + FLY, damage: e.attack, owner: e });
      return { x: 0, y: 0 };
    }
    if (d < e.radius + game.player.radius) return { x: 0, y: 0 };
    return { x: (dx / d) * e.speed, y: (dy / d) * e.speed };
  },
};
