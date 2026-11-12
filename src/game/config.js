export const CONFIG_FILES = ['combat', 'movement', 'camera', 'enemies', 'skills', 'feedback', 'input', 'audio', 'music', 'dungeon', 'relics', 'items', 'names', 'progress'];

// fetchJson: (path) => Promise<object>. Paths are relative to the site root.
export async function loadConfig(fetchJson) {
  const entries = await Promise.all(
    CONFIG_FILES.map(async (name) => [name, await fetchJson(`src/data/${name}.json`)])
  );
  return Object.fromEntries(entries);
}
