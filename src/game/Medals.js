// Medals and the boss record of a family. Each hero can earn each medal once in his life; the vault keeps
// who earned it first and how many of the line have it, and every boss the line has slain.
// Pure helpers + installMedals(game), which listens to the run.

export const who = (l) => ({ given: l.given, family: l.family, generation: l.generation });

export const emptyRunStats = () => ({ kills: 0, bestCombo: 0, medals: [], bosses: {}, killer: null, essences: {} });

// a boss is known by its type id
export const bossKey = (type) => type;

// saves from before Phase 5 keyed bosses by type@band; they map onto the boss ids
export const OLD_BOSS_KEYS = { 'warchief@4': 'warchief', 'warchief@10': 'warchief', 'gatekeeper@20': 'gatekeeper' };

const TIERS = ['mid', 'region', 'great'];
// every boss of the dungeon, tier by tier, then by the loop it appears from (for the codex)
export function bossRoster(dungeonCfg, enemiesCfg) {
  const band = (tier) => dungeonCfg.bands.find((b) => b.kind === 'boss' && b.boss && b.boss.tier === tier) || {};
  return Object.entries(enemiesCfg.types)
    .filter(([, t]) => t.rank === 'boss' && t.tier)
    .map(([key, t]) => ({ key, type: t.ai, tier: t.tier, minCycle: t.minCycle || 0, title: band(t.tier).title || '', floor: band(t.tier).from || 0, name: t.name }))
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.minCycle - b.minCycle);
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

// ---- trophies: milestones of the whole family (summed over every generation) ----
// live: the hero in play still fights (his kills are not in the history yet)
export function trophyValue(kind, vault, { stats = null, roster = [] } = {}) {
  const hist = vault.lineage.history;
  if (kind === 'generation') return vault.lineage.generation;
  if (kind === 'familyKills') return hist.reduce((n, h) => n + (h.kills || 0), 0) + (stats ? stats.kills : 0);
  if (kind === 'familyBosses') return Object.values(vault.bestiary).reduce((n, b) => n + (b.kills || 0), 0);
  if (kind === 'bestiary') return roster.length && roster.every((b) => vault.bestiary[b.key]) ? 1 : 0;
  if (kind === 'medalCount') return Object.values(vault.medals).filter((m) => m && m.first).length;
  if (kind === 'essenceCount') return Object.values(vault.essence.owned).reduce((n, c) => n + c, 0);
  return 0;
}

// newly reached trophies go to the vault (credited to the hero in play); returns them
export function checkTrophies(vault, cfg, ctx = {}, floor = 0, now = Date.now()) {
  const out = [];
  for (const tr of (cfg && cfg.trophies) || []) {
    if (vault.trophies[tr.id]) continue;
    if (trophyValue(tr.kind, vault, ctx) < tr.value) continue;
    vault.trophies[tr.id] = { ...who(vault.lineage), floor, at: now };
    out.push(tr);
  }
  return out;
}

// this life's essences (for the record the hall shows): id -> { count, total, life }
export function noteEssence(stats, o) {
  const e = stats.essences[o.id] || (stats.essences[o.id] = { count: 0, total: 0, life: !o.inherit });
  e.count += 1;
  e.total += o.value;
}

function maxEnhance(game) {
  let best = 0;
  const all = [...Object.values(game.loadout.slots), ...game.vault.stash, ...game.loot.pocket];
  for (const it of all) if (it && it.enhance > best) best = it.enhance;
  return best;
}

export function installMedals(game) {
  const ev = game.events;
  const trophies = (live = true) => {
    const cfg = game.config.medals;
    if (!cfg || game.mode !== 'dungeon') return;
    const roster = bossRoster(game.config.dungeon, game.config.enemies);
    const got = checkTrophies(game.vault, cfg, { stats: live ? game.stats : null, roster }, game.dungeon.floor || 0);
    for (const tr of got) ev.emit('trophy', { trophy: tr });
    if (got.length) game.saveVault();
  };
  game.checkTrophies = trophies;
  ev.on('medal', () => trophies());
  ev.on('relicPick', () => trophies());
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
    if (game.stats.kills % 50 === 0 || (en && en.isBoss)) trophies(); // family kill totals: checked now and then
  });
  ev.on('hit', () => earn('combo', game.effects.combo.count));
  ev.on('levelUp', (e) => earn('level', e.level));
  ev.on('lootPickup', (e) => { if (e.item && e.item.grade === 'legendary') earn('legendary', 1); });
  ev.on('setComplete', () => earn('set', 1));
  ev.on('forgeAction', (e) => { if (e.kind === 'enhanceUp') earn('enhance', maxEnhance(game)); });
  ev.on('tokenApplied', () => earn('token', 1));
}
