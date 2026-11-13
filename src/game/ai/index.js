// Behaviour per enemy type (config.enemies.types[*].ai). Types without an entry use the default
// melee behaviour in Enemy (chase, counterattack when hit).
import { archerAI } from './archer.js';
import { wraithAI } from './wraith.js';
import { bossAI } from './boss.js';
import { spearmanAI } from './spearman.js';
import { warriorAI } from './warrior.js';
import { mageAI } from './mage.js';
import { rangedAI } from './ranged.js';
import { summonerAI } from './summoner.js';
import { bomberAI } from './bomber.js';
import { sigilAI } from './sigil.js';

export const AI = { archer: archerAI, wraith: wraithAI, boss: bossAI, spearman: spearmanAI, warrior: warriorAI, mage: mageAI, ranged: rangedAI, summoner: summonerAI, bomber: bomberAI, sigil: sigilAI };
export const BOSS_TYPES = ['warrior', 'mage', 'ranged', 'summoner'];
