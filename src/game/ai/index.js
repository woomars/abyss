// Behaviour per enemy type (config.enemies.types[*].ai). Types without an entry use the default
// melee behaviour in Enemy (chase, counterattack when hit).
import { archerAI } from './archer.js';
import { wraithAI } from './wraith.js';
import { bossAI } from './boss.js';

export const AI = { archer: archerAI, wraith: wraithAI, boss: bossAI };
