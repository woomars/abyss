// Debug only (Korean, not translated): the hero's numbers as they stand, and what the worn gear adds.
// Everything is read through the live game (combat, skills, armor), once as is and once with the gear
// taken off, so each row shows the total and the gear's share. With a boss in the room it also shows
// how many hits the boss would take.
import { zeroStats, addStats } from '../game/Stats.js';
import { levelStats } from '../game/Progress.js';

const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const num = (v) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
const sec = (v) => `${Math.round(v * 100) / 100}s`;

// the numbers of one moment (bonus stats and worn effects as the game has them now)
function read(game) {
  const b = game.bonusStats, c = game.config.combat, sk = game.skills;
  const skillMul = 1 + (b.damage || 0) + (b.skillDamage || 0);
  const spin = sk.def('spin'), jump = sk.def('rushStrike'), wave = sk.def('bladeWave');
  const land = sk.landing(jump), near = sk.waveAt(wave, wave.near || 0), far = sk.waveAt(wave, wave.range);
  const hit = (c.attackDamage + (b.attackFlat || 0)) * (1 + (b.damage || 0));
  const critChance = Math.min(1, c.critChance + (b.crit || 0)), critMul = c.critMultiplier + (b.critDamage || 0);
  return {
    maxHp: c.player.maxHp + (b.maxHp || 0),
    armor: Math.min(0.8, b.armor || 0),
    hit,
    avgHit: hit * (1 + critChance * (critMul - 1)),
    chain: game.combat.chainCount,
    chainMul: c.chain.damageMultiplier * (1 + (b.chainDamage || 0)),
    chainRange: c.chain.range * (1 + (b.chainRange || 0)),
    critChance, critMul,
    attackSpeed: b.attackSpeed || 0,
    speed: b.speed || 0,
    dashRange: c.dashRange * (1 + (b.dashRange || 0)),
    cooldown: Math.min(0.8, b.cooldown || 0),
    lifesteal: b.lifesteal || 0,
    skillDmg: skillMul - 1,
    spinDmg: spin.damage * skillMul, spinR: spin.radius, spinCd: sk.cooldownOf(spin),
    jumpDmg: land.damage * skillMul, jumpR: land.radius, jumpDist: jump.distance, jumpCd: sk.cooldownOf(jump),
    waveNear: near.damage * skillMul, waveFar: far.damage * skillMul, waveStun: near.stun, waveFarStun: far.stun,
    waveAngle: sk.waveAngle(wave), waveRange: wave.range, waveCd: sk.cooldownOf(wave),
  };
}

// the same numbers with the gear taken off (cards, essences and the level stay)
function readBare(game) {
  const keep = { b: game.bonusStats, fx: game.gearEffects, sets: game.gearSets };
  const s = addStats(zeroStats(), game.relics.stats);
  addStats(s, game.vault.essence.stats);
  addStats(s, levelStats(game.config.progress, game.vault.progress.level));
  game.bonusStats = s; game.gearEffects = new Set(); game.gearSets = {};
  try { return read(game); } finally { game.bonusStats = keep.b; game.gearEffects = keep.fx; game.gearSets = keep.sets; }
}

// rows: [label, key, type]; sections of the sheet
const FMT = {
  num, pct, sec, plus: (v) => `+${pct(v)}`, mul: (v) => `×${num(v)}`, deg: (v) => `${num(v)}°`,
};
const DELTA = { pct, plus: pct, sec, deg: (v) => `${num(v)}°` }; // the gear's share; plain numbers otherwise
const SECTIONS = [
  ['기본', [
    ['최대 HP', 'maxHp', 'num'], ['방어 (받는 피해 감소)', 'armor', 'pct'], ['공격력 (평타 1타)', 'hit', 'num'],
    ['평균 1타 (치명 포함)', 'avgHit', 'num'], ['치명타 확률', 'critChance', 'pct'], ['치명타 배율', 'critMul', 'mul'],
    ['연쇄 최대', 'chain', 'num'], ['연쇄 타격 배율', 'chainMul', 'mul'], ['연쇄 거리', 'chainRange', 'num'],
    ['돌진 거리', 'dashRange', 'num'], ['공격 속도', 'attackSpeed', 'plus'], ['이동 속도', 'speed', 'plus'],
    ['쿨타임 감소', 'cooldown', 'pct'], ['흡혈 (보스 타격당)', 'lifesteal', 'num'], ['특수기 피해', 'skillDmg', 'plus'],
  ]],
  ['회전 베기', [['피해', 'spinDmg', 'num'], ['반경', 'spinR', 'num'], ['쿨타임', 'spinCd', 'sec']]],
  ['점프', [['착지 피해', 'jumpDmg', 'num'], ['착지 반경', 'jumpR', 'num'], ['거리', 'jumpDist', 'num'], ['쿨타임', 'jumpCd', 'sec']]],
  ['질풍 베기', [
    ['근접 피해', 'waveNear', 'num'], ['끝 피해', 'waveFar', 'num'], ['근접 기절', 'waveStun', 'pct'], ['끝 기절', 'waveFarStun', 'pct'],
    ['각도', 'waveAngle', 'deg'], ['사거리', 'waveRange', 'num'], ['쿨타임', 'waveCd', 'sec'],
  ]],
];

export function heroSheet(game) {
  const now = read(game), bare = readBare(game);
  const sections = SECTIONS.map(([title, rows]) => ({
    title,
    rows: rows.map(([label, k, type]) => {
      const d = now[k] - bare[k], small = Math.abs(d) < 1e-6;
      const gear = small ? '' : `${d > 0 ? '+' : '−'}${(DELTA[type] || num)(Math.abs(d))}`;
      return { label, value: FMT[type](now[k]), gear, good: type === 'sec' ? d < 0 : d > 0 };
    }),
  }));
  // worn effects (legendaries, set bonuses) by name
  const ic = game.config.items, gearFx = [...(game.gearEffects || [])].map((id) => (ic.effects[id] && ic.effects[id].label) || id);
  const sets = Object.entries(game.gearSets || {}).map(([id, n]) => `${(ic.sets[id] && ic.sets[id].name) || id} ${n}부위`);
  // the boss in the room: how long it would take
  let boss = null;
  const bo = game.dungeon && game.dungeon.boss;
  if (bo && bo.alive && !bo.dying) {
    boss = {
      hp: Math.round(bo.hp), maxHp: Math.round(bo.maxHp), guard: Math.round(bo.guard || 0),
      hits: Math.ceil(((bo.hp || 0) + (bo.guard || 0)) / Math.max(1, now.avgHit)),
      mirror: bo.type === 'founder' ? Math.round(now.hit * (1 - now.armor)) : null, // the mirror's 1타 after your armor
    };
  }
  return { sections, gearFx, sets, boss };
}
