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
  // essences: the amount one card adds (점프의 정수 changes with the jump in stage 3)
  if (t.essence) for (const [id, e] of Object.entries(t.essence)) if (id !== 'leap' && e && e.add != null && config.relics.list[id]) config.relics.list[id].add = e.add;
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
