// The pixelfx effects as the game uses them, tuned for the small Puny-sized hero (shared by the screen test and the lab page).
// scale shrinks an effect round its origin (pixelfx draws for a ~40 px actor, ours is ~16 px); light tones down the bloom;
// life (s) cuts a long effect short so its dust never buries the fight.
import * as swordSlash from './pixelfx/fx/melee/sword-slash.js';
import * as doubleSlash from './pixelfx/fx/melee/double-slash.js';
import * as spinSlash from './pixelfx/fx/melee/spin-slash.js';
import * as hitSpark from './pixelfx/fx/impacts/hit-spark.js';
import * as critHit from './pixelfx/fx/impacts/crit-hit.js';
import * as groundSlam from './pixelfx/fx/impacts/ground-slam.js';
import * as damageNumber from './pixelfx/fx/ui/damage-number.js';
import * as flyingBlade from './fx/flying-blade.js';

export const GOLD = ['#3a2a10', '#7a5a1a', '#c8962a', '#f0c850', '#fff0a0', '#fffbe0', '#ffffff'];
export const VIOLET = ['#2a0a3a', '#5a1a8a', '#8a3ac8', '#b86af0', '#e0b0ff', '#f4e4ff', '#ffffff'];
const GOLD8 = ['#1a1005', '#4a3008', '#8c6414', '#d49a2e', '#ffc84a', '#ffe08a', '#fff4cc', '#ffffff'];

export const FX = {
  slash: { label: '일반 베기', mod: swordSlash, o: { scale: 0.72 }, dir: true },
  slashDash: { label: '대쉬 베기', mod: swordSlash, o: { scale: 0.72, palette: GOLD }, dir: true },
  finisher: { label: '연쇄 마무리 (X 베기)', mod: doubleSlash, o: { scale: 0.72, palette: GOLD }, dir: true },
  spin: { label: '회전 베기', mod: spinSlash, o: { radius: 84, scale: 0.7 } },
  hit: { label: '피격 불꽃', mod: hitSpark, o: { scale: 0.55, height: 16 }, group: 'hit' },
  hitCrit: { label: '치명타 불꽃', mod: hitSpark, o: { scale: 0.65, height: 14, palette: GOLD }, group: 'hit' },
  hitHero: { label: '주인공 피격', mod: hitSpark, o: { scale: 0.55, height: 16, palette: VIOLET }, group: 'hit' },
  bossCrit: { label: '보스 치명타', mod: critHit, o: { scale: 0.7, height: 32, light: 0.7 }, group: 'hit' },
  // no smoke anywhere: the ground slams keep the flash, cracks, shock fronts and rocks
  land: { label: '점프 착지', mod: groundSlam, o: { scale: 0.6, reach: 104, light: 0.7, smoke: false }, life: 0.8 },
  bossSlam: { label: '보스 내려찍기', mod: groundSlam, o: { scale: 0.7, reach: 84, light: 0.7, smoke: false }, life: 0.8 },
  quake: { label: '보스 충격파', mod: groundSlam, o: { scale: 0.7, light: 0.6, smoke: false }, life: 0.6 },
  num: { label: '데미지 숫자', mod: damageNumber, o: {}, group: 'num' },
  numCrit: { label: '치명타 숫자', mod: damageNumber, o: { palette: GOLD8 }, group: 'num' },
  // 질풍: the dash's gold crescent (same radius and width as the dash slash at its scale) flying along its angle
  wave: { label: '질풍 금빛 칼날', mod: flyingBlade, o: { palette: GOLD, radius: 24, width: 7 } },
};

// a side-view swing turned to face angle th: mirrored when facing left, its arc centre (about (6, -26) px from the
// effect's origin, times its scale) carried 8 px ahead of a chest 8 px above the feet
export function facing(th, scale = 1) {
  const flip = Math.cos(th) < 0, angle = flip ? th - Math.PI : th;
  const lx = (flip ? -6 : 6) * scale, ly = -26 * scale, c = Math.cos(angle), s = Math.sin(angle);
  return { flip, angle, lx: Math.cos(th) * 8 - (lx * c - ly * s), ly: Math.sin(th) * 8 - 8 - (lx * s + ly * c) };
}
