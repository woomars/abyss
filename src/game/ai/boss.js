// Older name for the warrior boss brain (kept so existing code and saves keep working).
import { bossCore } from './bossCore.js';
import { warriorAI } from './warrior.js';

export const bossAI = { ...warriorAI, summon: (e, game, p) => bossCore.summon(e, game, p) };
