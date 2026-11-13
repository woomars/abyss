// Summoner bosses: stay far back and fight through minions (summon, empower, shield while minions live).
import { makeBrain, keepBand } from './bossCore.js';

export const summonerAI = makeBrain((e, game, v) => keepBand(e, game, v, ...(e.tcfg.keep || [380, 640])));
