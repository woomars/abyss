export class Events {
  constructor() { this.handlers = new Map(); }
  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, []);
    this.handlers.get(name).push(fn);
    return fn;
  }
  off(name, fn) {
    const list = this.handlers.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  emit(name, payload) {
    const list = this.handlers.get(name);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }
}
