// Assassin bosses (Phase 6, 2.1): keep a middle distance and now and then vanish into smoke — a shadow
// shows behind or beside the player first, then the boss steps out of it. Its quest is its clones: it
// vanishes and walks among them as the real one (they all look alike), taking no damage; struck, it
// steps out in the middle of the room, open to harm.
import { bossCore, keepBand, behindSpot, appear } from './bossCore.js';
import { cloneStep, cloneState } from './clone.js';

// among its clones the boss is one of them: quest and upkeep go on, it moves and swings like a clone (null: not hiding)
export function hideAmongClones(e, dt, game) {
  if (!e.ai.opened || !bossCore.hiding(e)) return null;
  bossCore.upkeep(e, dt, game);
  bossCore.quest(e, dt, game);
  if (!bossCore.hiding(e)) return null;
  return cloneStep(e, e.ai.cl || (e.ai.cl = cloneState(e)), e, dt, game);
}

export const assassinAI = {
  init(e) {
    bossCore.init(e);
    e.ai.smoke = e.root.ai.assassin.smokeEvery[0]; // smokeEvery: seconds between vanishings while it waits for its next pattern
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
    return hideAmongClones(e, dt, game) || bossCore.update(e, dt, game, assassinAI);
  },

  move(e, game, v, dt) {
    const s = e.ai, A = e.root.ai.assassin;
    s.smoke -= dt;
    if (s.smoke <= 0) {
      s.smoke = A.smokeEvery[0] + game.rng() * (A.smokeEvery[1] - A.smokeEvery[0]);
      const to = behindSpot(e, game, A.behindDistance);
      if (to) {
        s.vanish = { t: A.shadowTime, to }; // shadowTime: how long the shadow shows before it appears
        e.hidden = true;
        game.hazards.circle({ x: to.x, y: to.y, radius: e.radius, delay: A.shadowTime, damage: 0 }); // the shadow
        game.events.emit('bossSmoke', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
        return { x: 0, y: 0 };
      }
    }
    return keepBand(e, game, v, ...(e.ai.keep || e.tcfg.keep || A.keepBand)); // (the founder's assassin phase keeps its own band)
  },
};
