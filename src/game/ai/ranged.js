// Ranged bosses: back away when the player closes in, shoot from afar (volleys, fans, rotating lines).
// Pillars stop their shots.
import { makeBrain, keepBand } from './bossCore.js';

export const rangedAI = makeBrain((e, game, v) => keepBand(e, game, v, ...(e.tcfg.keep || [260, 520])));
