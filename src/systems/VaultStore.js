import { Vault } from '../game/items/Vault.js';

// Save slots in localStorage (one key per slot). Storage is injected; any storage error just means
// nothing is saved (private mode etc.).
export const SLOT_COUNT = 3;

export class VaultStore {
  constructor(storage, prefix = 'abyss.vault.', now = () => Date.now()) {
    this.storage = storage;
    this.prefix = prefix;
    this.now = now;
  }

  key(slot) { return this.prefix + slot; }

  // Vault or null (empty, broken, other version, storage unavailable)
  load(slot) {
    try {
      const raw = this.storage ? this.storage.getItem(this.key(slot)) : null;
      return raw ? Vault.fromJSON(JSON.parse(raw)) : null;
    } catch (_) {
      return null;
    }
  }

  save(slot, vault) {
    vault.savedAt = this.now();
    try {
      if (!this.storage) return false;
      this.storage.setItem(this.key(slot), JSON.stringify(vault.toJSON()));
      return true;
    } catch (_) {
      return false;
    }
  }

  remove(slot) {
    try { if (this.storage) this.storage.removeItem(this.key(slot)); } catch (_) { /* ignore */ }
  }

  // [{ slot, summary|null }] for slots 1..SLOT_COUNT
  list() {
    const out = [];
    for (let s = 1; s <= SLOT_COUNT; s++) {
      const v = this.load(s);
      out.push({ slot: s, summary: v ? v.summary() : null });
    }
    return out;
  }

  // the most recently saved slot (for 이어하기), or null
  latest() {
    let best = null;
    for (const r of this.list()) if (r.summary && (!best || r.summary.savedAt > best.summary.savedAt)) best = r;
    return best ? best.slot : null;
  }
}
