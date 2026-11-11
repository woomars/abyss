// Fixed-size object pool. When full, acquire() recycles the oldest active object.
export class Pool {
  constructor(create, size) {
    this.free = [];
    this.active = [];
    for (let i = 0; i < size; i++) this.free.push(create());
  }

  get activeCount() { return this.active.length; }

  acquire() {
    let obj;
    if (this.free.length) obj = this.free.pop();
    else if (this.active.length) obj = this.active.shift();
    else return null;
    this.active.push(obj);
    return obj;
  }

  release(obj) {
    const i = this.active.indexOf(obj);
    if (i < 0) return;
    this.active.splice(i, 1);
    this.free.push(obj);
  }

  // iterates backwards so fn may release the current object
  forEachActive(fn) {
    const a = this.active;
    for (let i = a.length - 1; i >= 0; i--) {
      if (i < a.length) fn(a[i]);
    }
  }

  releaseAll() {
    while (this.active.length) this.free.push(this.active.pop());
  }
}
