// Fixed-order music rotation per stage type (pure). Each take() returns the next track of that
// type and advances, so tracks play 1 → 2 → … → 1, and coming back to a type continues the order.
export class Playlist {
  constructor(lists) {
    this.lists = lists; // { type: [file, ...] } (live config)
    this.index = {};
  }

  size(type) { return (this.lists[type] || []).length; }

  take(type) {
    const l = this.lists[type];
    if (!l || l.length === 0) return null;
    const i = this.index[type] || 0;
    this.index[type] = (i + 1) % l.length;
    return l[i % l.length];
  }
}
