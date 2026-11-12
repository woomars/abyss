// Versioned settings persistence. Storage is injected (localStorage in the browser).
export const SETTINGS_VERSION = 1;
const defaults = () => ({ version: SETTINGS_VERSION, shake: true, sound: true, music: true });

export class SaveSystem {
  constructor(storage, key = 'abyss.settings') {
    this.storage = storage;
    this.key = key;
  }

  load() {
    try {
      if (!this.storage) return defaults();
      const raw = this.storage.getItem(this.key);
      if (!raw) return defaults();
      const data = JSON.parse(raw);
      if (!data || data.version !== SETTINGS_VERSION) return defaults();
      const d = defaults();
      const pick = (k) => (typeof data[k] === 'boolean' ? data[k] : d[k]);
      return { version: SETTINGS_VERSION, shake: pick('shake'), sound: pick('sound'), music: pick('music') };
    } catch (_) {
      return defaults();
    }
  }

  save(settings) {
    try {
      if (!this.storage) return;
      this.storage.setItem(this.key, JSON.stringify({ ...settings, version: SETTINGS_VERSION }));
    } catch (_) { /* storage unavailable (private mode etc.) */ }
  }
}
