// The founder (floor 100): the family's first knight, risen as the last boss. One hp bar, two pages.
// Page 1: he fights as every boss type in turn — warrior, mage, summoner, ranged, assassin, golem — switching as his hp
// falls past each phase's `from` share (tcfg.phases); each phase brings its patterns, way of moving and
// quest. Page 2 (the last phase, ai 'mirror'): he becomes the hero's mirror — the hero's own moves
// (chain dashes, 회전 베기, 점프, 질풍 베기) on the hero's own cooldowns, for the hero's own damage.
import { bossCore, keepBand, appear } from './bossCore.js';
import { assassinAI } from './assassin.js';
import { golemFront, turnFace } from './golem.js';

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
    // the hero's 폭풍 / 유성 sets too: blade length and twin blades, landing size, reach and the pull
    spin: { damage: sk.baseDamage('spin') * skillMul, radius: sk.spinRadius(), twin: sk.gear().has('twinBlade'), cooldown: sk.cooldownOf(spin) },
    jump: { damage: land.damage * skillMul, radius: land.radius, distance: sk.jumpReach(), pull: sk.gear().has('meteorPull') ? (sk.gearCfg().meteorPull || { pullBand: 0.2 }) : null, core: game.bonusStats.jumpCore || jump.coreRadius || 0.2, cooldown: sk.cooldownOf(jump) },
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
  // what the last phase left behind: its guard, sigils, clones, smoke and stone front go; minions stay and fight on
  e.guard = 0;
  for (const m of game.enemies.all()) if (m.alive && !m.dying && (m.type === 'sigil' || m.type === 'clone')) { m.alive = false; m.hp = 0; }
  e.hidden = false;
  s.vanish = null;
  s.smoke = e.root.ai.founder.smokeStart;
  e.front = null;
  if (p.ai === 'golem') { s.face = Math.atan2(game.player.pos.y - e.pos.y, game.player.pos.x - e.pos.x); golemFront(e); }
  if (p.ai === 'mirror') {
    const m = e.tcfg.mirror;
    s.mirror = { reveal: m.reveal, act: null, atk: m.attackEvery, cd: { ...e.root.ai.founder.mirrorStartCooldown } };
    s.task = null;
    game.hazards.clear(); // the page turns: whatever was in the air is gone
  } else if (s.opened) bossCore.raiseGuard(e, game); // the opening raises the first phase's guard by itself
  if (!s.quest) e.immune = false;
  game.events.emit('founderPhase', { enemy: e, phase: i, ai: p.ai, pos: { x: e.pos.x, y: e.pos.y } });
}

// ---- page 2: the mirror ----
function mirrorStart(e, game, kind, mv, v) {
  const m = e.tcfg.mirror, s = e.ai, st = s.mirror, hz = game.hazards, F = e.root.ai.founder;
  s.dir = { x: v.x, y: v.y };
  if (kind === 'spin') {
    hz.circle({ x: e.pos.x, y: e.pos.y, radius: mv.spin.radius + e.radius * 0.5, delay: m.spinWindup, damage: mv.spin.damage });
    if (mv.spin.twin) hz.circle({ x: e.pos.x, y: e.pos.y, radius: mv.spin.radius + e.radius * 0.5, delay: m.spinWindup + F.twinDelay, damage: mv.spin.damage }); // 폭풍 5세트: the second blade comes round
    st.cd.spin = mv.spin.cooldown;
    st.act = { kind, t: m.spinWindup + (mv.spin.twin ? F.spinRecoverTwin : F.spinRecover) };
  } else if (kind === 'wave') {
    hz.cone({ x: e.pos.x, y: e.pos.y, dir: { x: v.x, y: v.y }, radius: mv.wave.range + e.radius, arcDeg: mv.wave.angle, delay: m.waveWindup, damage: mv.wave.damage });
    st.cd.wave = mv.wave.cooldown;
    st.act = { kind, t: m.waveWindup + F.waveRecover };
  } else if (kind === 'jump') {
    const p = game.player.pos;
    const to = game.arena.resolveCircle({ x: p.x, y: p.y }, e.radius).pos; // he comes down where the hero stands
    hz.circle({ x: to.x, y: to.y, radius: mv.jump.radius, delay: m.jumpCrouch + m.jumpAir, damage: mv.jump.damage });
    st.cd.jump = mv.jump.cooldown;
    st.act = { kind, t: m.jumpCrouch + m.jumpAir + F.jumpRecover, from: { x: e.pos.x, y: e.pos.y }, to, crouch: m.jumpCrouch, air: m.jumpAir, el: 0, pull: mv.jump.pull, radius: mv.jump.radius, core: mv.jump.core };
  } else { // a chain of dashes, each marked first
    st.act = { kind: 'dash', left: Math.max(1, Math.min(m.maxChain, mv.normal.chain)), step: 'mark', t: 0, dir: null, len: 0 };
    st.atk = m.attackEvery;
  }
  game.events.emit('bossPattern', { enemy: e, pattern: `mirror_${kind}`, kind, pos: { x: e.pos.x, y: e.pos.y } });
}

// 유성 5세트 copied: the landing draws the hero (not mid-leap, not through a pillar) into its core
export function mirrorPull(game, a) {
  const pl = game.player, p = pl.pos, c = a.to, R = a.radius, band = a.pull.pullBand != null ? a.pull.pullBand : 0.2;
  const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
  if (d < 1e-6 || d > R * (1 + band) || game.skills.rush || game.arena.blocks(c, p)) return false;
  const to = Math.min(d, R * a.core * 0.9), from = { x: p.x, y: p.y };
  const at = game.arena.resolveCircle({ x: c.x + (dx / d) * to, y: c.y + (dy / d) * to }, pl.radius).pos;
  p.x = at.x; p.y = at.y;
  if (pl.prevPos) { pl.prevPos.x = at.x; pl.prevPos.y = at.y; }
  game.events.emit('meteorPull', { pos: { x: c.x, y: c.y }, radius: R * (1 + band), core: R * a.core, moves: [{ from, to: { x: at.x, y: at.y } }] });
  return true;
}

function mirrorUpdate(e, dt, game) {
  const m = e.tcfg.mirror, s = e.ai, st = s.mirror, F = e.root.ai.founder;
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
      if (a.pull && !a.pulled && a.el >= a.crouch + a.air + F.pullDelay) { a.pulled = true; mirrorPull(game, a); } // just after the slam: the hero is drawn in to him
      if (a.t <= 0) { st.act = null; e.airborne = false; }
      return { x: 0, y: 0 };
    }
    if (a.kind === 'dash') { // mark a lane at the hero -> wait for the mark to fill (it strikes then) -> crash along it
      if (a.step === 'mark') {
        a.len = Math.min(v.d + F.dashLenPad, mv.normal.reach + F.dashLenPad);
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
  if (st.cd.wave <= 0 && v.d < mv.wave.range + e.radius && v.d > e.radius + F.waveMinGap) { mirrorStart(e, game, 'wave', mv, v); return { x: 0, y: 0 }; }
  if (st.atk <= 0 && v.d < mv.normal.reach + e.radius) { mirrorStart(e, game, 'dash', mv, v); return { x: 0, y: 0 }; }
  if (v.d < e.radius + game.player.radius + F.mirrorStop) return { x: 0, y: 0 };
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
    e.hidden = false;
    e.ai.vanish = null;
    bossCore.onStun(e);
  },
  update(e, dt, game) {
    const i = founderPhase(e);
    if (i !== e.ai.phase) enter(e, game, i);
    if (e.ai.mirror) return mirrorUpdate(e, dt, game);
    const ph = e.tcfg.phases[e.ai.phase];
    if (e.ai.vanish) { // assassin phase: in the smoke until he steps out of his shadow
      e.ai.vanish.t -= dt;
      if (e.ai.vanish.t <= 0) { appear(e, game, e.ai.vanish.to); e.ai.vanish = null; }
      return { x: 0, y: 0 };
    }
    if (ph.ai === 'golem') turnFace(e, dt, game);
    return bossCore.update(e, dt, game, founderAI);
  },
  move(e, game, v, dt) {
    const p = e.tcfg.phases[e.ai.phase] || e.tcfg.phases[0], F = e.root.ai.founder;
    if (p.ai === 'assassin') return assassinAI.move(e, game, v, dt);
    if (p.ai === 'golem') { // slow, straight at the hero
      if (v.d < e.radius + game.player.radius + (e.tcfg.stopDistance || F.stopFallback)) return { x: 0, y: 0 };
      const sp = e.speed * (p.speedMul || 1);
      return { x: v.x * sp, y: v.y * sp };
    }
    if (p.ai === 'warrior') {
      if (v.d < e.radius + game.player.radius + (e.tcfg.stopDistance || F.stopFallback)) return { x: 0, y: 0 };
      return { x: v.x * e.speed, y: v.y * e.speed };
    }
    return keepBand(e, game, v, ...(e.ai.keep || F.keepBand));
  },
};
