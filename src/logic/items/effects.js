// Legendary and set effects in combat. Each reacts to game events and only acts while the matching
// effect is in game.gearEffects. Pure game logic (emits events for visuals and sound).
const segDist = (p, a, b) => {
  const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
};

export function installGearEffects(game) {
  const ev = game.events, cfg = () => game.config.items.effects, on = (k) => game.gearEffects.has(k);
  const base = () => (game.config.combat.attackDamage + game.bonusStats.attackFlat) * (1 + game.bonusStats.damage);

  // hit an enemy with an effect (never counts as a chain hit, so effects cannot trigger each other)
  const strike = (e, damage, from, skill, noRiposte = false) => {
    const dx = e.pos.x - from.x, dy = e.pos.y - from.y, d = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / d, y: dy / d };
    const { killed, untargetable } = e.takeHit({ damage: Math.max(1, Math.round(damage)), knockDir: dir, knockback: game.config.items.effectHit.knockback, stagger: game.config.items.effectHit.stagger, noRiposte });
    const pos = { x: e.pos.x, y: e.pos.y };
    ev.emit('hit', { enemy: e, damage: Math.max(1, Math.round(damage)), crit: false, strong: false, chainIndex: 0, pos, dir, skill, untargetable });
    if (killed) ev.emit('kill', { enemy: e, pos, dir, crit: false });
  };

  // 폭풍의 대검: each chain hit sparks to the nearest other enemy
  ev.on('hit', (h) => {
    if (!on('storm') || h.skill || !(h.chainIndex > 0)) return;
    const c = cfg().storm;
    let best = null, bd = c.zapRadius;
    for (const e of game.enemies.targetable()) {
      if (e === h.enemy) continue;
      const d = Math.hypot(e.pos.x - h.pos.x, e.pos.y - h.pos.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    ev.emit('stormZap', { from: { x: h.pos.x, y: h.pos.y }, to: { x: best.pos.x, y: best.pos.y } });
    strike(best, base() * c.zapDamage, h.pos, 'storm');
  });

  // 흡혈 군주의 검: heal a share of max hp per kill
  ev.on('kill', (e) => {
    if (on('vampLord') && !game.over && e.enemy && e.enemy.isBoss) game.healFlat(game.player.maxHp * cfg().vampLord.heal);
  });

  // 대지 파쇄자: a shockwave along the dash path
  ev.on('dashHit', ({ from, to, target }) => {
    if (!on('earthshatter')) return;
    const c = cfg().earthshatter;
    ev.emit('quake', { from, to });
    for (const e of game.enemies.targetable()) {
      if (e === target) continue;
      if (segDist(e.pos, from, to) <= c.width + e.radius) strike(e, base() * c.damage, from, 'quake');
    }
  });

  // 재의 인장 / 비전의 장막 5세트: chain hits leave burning ash
  ev.on('hit', (h) => {
    if (!on('chainField') || h.skill || !(h.chainIndex > 0)) return;
    const c = cfg().chainField;
    game.fields = game.fields || [];
    game.fields.push({ x: h.pos.x, y: h.pos.y, r: c.radius, t: c.life, tick: 0 });
  });

  // 망령 set: by pieces worn, slain foes rise as wraiths (how many at once, and for how long each) — rules/sets.json
  ev.on('kill', (k) => {
    if (!on('wraithSet') || game.over || !k.enemy || k.enemy.isBoss) return;
    const T = game.config.items.setTables, n = Math.min(5, (game.gearSets || {}).gravecall || 0);
    const row = T && T.wraith && n > 0 ? T.wraith.summons[n - 1] : null;
    if (!row) return;
    game.allies = game.allies || [];
    if (game.allies.length >= row.count) return;
    const used = new Set(game.allies.filter((a) => a.set).map((a) => a.slot));
    let slot = 0; while (used.has(slot)) slot++;
    game.allies.push({ x: k.pos.x, y: k.pos.y, t: row.life[Math.min(slot, row.life.length - 1)], cd: 0.3, set: true, slot });
    ev.emit('thrallRise', { pos: { x: k.pos.x, y: k.pos.y } });
  });

  // 망령 군주의 왕관: a slain foe rises as an allied wraith for a while
  ev.on('kill', (k) => {
    if (!on('thrall') || game.over || !k.enemy || k.enemy.isBoss) return;
    const c = cfg().thrall;
    game.allies = game.allies || [];
    if (game.allies.length >= c.max) return;
    game.allies.push({ x: k.pos.x, y: k.pos.y, t: c.life, cd: 0.3 });
    ev.emit('thrallRise', { pos: { x: k.pos.x, y: k.pos.y } });
  });

  // 지진의 장화 (rushSlam): a wider, harder jump landing — read by SkillSystem.landing

  // 그림자 갑주: a moment of invulnerability as a dash starts (with a cooldown)
  let evadeAt = -99;
  ev.on('dashStart', () => {
    if (!on('dashEvade')) return;
    const c = cfg().dashEvade;
    if (game.time - evadeAt < c.cooldown) return;
    evadeAt = game.time;
    game.player.invuln = Math.max(game.player.invuln, c.invuln);
    ev.emit('dashEvade', { pos: { x: game.player.pos.x, y: game.player.pos.y } });
  });

  // per step: ash burns, allied wraiths hunt
  game.gearTick = (dt) => {
    const fields = game.fields || [], allies = game.allies || [];
    if (fields.length) {
      const c = cfg().chainField;
      for (let i = fields.length - 1; i >= 0; i--) {
        const f = fields[i];
        f.t -= dt; f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = c.every;
          for (const e of game.enemies.targetable()) if (Math.hypot(e.pos.x - f.x, e.pos.y - f.y) <= f.r + e.radius) strike(e, base() * c.damage, f, 'ash');
        }
        if (f.t <= 0) fields.splice(i, 1);
      }
    }
    if (allies.length) {
      const c = cfg().thrall;
      for (let i = allies.length - 1; i >= 0; i--) {
        const a = allies[i];
        a.t -= dt; a.cd -= dt;
        let best = null, bd = Infinity;
        for (const e of game.enemies.targetable()) { const d = Math.hypot(e.pos.x - a.x, e.pos.y - a.y); if (d < bd) { bd = d; best = e; } }
        if (best && bd > c.range * 0.5) { // drift toward the prey
          const step = Math.min(bd - c.range * 0.5, c.speed * dt);
          a.x += ((best.pos.x - a.x) / bd) * step; a.y += ((best.pos.y - a.y) / bd) * step;
        }
        if (best && bd <= c.range && a.cd <= 0) {
          a.cd = c.every;
          ev.emit('thrallHit', { from: { x: a.x, y: a.y }, to: { x: best.pos.x, y: best.pos.y } });
          if (a.set) { // 망령 set wraith: 5% of the hero's attack, never angers the foe, may stun
            const T = game.config.items.setTables, k = T && T.wraith ? T.wraith.damage : 0.05;
            strike(best, (game.config.combat.attackDamage + game.bonusStats.attackFlat) * k, a, 'wraith', true);
            setStun(best, game.bonusStats.wraithStun);
          } else strike(best, base() * c.damage, a, 'thrall');
        }
        if (a.t <= 0) allies.splice(i, 1);
      }
    }
  };

// a certain-or-likely stun from a set (bosses scaled like every special stun)
  const setStun = (e, chance) => {
    const st = game.config.skills.stun;
    if (!st || !e.alive || e.dying || !(chance > 0)) return;
    const p = Math.min(1, chance) * (e.isBoss ? st.bossChance / st.chance : 1);
    if (game.rng() < p) { e.stun(e.isBoss ? st.bossDuration : st.duration); ev.emit('stun', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } }); }
  };

  // 번개 set: chain hits (the hero's own blows, not specials) may stun
  ev.on('hit', (h) => {
    if (h.skill || !h.enemy || !(game.bonusStats.chainStun > 0)) return;
    setStun(h.enemy, game.bonusStats.chainStun);
  });

  // 번개 5세트: the last chain strike bursts into a cone of lightning ahead; every foe inside is stunned
  ev.on('slash', (s) => {
    if (!on('setBlast') || !s.strong || s.wave) return; // the chain's last blow only, not 질풍 베기's swing
    const T = game.config.items.setTables, f = (T && T.lightning && T.lightning.full) || { coneAngle: 70, coneRange: 160, damage: 1, stun: 1 };
    const d = s.dir && Math.hypot(s.dir.x, s.dir.y) > 1e-6 ? s.dir : { x: 1, y: 0 }, a0 = Math.atan2(d.y, d.x), half = (f.coneAngle * Math.PI / 180) / 2;
    ev.emit('setBlast', { pos: { x: s.pos.x, y: s.pos.y }, radius: f.coneRange, dir: { x: d.x, y: d.y }, arcDeg: f.coneAngle });
    for (const e of game.enemies.targetable()) {
      const dx = e.pos.x - s.pos.x, dy = e.pos.y - s.pos.y, dist = Math.hypot(dx, dy);
      if (dist > f.coneRange + e.radius) continue;
      const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - a0), Math.cos(Math.atan2(dy, dx) - a0)));
      if (dist > e.radius && da > half) continue;
      strike(e, base() * f.damage, s.pos, 'blast');
      setStun(e, f.stun);
    }
  });
}

// 망령의 갑옷: a chance to ignore a blow (Game.damagePlayer asks this first)
export function evades(game) {
  if (!game.gearEffects.has('wraithArmor')) return false;
  return game.rng() < game.config.items.effects.wraithArmor.chance;
}

// 심연의 반지: more damage the lower the hp (full bonus at fullAt of max hp and below)
export function abyssRingBonus(game) {
  if (!game.gearEffects.has('abyssRing')) return 0;
  const c = game.config.items.effects.abyssRing, p = game.player;
  const r = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  return c.max * Math.max(0, Math.min(1, (1 - r) / (1 - c.fullAt)));
}
