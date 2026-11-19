// Mage bosses: hold the middle distance and circle; spells land on the player (fields, seekers,
// spirals) and some blink close to cast.
import { makeBrain, keepBand } from './bossCore.js';

export const mageAI = makeBrain((e, game, v) => keepBand(e, game, v, ...(e.tcfg.keep || [280, 460])));
