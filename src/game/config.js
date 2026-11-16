export const CONFIG_FILES = ['combat', 'movement', 'camera', 'enemies', 'skills', 'feedback', 'input', 'audio', 'music', 'dungeon', 'relics', 'items', 'names', 'progress', 'medals'];

// developer-editable tables (src/data/tuning/*.json); keys starting with "_" are notes for people
export const TUNING_FILES = ['economy', 'drops', 'essence', 'sets', 'specials', 'pressure', 'bosses', 'engrave', 'hud', 'story', 'founder'];

// a deep copy without the "_" note keys
export function stripNotes(v) {
  if (Array.isArray(v)) return v.map(stripNotes);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) out[k] = stripNotes(x);
    return out;
  }
  return v;
}

// put the tuning tables where the game already reads its numbers (the old json no longer has them)
export function applyTuning(config) {
  const t = config.tuning;
  if (!t) return config;
  if (t.drops) config.items.drops = t.drops;
  if (t.economy) {
    const inc = t.economy.income;
    config.dungeon.rewards = { ...config.dungeon.rewards, clearGold: inc.clearGold, chestGold: inc.chestGold, bossChestGold: inc.bossChestGold, goldPerFloor: inc.goldPerFloor };
    config.relics.reroll = t.economy.reroll;
  }
  // special attacks (tuning/specials.json): damage from the hero's attack, stun from 10%, the longer jump
  if (t.specials) {
    const sp = t.specials, d = config.skills.defs, st = sp.stun, j = sp.jump;
    d.spin.radius = sp.spin.radius;
    d.spin.mult = sp.damage.spin;
    d.bladeWave.mult = sp.damage.bladeWave;
    d.bladeWave.stunNear = st.base;
    config.items.stunBase = st.base; // the set screen's lines (질풍 5: certain stun)
    Object.assign(d.rushStrike, { distance: j.distance, radius: j.radius, knockback: j.knockback, mult: sp.damage.jump, speed: j.distance / j.airTime, coreRadius: j.coreRadius, outerZones: j.outerZones });
    if (t.sets && t.sets.storm) d.spin.nearZero = t.sets.storm.nearZero; // the spin stuns only with the far part of its blade
    config.skills.stun = { chance: st.base, duration: st.duration, bossChance: st.base * st.bossRatio, bossDuration: st.bossDuration };
  }
  if (t.sets) {
    config.items.setTables = t.sets; // the set steps Loadout adds up (번개·폭풍·유성·망령)
    if (t.sets.meteor) config.items.effects.meteorPull = t.sets.meteor.full; // 유성 5세트 pull (read by SkillSystem.land)
    // 번개 / 망령 stat rows: the set's effect stays, its stats come from the table
    const statRows = (setId, rows) => {
      const s = config.items.sets[setId];
      if (!s || !rows) return;
      const b = {};
      for (const [n, v] of Object.entries(s.bonuses)) if (v.effect) b[n] = { effect: v.effect };
      rows.forEach((r, i) => { if (r && Object.keys(r).length) b[i + 1] = { ...(b[i + 1] || {}), ...r }; });
      s.bonuses = b;
    };
    if (t.sets.lightning) statRows('abyss', t.sets.lightning.stats);
    if (t.sets.wraith) statRows('gravecall', t.sets.wraith.stats);
  }
  // 질풍 set: close-range stun by pieces worn (tuning/sets.json gale), on top of its damage / fall-off bonuses
  if (t.sets && t.sets.gale && config.items.sets.galeHunter) {
    const g = t.sets.gale, b = {};
    for (let n = 1; n <= 5; n++) {
      const add = { waveStun: g.stun[n - 1] };
      if (g.damage[n - 1]) add.waveDamage = g.damage[n - 1];
      if (g.falloff[n - 1]) add.waveFalloff = g.falloff[n - 1];
      b[n] = add;
    }
    config.items.sets.galeHunter.bonuses = b;
    config.items.sets.galeHunter.angles = g.angles;
  }
  // essences: the amount one card adds (점프의 정수 changes with the jump in stage 3)
  if (t.essence) for (const [id, e] of Object.entries(t.essence)) if (e && e.add != null && config.relics.list[id]) { config.relics.list[id].add = e.add; if (e.stat) config.relics.list[id].stat = e.stat; }
  return config;
}

// fetchJson: (path) => Promise<object>. Paths are relative to the site root.
export async function loadConfig(fetchJson) {
  const [entries, tuning] = await Promise.all([
    Promise.all(CONFIG_FILES.map(async (name) => [name, await fetchJson(`src/data/${name}.json`)])),
    Promise.all(TUNING_FILES.map(async (name) => [name, stripNotes(await fetchJson(`src/data/tuning/${name}.json`))])),
  ]);
  return applyTuning({ ...Object.fromEntries(entries), tuning: Object.fromEntries(tuning) });
}
