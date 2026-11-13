// Warrior bosses: walk straight at the player and fight up close (slams, cleaves, charges, combos).
import { makeBrain } from './bossCore.js';

export const warriorAI = makeBrain((e, game, v) => {
  if (v.d < e.radius + game.player.radius + e.tcfg.stopDistance) return { x: 0, y: 0 };
  return { x: v.x * e.speed, y: v.y * e.speed };
});
