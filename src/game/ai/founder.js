// The founder (floor 100): the family's first knight, risen as the last boss. One hp bar, two pages.
// Page 1: he fights as every boss type in turn — warrior, mage, summoner, ranged — switching as his hp
// falls past each phase's `from` share (tcfg.phases); each phase brings its patterns, way of moving and
// quest. Page 2 (the last phase, ai 'mirror'): he becomes the hero's mirror — the hero's own moves
// (chain dashes, 회전 베기, 점프, 질풍 베기) on the hero's own cooldowns, for the hero's own damage.
import { bossCore, keepBand } from './bossCore.js';

export function founderPhase(e) {
  const ph = e.tcfg.phases, f = e.hp / e.maxHp;
  let i = 0;
  for (let k = 0; k < ph.length; k++) if (f <= ph[k].from + 1e-9) i = k;
  return i;
}

const toward = (e, p) => {
  const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d, d };
};

// what the hero would deal right now (no combo, no crit): the mirror deals the same
export function mirrorMoves(game) {
  const b = game.bonusStats, c = game.config.combat, sk = game.skills;
  const skillMul = 1 + (b.damage || 0) + (b.skillDamage || 0);
  const spin = sk.def('spin'), jump = sk.def('rushStrike'), wave = sk.def('bladeWave');
  const land = sk.landing(jump), at = sk.waveAt(wave, wave.near || 0);
  return {
    normal: { damage: (c.attackDamage + (b.attackFlat || 0)) * (1 + (b.damage || 0)), reach: c.dashRange * (1 + (b.dashRange || 0)), chain: game.combat.chainCount },
    spin: { damage: spin.damage * skillMul, radius: spin.radius, cooldown: sk.cooldownOf(spin) },
    jump: { damage: land.damage * skillMul, radius: land.radius, distance: jump.distance, cooldown: sk.cooldownOf(jump) },
    wave: { damage: at.damage * skillMul, range: wave.range, angle: sk.waveAngle(wave), cooldown: sk.cooldownOf(wave) },
    speed: game.config.movement.cruiseSpeed,
  };
}

function enter(e, game, i) {
  const p = e.tcfg.phases[i], s = e.ai;
  s.phase = i;
  e.patterns = p.patterns.slice();
  s.quest = p.quest || null;
  s.exposedFor = p.exposed || 0;
  s.keep = p.keep || null;
  // what the last phase left behind: its guard and its sigils go; minions stay and fight on
  e.guard = 0;
  for (const m of game.enemies.all()) if (m.alive && !m.dying && m.type === 'sigil') { m.alive = false; m.hp = 0; }
  if (p.ai === 'mirror') {
    const m = e.tcfg.mirror;
    s.mirror = { reveal: m.reveal, act: null, atk: m.attackEvery, cd: { spin: 1.5, jump: 2.5, wave: 2 } };
    s.task = null;
    game.hazards.clear(); // the page turns: whatever was in the air is gone
  } else if (s.opened) bossCore.raiseGuard(e, game); // the opening raises the first phase's guard by itself
  if (!s.quest) e.immune = false;
  game.events.emit('founderPhase', { enemy: e, phase: i, ai: p.ai, pos: { x: e.pos.x, y: e.pos.y } });
}

// ---- page 2: the mirror ----
function mirrorStart(e, game, kind, mv, v) {
  const m = e.tcfg.mirror, s = e.ai, st = s.mirror, hz = game.hazards;
  s.dir = { x: v.x, y: v.y };
  if (kind === 'spin') {
    hz.circle({ x: e.pos.x, y: e.pos.y, radius: mv.spin.radius + e.radius * 0.5, delay: m.spinWindup, damage: mv.spin.damage });
    st.cd.spin = mv.spin.cooldown;
    st.act = { kind, t: m.spinWindup + 0.15 };
  } else if (kind === 'wave') {
    hz.cone({ x: e.pos.x, y: e.pos.y, dir: { x: v.x, y: v.y }, radius: mv.wave.range + e.radius, arcDeg: mv.wave.angle, delay: m.waveWindup, damage: mv.wave.damage });
    st.cd.wave = mv.wave.cooldown;
    st.act = { kind, t: m.waveWindup + 0.2 };
  } else if (kind === 'jump') {
    const p = game.player.pos;
    const to = game.arena.resolveCircle({ x: p.x, y: p.y }, e.radius).pos; // he comes down where the hero stands
    hz.circle({ x: to.x, y: to.y, radius: mv.jump.radius, delay: m.jumpCrouch + m.jumpAir, damage: mv.jump.damage });
    st.cd.jump = mv.jump.cooldown;
    st.act = { kind, t: m.jumpCrouch + m.jumpAir + 0.3, from: { x: e.pos.x, y: e.pos.y }, to, crouch: m.jumpCrouch, air: m.jumpAir, el: 0 };
  } else { // a chain of dashes, each marked first
    st.act = { kind: 'dash', left: Math.max(1, Math.min(m.maxChain, mv.normal.chain)), step: 'mark', t: 0, dir: null, len: 0 };
    st.atk = m.attackEvery;
  }
  game.events.emit('bossPattern', { enemy: e, pattern: `mirror_${kind}`, kind, pos: { x: e.pos.x, y: e.pos.y } });
}

function mirrorUpdate(e, dt, game) {
  const m = e.tcfg.mirror, s = e.ai, st = s.mirror;
  e.immune = st.reveal > 0; // the page turn: a moment to see who he has become
  if (st.reveal > 0) { st.reveal -= dt; return { x: 0, y: 0 }; }
  for (const k of Object.keys(st.cd)) st.cd[k] -= dt;
  st.atk -= dt;
  const mv = mirrorMoves(game), v = toward(e, game.player.pos);
  const a = st.act;
  if (a) {
    if (a.kind === 'jump') { // crouch, then fly to the landing spot to arrive as the slam lands
      a.el += dt;
      a.t -= dt;
      if (a.el > a.crouch && a.el <= a.crouch + a.air) {
        const k = Math.min(1, (a.el - a.crouch) / a.air);
        const want = { x: a.from.x + (a.to.x - a.from.x) * k, y: a.from.y + (a.to.y - a.from.y) * k };
        e.pos = game.arena.resolveCircle(want, e.radius).pos;
        e.airborne = true;
      } else e.airborne = false;
      if (a.t <= 0) { st.act = null; e.airborne = false; }
      return { x: 0, y: 0 };
    }
    if (a.kind === 'dash') { // mark a lane at the hero -> wait for the mark to fill (it strikes then) -> crash along it
      if (a.step === 'mark') {
        a.len = Math.min(v.d + 40, mv.normal.reach + 40);
        a.dir = { x: v.x, y: v.y };
        game.hazards.line({ x: e.pos.x, y: e.pos.y, dir: a.dir, length: a.len, width: m.dashWidth, delay: m.dashWindup, damage: mv.normal.damage });
        a.step = 'wait'; a.t = m.dashWindup;
        return { x: 0, y: 0 };
      }
      a.t -= dt;
      if (a.step === 'wait') { if (a.t <= 0) { a.step = 'dash'; a.t = m.dashTime; } return { x: 0, y: 0 }; }
      if (a.t <= 0) { a.left -= 1; if (a.left <= 0) st.act = null; else a.step = 'mark'; return { x: 0, y: 0 }; }
      const sp = a.len / m.dashTime;
      return { x: a.dir.x * sp, y: a.dir.y * sp };
    }
    a.t -= dt;
    if (a.t <= 0) st.act = null;
    return { x: 0, y: 0 };
  }
  // choose: jump when far, spin when close, the gale at middle range, else dashes or close in
  if (st.cd.jump <= 0 && v.d > m.jumpMin) { mirrorStart(e, game, 'jump', mv, v); return { x: 0, y: 0 }; }
  if (st.cd.spin <= 0 && v.d < mv.spin.radius + e.radius) { mirrorStart(e, game, 'spin', mv, v); return { x: 0, y: 0 }; }
  if (st.cd.wave <= 0 && v.d < mv.wave.range + e.radius && v.d > e.radius + 40) { mirrorStart(e, game, 'wave', mv, v); return { x: 0, y: 0 }; }
  if (st.atk <= 0 && v.d < mv.normal.reach + e.radius) { mirrorStart(e, game, 'dash', mv, v); return { x: 0, y: 0 }; }
  if (v.d < e.radius + game.player.radius + 30) return { x: 0, y: 0 };
  const sp = mv.speed * m.speedOfHero;
  return { x: v.x * sp, y: v.y * sp };
}

export const founderAI = {
  init(e) {
    bossCore.init(e);
    e.ai.phase = -1;
  },
  onStun(e) {
    if (e.ai.mirror) { e.ai.mirror.act = null; e.airborne = false; return; }
    bossCore.onStun(e);
  },
  update(e, dt, game) {
    const i = founderPhase(e);
    if (i !== e.ai.phase) enter(e, game, i);
    if (e.ai.mirror) return mirrorUpdate(e, dt, game);
    return bossCore.update(e, dt, game, founderAI);
  },
  move(e, game, v) {
    const p = e.tcfg.phases[e.ai.phase] || e.tcfg.phases[0];
    if (p.ai === 'warrior') {
      if (v.d < e.radius + game.player.radius + (e.tcfg.stopDistance || 20)) return { x: 0, y: 0 };
      return { x: v.x * e.speed, y: v.y * e.speed };
    }
    return keepBand(e, game, v, ...(e.ai.keep || [300, 520]));
  },
};
