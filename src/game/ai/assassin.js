// Assassin bosses (Phase 6, 2.1): keep a middle distance and now and then vanish into smoke — a shadow
// shows behind or beside the player first, then the boss steps out of it. Its quest is its clones:
// while they stand the boss cannot be hurt; hitting the real one (it breathes) opens it up.
import { bossCore, keepBand, behindSpot, appear } from './bossCore.js';

const SMOKE_EVERY = [4, 6]; // seconds between vanishings while it waits for its next pattern
const SHADOW_TIME = 0.5;    // how long the shadow shows before it appears

export const assassinAI = {
  init(e) {
    bossCore.init(e);
    e.ai.smoke = SMOKE_EVERY[0];
    e.ai.vanish = null; // { t, to } while in the smoke
  },

  onStun(e) {
    e.hidden = false;
    e.ai.vanish = null;
    bossCore.onStun(e);
  },

  update(e, dt, game) {
    const s = e.ai;
    if (s.vanish) { // in the smoke: nothing else happens until it steps out of its shadow
      s.vanish.t -= dt;
      if (s.vanish.t <= 0) { appear(e, game, s.vanish.to); s.vanish = null; }
      return { x: 0, y: 0 };
    }
    return bossCore.update(e, dt, game, assassinAI);
  },

  move(e, game, v, dt) {
    const s = e.ai;
    s.smoke -= dt;
    if (s.smoke <= 0) {
      s.smoke = SMOKE_EVERY[0] + game.rng() * (SMOKE_EVERY[1] - SMOKE_EVERY[0]);
      const to = behindSpot(e, game, 120);
      if (to) {
        s.vanish = { t: SHADOW_TIME, to };
        e.hidden = true;
        game.hazards.circle({ x: to.x, y: to.y, radius: e.radius, delay: SHADOW_TIME, damage: 0 }); // the shadow
        game.events.emit('bossSmoke', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
        return { x: 0, y: 0 };
      }
    }
    return keepBand(e, game, v, ...(e.ai.keep || e.tcfg.keep || [200, 420])); // (the founder's assassin phase keeps its own band)
  },
};
