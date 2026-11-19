// Best-floor record, kept apart from settings. Storage is injected (localStorage in the browser).
export class RecordStore {
  constructor(storage, key = 'abyss.records') {
    this.storage = storage;
    this.key = key;
  }

  load() {
    try {
      const d = JSON.parse(this.storage ? this.storage.getItem(this.key) : 'null');
      return { bestFloor: d && Number.isFinite(d.bestFloor) ? d.bestFloor : 0 };
    } catch (_) {
      return { bestFloor: 0 };
    }
  }

  // returns { bestFloor, isNew }
  submitFloor(floor) {
    const r = this.load();
    const isNew = floor > r.bestFloor;
    if (isNew) {
      r.bestFloor = floor;
      try { if (this.storage) this.storage.setItem(this.key, JSON.stringify(r)); } catch (_) { /* private mode */ }
    }
    return { bestFloor: r.bestFloor, isNew };
  }
}
