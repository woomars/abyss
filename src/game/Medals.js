// Medals and the boss record of a family. Each hero can earn each medal once in his life; the vault keeps
// who earned it first and how many of the line have it, and every boss the line has slain.
// Pure helpers + installMedals(game), which listens to the run.

export const who = (l) => ({ given: l.given, family: l.family, generation: l.generation });

export const emptyRunStats = () => ({ kills: 0, bestCombo: 0, medals: [], bosses: {}, killer: null });

// a boss is known by its type and the band it guards (중간보스 오크 대장 ≠ 지역 보스 오크 대장)
export const bossKey = (type, band) => `${type}@${band.from}`;

// every boss of the dungeon in floor order (for the codex)
export function bossRoster(dungeonCfg, enemiesCfg) {
  return dungeonCfg.bands.filter((b) => b.kind === 'boss' && b.boss).map((b) => ({
    key: bossKey(b.boss.type, b), type: b.boss.type, title: b.title, floor: b.from,
    name: (enemiesCfg.types[b.boss.type] || {}).name || b.boss.type,
  }));
}

// give a medal to the hero in play; null when he already has it
export function earnMedal(vault, stats, medal, floor, now = Date.now()) {
  if (stats.medals.includes(medal.id)) return null;
  stats.medals.push(medal.id);
  const rec = vault.medals[medal.id] || (vault.medals[medal.id] = { count: 0, first: null });
  const first = !rec.first;
  if (first) rec.first = { ...who(vault.lineage), floor, at: now };
  rec.count += 1;
  return { medal, first };
}

// a boss fell: the hero's own tally and the family's bestiary
export function recordBoss(vault, stats, boss, floor, now = Date.now()) {
  const s = stats.bosses[boss.key] || (stats.bosses[boss.key] = { name: boss.name, title: boss.title, count: 0, deepest: 0 });
  s.count += 1;
  s.deepest = Math.max(s.deepest, floor);
  const b = vault.bestiary[boss.key] || (vault.bestiary[boss.key] = { name: boss.name, title: boss.title, kills: 0, deepest: 0, first: null });
  b.kills += 1;
  b.deepest = Math.max(b.deepest, floor);
  if (!b.first) b.first = { ...who(vault.lineage), floor, at: now };
}

export const bossCount = (stats) => Object.values(stats.bosses || {}).reduce((n, b) => n + b.count, 0);

// saves from before medals: the fallen get what their record proves (depth, kills, combo)
export function backfillMedals(vault, medalsCfg) {
  if (vault.medalsFilled) return false;
  vault.medalsFilled = true;
  for (const r of vault.lineage.history) {
    r.medals = Array.isArray(r.medals) ? r.medals : [];
    for (const m of medalsCfg.list) {
      const v = m.kind === 'floor' ? r.floor : m.kind === 'kills' ? r.kills : m.kind === 'combo' ? r.bestCombo : -1;
      if (!(v >= m.value) || r.medals.includes(m.id)) continue;
      r.medals.push(m.id);
      const rec = vault.medals[m.id] || (vault.medals[m.id] = { count: 0, first: null });
      if (!rec.first) rec.first = { ...who(r), floor: m.kind === 'floor' ? m.value : r.floor, at: 0 };
      rec.count += 1;
    }
  }
  return true;
}

function maxEnhance(game) {
  let best = 0;
  const all = [...Object.values(game.loadout.slots), ...game.vault.stash, ...game.loot.pocket];
  for (const it of all) if (it && it.enhance > best) best = it.enhance;
  return best;
}

export function installMedals(game) {
  const ev = game.events;
  let clean = true; // no blow taken on this floor yet
  const earn = (kind, value) => {
    if (game.mode !== 'dungeon') return;
    const cfg = game.config.medals;
    if (!cfg) return;
    let got = false;
    for (const m of cfg.list) {
      if (m.kind !== kind || !(value >= m.value)) continue;
      const r = earnMedal(game.vault, game.stats, m, game.dungeon.floor || 0);
      if (r) { got = true; ev.emit('medal', r); }
    }
    if (got) game.saveVault();
  };
  ev.on('floorStart', (e) => { clean = true; earn('floor', e.floor); });
  ev.on('playerHit', () => { clean = false; });
  ev.on('kill', (e) => {
    if (game.mode !== 'dungeon') return;
    const en = e.enemy;
    if (en && en.isBoss && en.bossInfo) {
      recordBoss(game.vault, game.stats, en.bossInfo, game.dungeon.floor || 0);
      earn('bosses', bossCount(game.stats));
      if (clean) earn('flawless', 1);
    }
    earn('kills', game.stats.kills);
  });
  ev.on('hit', () => earn('combo', game.effects.combo.count));
  ev.on('levelUp', (e) => earn('level', e.level));
  ev.on('lootPickup', (e) => { if (e.item && e.item.grade === 'legendary') earn('legendary', 1); });
  ev.on('setComplete', () => earn('set', 1));
  ev.on('forgeAction', (e) => { if (e.kind === 'enhanceUp') earn('enhance', maxEnhance(game)); });
  ev.on('tokenApplied', () => earn('token', 1));
}
