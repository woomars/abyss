// Debug "화면 테스트" (throwaway spike): PixiJS v8 quarter view with free test art.
// A = 3/4 top-down (screen = world), B = isometric (world turned 45deg, height halved), C = straight down;
// D/E = the A/B views with pixel art.
// Feel the controls and read the fps with 0/50/100/150 enemies on a phone. Debug text is Korean only.
const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
const BASE = 'assets/qvtest/';
const C = Math.SQRT1_2;
const PILLAR_H = 120;

const CSS = `
.qvt{position:absolute;inset:0;z-index:60;background:#0a0a10;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden}
.qvt canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
.qvt-fps{position:absolute;left:calc(6px + env(safe-area-inset-left));top:4px;font:12px/1.35 monospace;color:#9f9;background:rgba(0,0,0,.5);padding:3px 7px;border-radius:4px;pointer-events:none;white-space:pre}
.qvt-top{position:absolute;right:calc(6px + env(safe-area-inset-right));top:4px;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:62%}
.qvt button{font:600 13px system-ui,sans-serif;color:#eee;background:rgba(30,30,44,.82);border:1px solid #556;border-radius:6px;padding:6px 9px;touch-action:manipulation}
.qvt button.on{background:#3a5a8a;border-color:#8af}
.qvt-sk{position:absolute;right:calc(10px + env(safe-area-inset-right));bottom:10px;width:230px;height:170px;pointer-events:none}
.qvt-sk button{position:absolute;width:60px;height:60px;border-radius:50%;padding:0;font-size:14px;pointer-events:auto}
.qvt-sk button.big{width:78px;height:78px;font-size:16px}
.qvt-boss{position:absolute;left:50%;top:40px;transform:translateX(-50%);width:36%;height:8px;background:#311;border:1px solid #a44;display:none;pointer-events:none}
.qvt-boss i{display:block;height:100%;width:100%;background:#d33}
.qvt-stick{position:absolute;width:96px;height:96px;margin:-48px 0 0 -48px;border:2px solid rgba(255,255,255,.22);border-radius:50%;pointer-events:none;display:none}
.qvt-stick i{position:absolute;left:50%;top:50%;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;background:rgba(255,255,255,.28)}
.qvt-help{position:absolute;left:calc(8px + env(safe-area-inset-left));bottom:6px;font:11px/1.4 system-ui,sans-serif;color:#8a8aa0;pointer-events:none}
.qvt-err{position:absolute;inset:60px 20px auto;color:#f88;font:13px monospace;white-space:pre-wrap}
`;

// modes = a view (A 3/4 top-down, B isometric, C straight down) + an art set
const MODES = {
  A: { view: 'A', art: 'flare', label: 'A 3/4 탑다운' },
  B: { view: 'B', art: 'flare', label: 'B 아이소메트릭' },
  C: { view: 'C', art: 'td', label: 'C 탑다운' },
  D: { view: 'A', art: 'puny', label: 'D 픽셀 탑다운', floor: 'grass' },
  E: { view: 'B', art: 'puny', label: 'E 픽셀 쿼터뷰', floor: 'grass' },
};
const NEXT = { A: 'B', B: 'C', C: 'D', D: 'E', E: 'A' };
// each body's sheet and scale per art set (flare: 8-direction renders, td: one facing turned, puny: 8-direction pixel)
const KIND = {
  hero: { flare: ['hero', 1], td: ['tdHero', 1.1], puny: ['pxHero', 2] },
  zombie: { flare: ['zombie', 1], td: ['tdEnemy', 0.95], puny: ['pxEnemy', 2] },
  boss: { flare: ['boss', 1.3], td: ['tdBoss', 2.1], puny: ['pxBoss', 4] },
};
const rnd = (a, b) => a + Math.random() * (b - a);
const len = (x, y) => Math.hypot(x, y) || 1e-6;

export async function openQvTest(root, opts) {
  const t = new QvTest(root, opts);
  try { await t.init(); } catch (err) { t.fail(err); }
  return t;
}

class QvTest {
  constructor(root, { config, toLocal, onClose }) {
    this.toLocal = toLocal;
    this.onClose = onClose;
    // the largest combat room (by area), pillars included
    this.room = [...config.dungeon.rooms.combat].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    this.mode = 'A';
    this.view = 'A';
    this.art = 'flare';
    this.res = Math.min(window.devicePixelRatio || 1, 2);
    this.viewH = 420;
    this.enemies = [];
    this.fx = [];
    this.hitstop = 0;
    this.shakeAmp = 0;
    this.moveDir = null;
    this.keys = new Set();
    this.buffer = null;
    this.stats = { frames: 0, time: 0, worst: 0, sum: 0, text: '' };

    if (!document.getElementById('qvt-css')) {
      const s = document.createElement('style');
      s.id = 'qvt-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'qvt';
    this.el.innerHTML = `
      <div class="qvt-fps">불러오는 중...</div>
      <div class="qvt-top">
        <button data-a="mode">A 3/4 탑다운</button><button data-a="modes">픽셀 D↔E</button>
        <button data-a="n" data-n="0">적 0</button><button data-a="n" data-n="50" class="on">적 50</button><button data-a="n" data-n="100">적 100</button><button data-a="n" data-n="150">적 150</button>
        <button data-a="boss">보스</button><button data-a="res">해상도 ${this.res}x</button><button data-a="zoom">확대 129%</button><button data-a="close">닫기</button>
      </div>
      <div class="qvt-boss"><i></i></div>
      <div class="qvt-stick"><i></i></div>
      <div class="qvt-sk">
        <button data-k="attack" class="big" style="right:0;bottom:0">공격</button>
        <button data-k="dash" style="right:88px;bottom:2px">대쉬</button>
        <button data-k="spin" style="right:158px;bottom:14px">회전</button>
        <button data-k="jump" style="right:8px;bottom:88px">점프</button>
        <button data-k="wave" style="right:78px;bottom:72px">질풍</button>
      </div>
      <div class="qvt-help">끌기: 이동 · 짧게 튕기기: 대쉬 베기(연쇄) · 톡: 공격 | PC: WASD, J 공격, K 대쉬, L 점프, U 회전, I 질풍</div>`;
    root.appendChild(this.el);
    this.fpsEl = this.el.querySelector('.qvt-fps');
    this.bossBar = this.el.querySelector('.qvt-boss');
    this.stickEl = this.el.querySelector('.qvt-stick');
    this.el.querySelector('.qvt-top').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      e.stopPropagation();
      if (!b) return;
      e.preventDefault();
      const a = b.dataset.a;
      if (a === 'close') this.close();
      if (!this.app) return;
      if (a === 'mode') this.setMode(NEXT[this.mode]);
      if (a === 'modes') this.setMode(this.mode === 'D' ? 'E' : 'D');
      if (a === 'n') this.setEnemies(Number(b.dataset.n));
      if (a === 'boss') this.toggleBoss();
      if (a === 'res') this.setRes(this.res >= 2 ? 1 : this.res >= 1.5 ? 2 : 1.5);
      if (a === 'zoom') { this.viewH = this.viewH === 540 ? 420 : this.viewH === 420 ? 340 : 540; b.textContent = `확대 ${Math.round(540 / this.viewH * 100)}%`; }
    });
    this.el.querySelector('.qvt-sk').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      e.stopPropagation();
      if (!b) return;
      e.preventDefault();
      if (this.app) this.act(b.dataset.k);
    });
  }

  fail(err) {
    console.error(err);
    const d = document.createElement('div');
    d.className = 'qvt-err';
    d.textContent = `불러오기 실패\n${err && err.stack || err}`;
    this.el.appendChild(d);
  }

  async init() {
    const P = this.P = await import(PIXI_URL);
    const app = new P.Application();
    await app.init({ resizeTo: this.el, background: '#0a0a10', antialias: false, resolution: this.res, autoDensity: true, preference: 'webgl', powerPreference: 'high-performance' });
    this.el.prepend(app.canvas);
    this.sheets = await fetch(BASE + 'sheets.json', { cache: 'no-cache' }).then((r) => r.json());
    const files = [...Object.values(this.sheets).map((s) => s.image), 'fx_slash.png', 'fx_spin.png', 'fx_arc.png', 'fx_impact.png', 'fx_sparks.png', 'px_grass.png'];
    await P.Assets.load(files.map((f) => BASE + f));
    const tex = (f) => P.Assets.get(BASE + f);
    const cut = (src, x, y, w, h) => new P.Texture({ source: src, frame: new P.Rectangle(x, y, w, h) });
    for (const s of Object.values(this.sheets)) {
      const src = tex(s.image).source;
      if (s.dirs === 1 || s.dir0 === 90) src.scaleMode = 'nearest'; // pixel art
      s.tex = Array.from({ length: 8 * s.perDir }, (_, i) => cut(src, (i % s.cols) * s.w, Math.floor(i / s.cols) * s.h, s.w, s.h));
    }
    const sparks = tex('fx_sparks.png').source, impact = tex('fx_impact.png').source;
    this.t = {
      slash: tex('fx_slash.png'), crescent: tex('fx_spin.png'), arc: tex('fx_arc.png'),
      impact: Array.from({ length: 5 }, (_, i) => cut(impact, i * 150, 0, 150, 150)),
      blood: Array.from({ length: 4 }, (_, i) => cut(sparks, i * 64, 0, 64, 64)),
      fire: Array.from({ length: 4 }, (_, i) => cut(sparks, i * 64, 128, 64, 64)),
      shadow: this.shadowTexture(),
    };

    // camera > ground (world coords, projected by its own transform) / shadows / sorted bodies / top fx
    this.world = new P.Container();
    this.groundOuter = new P.Container();
    this.ground = new P.Container();
    this.groundOuter.addChild(this.ground);
    this.floor = new P.Graphics();
    this.tele = new P.Graphics();
    this.groundFx = new P.Container();
    const grassTex = tex('px_grass.png');
    grassTex.source.scaleMode = 'nearest';
    this.grass = new P.TilingSprite({ texture: grassTex, width: this.room.w / 3, height: this.room.h / 3 });
    this.grass.scale.set(3); // 16px tiles drawn 48 world px
    this.grass.tint = 0x8a8f86;
    this.ground.addChild(this.floor, this.grass, this.tele, this.groundFx);
    this.shadows = new P.Container();
    this.bodies = new P.Container();
    this.bodies.sortableChildren = true;
    this.topFx = new P.Container();
    this.world.addChild(this.groundOuter, this.shadows, this.bodies, this.topFx);
    app.stage.addChild(this.world);
    this.app = app;

    this.drawFloor();
    this.player = this.actor('hero', 16);
    Object.assign(this.player, { x: 300, y: this.room.h / 2, hp: 100, maxHp: 100, state: 'free', invuln: 0, chain: null });
    this.cam = { x: this.player.x, y: this.player.y };
    this.setMode('A');
    this.setEnemies(50);
    this.bindInput();
    app.ticker.add(() => this.tick(Math.min(0.05, app.ticker.deltaMS / 1000), app.ticker.deltaMS));
  }

  shadowTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 16, 2, 32, 16, 30);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.scale(1, 0.5);
    g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    return this.P.Texture.from(c);
  }

  // ---- projection ----
  proj(x, y) { return this.view !== 'B' ? { x, y } : { x: (x - y) * C, y: (x + y) * C * 0.5 }; }
  // a screen direction -> the world direction that moves the same way on screen
  unproj(dx, dy) {
    if (this.view !== 'B') { const l = len(dx, dy); return { x: dx / l, y: dy / l }; }
    const x = (dx + 2 * dy) / (2 * C), y = (2 * dy - dx) / (2 * C), l = len(x, y);
    return { x: x / l, y: y / l };
  }
  // 8-direction rows by screen angle: row 0 at the sheet's dir0 (Flare 180 = west, Puny 90 = south), then 45deg counter-clockwise
  faceTo(e, dx, dy) {
    const p = this.view !== 'B' ? { x: dx, y: dy } : { x: (dx - dy), y: (dx + dy) * 0.5 };
    const deg = Math.atan2(p.y, p.x) * 180 / Math.PI;
    e.face = (((Math.round(((e.sh.dir0 != null ? e.sh.dir0 : 180) - deg) / 45)) % 8) + 8) % 8;
    const l = len(dx, dy);
    e.dx = dx / l; e.dy = dy / l;
  }

  setMode(m) {
    this.mode = m;
    this.view = MODES[m].view;
    this.art = MODES[m].art;
    this.groundOuter.scale.set(1, this.view === 'B' ? 0.5 : 1);
    this.ground.rotation = this.view === 'B' ? Math.PI / 4 : 0;
    this.grass.visible = MODES[m].floor === 'grass';
    if (this.pillarGfx) for (const g of this.pillarGfx) g.destroy();
    this.pillarGfx = this.room.pillars.map((p) => this.drawPillar(p));
    for (const e of this.all()) { this.applySheet(e); this.faceTo(e, e.dx, e.dy); }
    this.el.querySelector('[data-a="mode"]').textContent = MODES[m].label;
  }

  applySheet(e) {
    const [sheet, scl] = KIND[e.kind][this.art];
    e.sh = this.sheets[sheet];
    e.scl = scl;
    e.sprite.anchor.set(e.sh.anchor[0] / e.sh.w, e.sh.anchor[1] / e.sh.h);
    e.sprite.rotation = 0;
  }

  setRes(r) {
    this.res = r;
    this.app.renderer.resize(this.el.clientWidth, this.el.clientHeight, r);
    this.el.querySelector('[data-a="res"]').textContent = `해상도 ${r}x`;
  }

  drawFloor() {
    const g = this.floor, W = this.room.w, H = this.room.h, T = 100;
    g.rect(0, 0, W, H).fill(0x2b2833);
    for (let i = 0; i < W / T; i++) for (let j = 0; j < H / T; j++) if ((i + j) & 1) g.rect(i * T, j * T, Math.min(T, W - i * T), Math.min(T, H - j * T));
    g.fill(0x25222c);
    g.rect(-12, -12, W + 24, H + 24).stroke({ width: 24, color: 0x15121b });
  }

  drawPillar(p) {
    const g = new this.P.Graphics();
    if (this.view === 'C') { // straight down: the top and a cast shadow
      g.rect(p.x + 14, p.y + 14, p.w, p.h).fill({ color: 0x000000, alpha: 0.35 });
      g.rect(p.x, p.y, p.w, p.h).fill(0x4b4557).stroke({ width: 3, color: 0x5d5669 });
      g.zIndex = -1e6;
      this.bodies.addChild(g);
      return g;
    }
    const s = [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]].map(([x, y]) => this.proj(x, y));
    const cx = s.reduce((a, q) => a + q.x, 0) / 4, cy = s.reduce((a, q) => a + q.y, 0) / 4;
    for (let i = 0; i < 4; i++) {
      const a = s[i], b = s[(i + 1) % 4];
      if ((a.y + b.y) / 2 <= cy + 0.01) continue; // back faces stay hidden
      const col = Math.abs(a.y - b.y) < 0.5 ? 0x38323f : ((a.x + b.x) / 2 < cx ? 0x3d3747 : 0x2e2936);
      g.poly([a.x, a.y, b.x, b.y, b.x, b.y - PILLAR_H, a.x, a.y - PILLAR_H]).fill(col);
    }
    g.poly(s.flatMap((q) => [q.x, q.y - PILLAR_H])).fill(0x4b4557).stroke({ width: 2, color: 0x5d5669 });
    g.zIndex = this.view === 'A' ? Math.max(...s.map((q) => q.y)) : cy;
    this.bodies.addChild(g);
    return g;
  }

  // ---- actors ----
  actor(kind, r) {
    const P = this.P;
    const sprite = new P.Sprite(P.Texture.EMPTY);
    const shadow = new P.Sprite(this.t.shadow);
    shadow.anchor.set(0.5);
    this.bodies.addChild(sprite);
    this.shadows.addChild(shadow);
    const e = { kind, sprite, shadow, r, base: r * 2.6 / 64, x: 0, y: 0, z: 0, kx: 0, ky: 0, face: 2, dx: 0, dy: 1, anim: 'stand', at: 0, fps: 6, loop: true, hold: null, flash: 0, st: 0, alive: true };
    this.applySheet(e);
    return e;
  }

  play(e, anim, fps, loop = true) {
    if (e.anim !== anim) { e.anim = anim; e.at = 0; }
    e.fps = fps; e.loop = loop; e.hold = null;
  }

  animate(e, dt) {
    e.at += dt;
    const a = e.sh.anims[e.anim];
    let k = Math.floor(e.at * e.fps);
    k = e.loop ? k % a[1] : Math.min(k, a[1] - 1);
    const col = e.hold != null ? e.hold : a[0] + k;
    e.sprite.texture = e.sh.tex[(e.sh.dirs === 1 ? 0 : e.face) * e.sh.perDir + col];
  }

  sync(e) {
    const p = this.proj(e.x, e.y), ks = 1 - Math.min(0.5, e.z / 220);
    e.sprite.zIndex = p.y;
    if (this.view === 'C') { // seen from above: a jump grows the body, the shadow stays on the floor
      e.sprite.position.set(p.x, p.y);
      e.sprite.scale.set(e.scl * (1 + e.z / 160));
      e.sprite.rotation = Math.atan2(e.dy, e.dx) + Math.PI / 2; // the art faces north
      e.sprite.zIndex += e.z * 10;
      e.shadow.position.set(p.x + 4 + e.z * 0.3, p.y + 6 + e.z * 0.3);
      e.shadow.scale.set(e.base * 0.9 * ks, e.base * 1.8 * ks);
    } else {
      e.sprite.position.set(p.x, p.y - e.z);
      e.sprite.scale.set(e.scl);
      e.shadow.position.set(p.x, p.y);
      e.shadow.scale.set(e.base * ks);
    }
    e.sprite.tint = e.flash > 0 ? 0xff6a6a : 0xffffff;
    e.sprite.alpha = e.fade != null ? e.fade : (e.invuln > 0 && Math.floor(e.invuln * 20) % 2 ? 0.45 : 1);
  }

  all() { return this.boss ? [this.player, ...this.enemies, this.boss] : [this.player, ...this.enemies]; }
  targets() { return this.boss && this.boss.alive ? [...this.enemies.filter((e) => e.alive), this.boss] : this.enemies.filter((e) => e.alive); }

  freeSpot(minFromPlayer) {
    const R = this.room;
    for (let i = 0; i < 40; i++) {
      const x = rnd(60, R.w - 60), y = rnd(60, R.h - 60);
      if (R.pillars.some((p) => x > p.x - 30 && x < p.x + p.w + 30 && y > p.y - 30 && y < p.y + p.h + 30)) continue;
      if (this.player && len(x - this.player.x, y - this.player.y) < minFromPlayer) continue;
      return { x, y };
    }
    return { x: R.w - 100, y: R.h / 2 };
  }

  setEnemies(n) {
    while (this.enemies.length > n) { const e = this.enemies.pop(); e.sprite.destroy(); e.shadow.destroy(); }
    while (this.enemies.length < n) {
      const e = this.actor('zombie', 14);
      this.respawn(e);
      this.enemies.push(e);
    }
    for (const b of this.el.querySelectorAll('[data-a="n"]')) b.classList.toggle('on', Number(b.dataset.n) === n);
  }

  respawn(e) {
    Object.assign(e, this.freeSpot(320), { hp: 40, maxHp: 40, state: 'chase', st: 0, cd: rnd(0, 1), spd: rnd(52, 78), alive: true, fade: null, kx: 0, ky: 0, flash: 0 });
    this.faceTo(e, rnd(-1, 1), rnd(-1, 1));
    this.play(e, 'stand', 6);
  }

  toggleBoss() {
    if (this.boss) { this.boss.sprite.destroy(); this.boss.shadow.destroy(); this.boss = null; this.bossBar.style.display = 'none'; this.tele.clear(); }
    else {
      const b = this.boss = this.actor('boss', 30);
      Object.assign(b, this.freeSpot(450), { hp: 900, maxHp: 900, state: 'idle', st: 0, alive: true, fade: null });
      this.play(b, 'stand', 6);
      this.bossBar.style.display = 'block';
    }
    this.el.querySelector('[data-a="boss"]').classList.toggle('on', !!this.boss);
  }

  // ---- input ----
  bindInput() {
    const cv = this.app.canvas;
    const loc = (e) => this.toLocal(e.clientX, e.clientY);
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stick) return;
      const p = loc(e);
      this.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, t0: performance.now() };
      Object.assign(this.stickEl.style, { display: 'block', left: p.x + 'px', top: p.y + 'px' });
    });
    cv.addEventListener('pointermove', (e) => {
      const s = this.stick;
      if (!s || e.pointerId !== s.id) return;
      const p = loc(e);
      s.x = p.x; s.y = p.y;
      const dx = s.x - s.ox, dy = s.y - s.oy, l = len(dx, dy);
      this.moveDir = l > 12 ? this.unproj(dx, dy) : null;
      const k = Math.min(1, 34 / l);
      this.stickEl.firstElementChild.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    });
    const up = (e) => {
      const s = this.stick;
      if (!s || e.pointerId !== s.id) return;
      const dur = (performance.now() - s.t0) / 1000, dx = s.x - s.ox, dy = s.y - s.oy, l = len(dx, dy);
      if (dur < 0.25 && l > 30 && l / dur > 450) this.act('dash', this.unproj(dx, dy)); // flick
      else if (dur < 0.3 && l < 12) this.act('attack'); // tap
      this.stick = null;
      this.moveDir = null;
      this.stickEl.style.display = 'none';
      this.stickEl.firstElementChild.style.transform = '';
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    const KEY = { j: 'attack', k: 'dash', l: 'jump', u: 'spin', i: 'wave' };
    this.onKey = (e) => {
      const k = e.key.toLowerCase();
      if (e.type === 'keydown') {
        if (KEY[k] && !e.repeat) this.act(KEY[k]);
        this.keys.add(k);
      } else this.keys.delete(k);
      if (k === 'escape') this.close();
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }

  keyDir() {
    const k = this.keys, dx = (k.has('d') || k.has('arrowright')) - (k.has('a') || k.has('arrowleft')), dy = (k.has('s') || k.has('arrowdown')) - (k.has('w') || k.has('arrowup'));
    return dx || dy ? this.unproj(dx, dy) : null;
  }

  // actions wait (0.25s buffer) until the hero is free; a dash may cut a swing short after its hit
  act(kind, dir = null) {
    const p = this.player;
    const free = p.state === 'free' || (kind === 'dash' && p.state === 'swing' && p.hitDone);
    if (!free) { this.buffer = { kind, dir, t: 0.25 }; return; }
    this.buffer = null;
    const d = dir || this.moveDir || this.keyDir() || { x: p.dx, y: p.dy };
    if (kind === 'attack') {
      const t = this.pick(d, 120, 180);
      if (t) { this.faceTo(p, t.x - p.x, t.y - p.y); const dist = len(t.x - p.x, t.y - p.y) - t.r - p.r; if (dist > 30) this.step(p, p.dx * (dist - 30), p.dy * (dist - 30)); }
      else this.faceTo(p, d.x, d.y);
      this.startSwing(false);
    }
    if (kind === 'dash') {
      p.chain = { left: 3, hit: new Set() };
      const t = this.pick(d, 330, 55);
      this.faceTo(p, d.x, d.y);
      this.startDash(t, d);
    }
    if (kind === 'jump') {
      const t = this.pick(d, 340, 70);
      const tx = t ? t.x : p.x + d.x * 230, ty = t ? t.y : p.y + d.y * 230;
      this.faceTo(p, tx - p.x, ty - p.y);
      Object.assign(p, { state: 'jump', st: 0, jx: p.x, jy: p.y, tx, ty, invuln: 0.5 });
      this.play(p, 'swing', 0); p.hold = p.sh.anims.swing[0];
    }
    if (kind === 'spin') { Object.assign(p, { state: 'spin', st: 0, hits: 0, a0: Math.atan2(p.dy, p.dx) }); this.addSpinFx(p); }
    if (kind === 'wave') { this.faceTo(p, d.x, d.y); Object.assign(p, { state: 'cast', st: 0, fired: false }); this.play(p, 'cast', 16, false); }
  }

  // nearest live target within range and inside the cone around dir
  pick(d, range, coneDeg) {
    const p = this.player, cos = Math.cos(coneDeg * Math.PI / 180);
    let best = null, bd = Infinity;
    for (const t of this.targets()) {
      const dx = t.x - p.x, dy = t.y - p.y, l = len(dx, dy);
      if (l > range + t.r || (dx * d.x + dy * d.y) / l < cos || (p.chain && p.chain.hit.has(t))) continue;
      if (l < bd) { bd = l; best = t; }
    }
    return best;
  }

  startSwing(fromDash) {
    const p = this.player;
    Object.assign(p, { state: 'swing', st: 0, hitDone: false, fromDash });
    this.play(p, 'swing', 26, false);
  }

  startDash(t, d) {
    const p = this.player;
    const tx = t ? t.x - (t.x - p.x) / len(t.x - p.x, t.y - p.y) * (t.r + p.r + 6) : p.x + d.x * 200;
    const ty = t ? t.y - (t.y - p.y) / len(t.x - p.x, t.y - p.y) * (t.r + p.r + 6) : p.y + d.y * 200;
    if (t) this.faceTo(p, t.x - p.x, t.y - p.y);
    Object.assign(p, { state: 'dash', st: 0, tx, ty, target: t, ghost: 0, invuln: Math.max(p.invuln, 0.2) });
    this.play(p, 'run', 0); p.hold = p.sh.anims.run[0] + 5;
  }

  // ---- hits ----
  hit(t, dmg, dx, dy, kn, stun = 0.22) {
    const crit = Math.random() < 0.15;
    if (crit) { dmg *= 2; kn *= 1.5; }
    t.hp -= dmg;
    t.flash = 0.09;
    this.hitstop = Math.max(this.hitstop, crit ? 0.085 : 0.05);
    this.shake(crit ? 7 : 3);
    this.spark(t, crit ? this.t.fire : this.t.blood);
    if (t.hp <= 0) { this.kill(t); return; }
    if (t === this.boss) { t.kx += dx * 40; t.ky += dy * 40; return; }
    Object.assign(t, { state: 'hurt', st: 0, stun, kx: dx * kn, ky: dy * kn });
  }

  kill(t) {
    Object.assign(t, { alive: false, state: 'dead', st: 0 });
    this.play(t, 'die', 12, false);
    this.shake(5);
  }

  hurtPlayer(dmg, dx, dy, kn = 240) {
    const p = this.player;
    if (p.invuln > 0 || p.state === 'jump') return;
    p.hp -= dmg;
    if (p.hp <= 0) p.hp = p.maxHp; // a test: the hero never falls
    Object.assign(p, { state: 'hurt', st: 0, kx: dx * kn, ky: dy * kn, invuln: 0.7, flash: 0.12, chain: null });
    this.buffer = null;
    this.hitstop = Math.max(this.hitstop, 0.04);
    this.shake(6);
  }

  slash() {
    const p = this.player, R = p.fromDash ? 95 : 85, cos = Math.cos(65 * Math.PI / 180);
    this.addSlashFx(p);
    for (const t of this.targets()) {
      const dx = t.x - p.x, dy = t.y - p.y, l = len(dx, dy);
      if (l > R + t.r || (dx * p.dx + dy * p.dy) / l < cos) continue;
      this.hit(t, p.fromDash ? 16 : 12, dx / l, dy / l, p.fromDash ? 300 : 220);
      if (p.chain) p.chain.hit.add(t);
    }
  }

  aoe(x, y, R, dmg, kn) {
    for (const t of this.targets()) {
      const dx = t.x - x, dy = t.y - y, l = len(dx, dy);
      if (l < R + t.r) this.hit(t, dmg, dx / l, dy / l, kn);
    }
  }

  shake(a) { this.shakeAmp = Math.max(this.shakeAmp, a); }

  // ---- fx ----
  addFx(sp, layer, dur, update, frames = null) {
    layer.addChild(sp);
    this.fx.push({ sp, dur, t: 0, update, frames });
  }

  spark(t, frames) {
    const sp = new this.P.Sprite(frames[0]);
    const p = this.proj(t.x, t.y);
    sp.anchor.set(0.5);
    sp.position.set(p.x + rnd(-6, 6), p.y - (this.view === 'C' ? 0 : t === this.boss ? 60 : 30));
    sp.scale.set(t === this.boss ? 1.6 : 1.1);
    this.addFx(sp, this.topFx, 0.22, null, frames);
  }

  // ground fx live in world coords: the ground transform lays them flat in either view
  groundSprite(tex, x, y, rot, sx, sy, tint, ax = 0.5) {
    const sp = new this.P.Sprite(tex);
    sp.anchor.set(ax, 0.5);
    sp.position.set(x, y);
    sp.rotation = rot;
    sp.scale.set(sx, sy);
    sp.tint = tint;
    sp.blendMode = 'add';
    return sp;
  }

  addSlashFx(p) {
    const rot = Math.atan2(p.dy, p.dx);
    if (p.fromDash) {
      const sp = this.groundSprite(this.t.slash, p.x + p.dx * 20, p.y + p.dy * 20, rot + 0.5, 0.75, 0.75, 0xbfe6ff);
      this.addFx(sp, this.groundFx, 0.16, (s, k) => { s.alpha = 1 - k; s.scale.set(0.6 + 0.3 * k); });
    } else {
      const sp = this.groundSprite(this.t.crescent, p.x + p.dx * 26, p.y + p.dy * 26, rot, 0.4, 0.55, 0xe8f6ff);
      this.addFx(sp, this.groundFx, 0.15, (s, k) => { s.alpha = 1 - k * k; s.rotation = rot - 0.6 + 1.2 * k; });
    }
  }

  addSpinFx(p) {
    for (let i = 0; i < 2; i++) {
      const sp = this.groundSprite(this.t.crescent, p.x, p.y, i * Math.PI, 1.0, 1.0, 0x9fd8ff);
      this.addFx(sp, this.groundFx, 0.45, (s, k) => { s.position.set(p.x, p.y); s.rotation += 0.45; s.alpha = 1 - k; });
    }
  }

  addImpact(x, y, scale) {
    const sp = new this.P.Sprite(this.t.impact[0]);
    sp.anchor.set(0.5);
    sp.position.set(x, y);
    sp.scale.set(scale);
    sp.blendMode = 'add';
    this.addFx(sp, this.groundFx, 0.35, null, this.t.impact);
  }

  addWave(p) {
    const w = { x: p.x + p.dx * 30, y: p.y + p.dy * 30, dx: p.dx, dy: p.dy, hit: new Set() };
    const sp = this.groundSprite(this.t.arc, w.x, w.y, Math.atan2(w.dy, w.dx), 0.55, 0.55, 0x9ff0ff);
    this.addFx(sp, this.groundFx, 0.6, (s, k, dt) => {
      w.x += w.dx * 760 * dt; w.y += w.dy * 760 * dt;
      s.position.set(w.x, w.y);
      s.alpha = 1 - k * k;
      for (const t of this.targets()) {
        if (w.hit.has(t) || len(t.x - w.x, t.y - w.y) > 62 + t.r) continue;
        w.hit.add(t);
        this.hit(t, 10, w.dx, w.dy, 120, 0.9);
      }
    });
  }

  ghost(p) {
    const sp = new this.P.Sprite(p.sprite.texture);
    sp.anchor.copyFrom(p.sprite.anchor);
    sp.position.copyFrom(p.sprite.position);
    sp.scale.copyFrom(p.sprite.scale);
    sp.rotation = p.sprite.rotation;
    sp.zIndex = p.sprite.zIndex - 1;
    sp.tint = 0x66bbff;
    sp.blendMode = 'add';
    this.addFx(sp, this.bodies, 0.18, (s, k) => { s.alpha = 0.6 * (1 - k); });
  }

  // ---- movement ----
  step(e, mx, my) {
    const R = this.room;
    let x = e.x + mx, y = e.y + my;
    for (const p of R.pillars) {
      const nx = Math.max(p.x, Math.min(x, p.x + p.w)), ny = Math.max(p.y, Math.min(y, p.y + p.h));
      const dx = x - nx, dy = y - ny, d = Math.hypot(dx, dy);
      if (d < e.r) {
        if (d > 0.001) { x = nx + dx / d * e.r; y = ny + dy / d * e.r; }
        else x = p.x - e.r; // centre inside: push out to the left
      }
    }
    e.x = Math.max(e.r, Math.min(R.w - e.r, x));
    e.y = Math.max(e.r, Math.min(R.h - e.r, y));
  }

  knock(e, dt) {
    if (!e.kx && !e.ky) return;
    this.step(e, e.kx * dt, e.ky * dt);
    const f = Math.exp(-11 * dt);
    e.kx *= f; e.ky *= f;
    if (Math.abs(e.kx) + Math.abs(e.ky) < 4) { e.kx = 0; e.ky = 0; }
  }

  // ---- per frame ----
  tick(dt, ms) {
    this.measure(dt, ms);
    if (this.hitstop > 0) this.hitstop -= dt;
    else {
      this.updatePlayer(dt);
      for (const e of this.enemies) this.updateEnemy(e, dt);
      if (this.boss) this.updateBoss(dt);
      this.separate();
      for (const e of this.all()) { this.animate(e, dt); if (e.flash > 0) e.flash -= dt; }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.frames) f.sp.texture = f.frames[Math.min(f.frames.length - 1, Math.floor(k * f.frames.length))];
      if (f.update) f.update(f.sp, k, dt);
      if (k >= 1) { f.sp.destroy(); this.fx.splice(i, 1); }
    }
    for (const e of this.all()) this.sync(e);
    if (this.boss) this.bossBar.firstElementChild.style.width = `${Math.max(0, this.boss.hp / this.boss.maxHp) * 100}%`;
    this.camera(dt);
  }

  camera(dt) {
    const p = this.player, k = 1 - Math.exp(-dt / 0.12);
    this.cam.x += (p.x - this.cam.x) * k;
    this.cam.y += (p.y - this.cam.y) * k;
    const zoom = this.el.clientHeight / this.viewH, c = this.proj(this.cam.x, this.cam.y);
    this.shakeAmp *= Math.exp(-dt / 0.08);
    const sx = (Math.random() * 2 - 1) * this.shakeAmp, sy = (Math.random() * 2 - 1) * this.shakeAmp;
    this.world.scale.set(zoom);
    this.world.position.set(this.el.clientWidth / 2 - c.x * zoom + sx, this.el.clientHeight / 2 - (c.y - (this.view === 'C' ? 0 : 30)) * zoom + sy);
  }

  measure(dt, ms) {
    const s = this.stats;
    s.frames++; s.time += dt; s.sum += ms; s.worst = Math.max(s.worst, ms);
    if (s.time >= 0.5) {
      const n = this.enemies.length + (this.boss ? 1 : 0);
      this.fpsEl.textContent = `${Math.round(s.frames / s.time)} fps  평균 ${(s.sum / s.frames).toFixed(1)}ms  최악 ${s.worst.toFixed(0)}ms\n${this.mode} · 적 ${n} · 해상도 ${this.res}x · 효과 ${this.fx.length}`;
      s.frames = 0; s.time = 0; s.sum = 0; s.worst = 0;
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    p.st += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (this.buffer && (this.buffer.t -= dt) <= 0) this.buffer = null;
    if (p.state === 'free') {
      if (this.buffer) { const b = this.buffer; this.act(b.kind, b.dir); if (p.state !== 'free') return; }
      const d = this.moveDir || this.keyDir();
      if (d) { this.faceTo(p, d.x, d.y); this.step(p, d.x * 230 * dt, d.y * 230 * dt); this.play(p, 'run', 15); }
      else this.play(p, 'stand', 6);
    } else if (p.state === 'swing') {
      if (!p.hitDone && p.st >= 0.05) { p.hitDone = true; this.slash(); }
      if (p.st >= 0.17) {
        const next = p.chain && p.chain.left > 0 && p.fromDash ? this.pick({ x: p.dx, y: p.dy }, 180, 180) : null;
        if (next) { p.chain.left--; this.startDash(next); } else { p.state = 'free'; p.chain = null; }
      }
    } else if (p.state === 'dash') {
      const dx = p.tx - p.x, dy = p.ty - p.y, l = len(dx, dy), v = 950 * dt;
      if ((p.ghost -= dt) <= 0) { p.ghost = 0.025; this.ghost(p); }
      if (l <= v || p.st > 0.35) {
        this.step(p, dx * Math.min(1, v / l), dy * Math.min(1, v / l));
        if (p.target) this.startSwing(true); else { p.state = 'free'; p.chain = null; }
      } else this.step(p, dx / l * v, dy / l * v);
    } else if (p.state === 'jump') {
      const k = Math.min(1, p.st / 0.42);
      this.step(p, p.jx + (p.tx - p.jx) * k - p.x, p.jy + (p.ty - p.jy) * k - p.y);
      p.z = Math.sin(Math.PI * k) * 95;
      p.hold = p.sh.anims.swing[0] + (k > 0.7 ? 3 : k > 0.4 ? 2 : 1);
      if (k >= 1) {
        p.z = 0; p.state = 'free';
        this.addImpact(p.x, p.y, 1.6);
        this.aoe(p.x, p.y, 125, 20, 420);
        this.shake(9);
        this.hitstop = Math.max(this.hitstop, 0.07);
      }
    } else if (p.state === 'spin') {
      const a = p.a0 + p.st / 0.28 * Math.PI * 2; // a full turn every 0.28s: rows in A/B, rotation in C
      this.faceTo(p, Math.cos(a), Math.sin(a));
      p.hold = p.sh.anims.swing[0] + 2;
      const due = [0.04, 0.19, 0.34].filter((t) => p.st >= t).length;
      while (p.hits < due) { p.hits++; this.aoe(p.x, p.y, 125, 9, 200); }
      if (p.st >= 0.45) { p.state = 'free'; this.faceTo(p, Math.cos(p.a0), Math.sin(p.a0)); }
    } else if (p.state === 'cast') {
      if (!p.fired && p.st >= 0.12) { p.fired = true; this.addWave(p); this.shake(2); }
      if (p.st >= 0.26) p.state = 'free';
    } else if (p.state === 'hurt') {
      this.knock(p, dt);
      p.hold = p.sh.anims.die[0] + (p.st < 0.1 ? 0 : 1);
      if (p.st >= 0.25) { p.state = 'free'; p.kx = 0; p.ky = 0; }
    }
  }

  updateEnemy(e, dt) {
    const p = this.player;
    e.st += dt;
    if (e.state === 'dead') {
      if (e.st > 0.7) e.fade = Math.max(0, 1 - (e.st - 0.7) / 0.4);
      if (e.st > 1.3) this.respawn(e);
      return;
    }
    if (e.state === 'hurt') {
      this.knock(e, dt);
      e.hold = e.sh.anims.die[0] + (e.st < 0.08 ? 0 : 1);
      if (e.st >= e.stun) { e.state = 'chase'; e.hold = null; }
      return;
    }
    const dx = p.x - e.x, dy = p.y - e.y, l = len(dx, dy);
    e.cd -= dt;
    if (e.state === 'atk') {
      if (!e.done && e.st >= 0.38) {
        e.done = true;
        if (l < 58 + p.r && (dx * e.dx + dy * e.dy) / l > 0.4) this.hurtPlayer(8, dx / l, dy / l);
      }
      if (e.st >= 0.6) { e.state = 'chase'; e.cd = rnd(0.7, 1.2); }
      return;
    }
    if (l > 700) { this.play(e, 'stand', 6); return; }
    this.faceTo(e, dx, dy);
    if (l < 40 + p.r && e.cd <= 0) { Object.assign(e, { state: 'atk', st: 0, done: false }); this.play(e, 'swing', 7, false); return; }
    if (l > 32 + p.r) { this.step(e, dx / l * e.spd * dt, dy / l * e.spd * dt); this.play(e, 'run', 10); }
    else this.play(e, 'stand', 6);
  }

  // keep bodies apart (n^2 is fine at 150)
  separate() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
        if (dx > min || dx < -min || dy > min || dy < -min) continue;
        const d = Math.hypot(dx, dy);
        if (d >= min || d < 0.001) continue;
        const push = (min - d) / 2 / d;
        a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
      }
    }
  }

  // ---- boss: charge (line), slam (circle), quake (three rings) ----
  updateBoss(dt) {
    const b = this.boss, p = this.player, g = this.tele;
    g.clear();
    b.st += dt;
    if (b.state === 'dead') {
      if (b.st > 1.0) b.fade = Math.max(0, 1 - (b.st - 1.0) / 0.6);
      if (b.st > 3) Object.assign(b, this.freeSpot(450), { hp: b.maxHp, alive: true, state: 'idle', st: 0, fade: null });
      return;
    }
    this.knock(b, dt);
    const dx = p.x - b.x, dy = p.y - b.y, l = len(dx, dy);
    if (b.state === 'idle') {
      this.faceTo(b, dx, dy);
      this.play(b, 'stand', 6);
      if (b.st > 0.7) {
        const r = Math.random();
        b.st = 0;
        if (l > 300) b.state = r < 0.6 ? 'chargeWind' : 'quake';
        else b.state = r < 0.55 ? 'walk' : 'quake';
        if (b.state === 'chargeWind') { b.cdx = dx / l; b.cdy = dy / l; b.hitP = false; }
        if (b.state === 'quake') b.rings = 0;
      }
    } else if (b.state === 'walk') {
      this.faceTo(b, dx, dy);
      this.play(b, 'run', 10);
      this.step(b, dx / l * 120 * dt, dy / l * 120 * dt);
      if (l < 150 || b.st > 2.5) { b.state = 'slamWind'; b.st = 0; b.sx = b.x + b.dx * 95; b.sy = b.y + b.dy * 95; }
    } else if (b.state === 'slamWind') {
      const k = Math.min(1, b.st / 0.7);
      b.hold = b.sh.anims.swing[0] + 1;
      g.circle(b.sx, b.sy, 110).fill({ color: 0xff2020, alpha: 0.12 }).stroke({ width: 3, color: 0xff4040, alpha: 0.7 });
      g.circle(b.sx, b.sy, 110 * k).fill({ color: 0xff3030, alpha: 0.25 });
      if (k >= 1) {
        b.state = 'recover'; b.st = 0; b.hold = b.sh.anims.swing[0] + 3;
        this.addImpact(b.sx, b.sy, 1.9);
        this.shake(10);
        this.hitstop = Math.max(this.hitstop, 0.06);
        const ex = p.x - b.sx, ey = p.y - b.sy, el = len(ex, ey);
        if (el < 110 + p.r) this.hurtPlayer(20, ex / el, ey / el, 380);
      }
    } else if (b.state === 'chargeWind') {
      this.faceTo(b, b.cdx, b.cdy);
      this.play(b, 'stand', 14);
      const k = Math.min(1, b.st / 0.75), L = 480, W = 36, nx = -b.cdy * W, ny = b.cdx * W;
      const ex = b.x + b.cdx * L, ey = b.y + b.cdy * L, mx = b.x + b.cdx * L * k, my = b.y + b.cdy * L * k;
      g.poly([b.x + nx, b.y + ny, ex + nx, ey + ny, ex - nx, ey - ny, b.x - nx, b.y - ny]).fill({ color: 0xff2020, alpha: 0.12 }).stroke({ width: 3, color: 0xff4040, alpha: 0.7 });
      g.poly([b.x + nx, b.y + ny, mx + nx, my + ny, mx - nx, my - ny, b.x - nx, b.y - ny]).fill({ color: 0xff3030, alpha: 0.25 });
      if (k >= 1) { b.state = 'charge'; b.st = 0; b.ox = b.x; b.oy = b.y; }
    } else if (b.state === 'charge') {
      this.play(b, 'run', 20);
      const ox = b.x, oy = b.y;
      this.step(b, b.cdx * 640 * dt, b.cdy * 640 * dt);
      if ((this.ghostT = (this.ghostT || 0) - dt) <= 0) { this.ghostT = 0.05; this.ghost(b); }
      if (!b.hitP && len(p.x - b.x, p.y - b.y) < b.r + p.r + 8) { b.hitP = true; this.hurtPlayer(18, b.cdx, b.cdy, 460); }
      const blocked = len(b.x - ox, b.y - oy) < 640 * dt * 0.3;
      if (len(b.x - b.ox, b.y - b.oy) >= 480 || blocked || b.st > 1) {
        b.state = 'recover'; b.st = -0.4; // a longer breather after a charge: the opening
        if (blocked) { this.shake(8); this.addImpact(b.x + b.cdx * 30, b.y + b.cdy * 30, 1.2); }
      }
    } else if (b.state === 'quake') {
      this.play(b, 'block', 4);
      const R = [[40, 140], [140, 240], [240, 340]], at = [0.6, 1.0, 1.4];
      for (let i = b.rings; i < 3; i++) {
        const k = Math.max(0, Math.min(1, (b.st - (at[i] - 0.6)) / 0.6));
        if (k <= 0) continue;
        g.circle(b.x, b.y, R[i][1]).fill({ color: 0xff2020, alpha: 0.1 + 0.18 * k }).circle(b.x, b.y, R[i][0]).cut();
        g.circle(b.x, b.y, R[i][1]).stroke({ width: 2, color: 0xff4040, alpha: 0.6 });
      }
      if (b.rings < 3 && b.st >= at[b.rings]) {
        const [r0, r1] = R[b.rings];
        b.rings++;
        b.hold = b.sh.anims.swing[0] + 3;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + b.rings; this.addImpact(b.x + Math.cos(a) * (r0 + r1) / 2, b.y + Math.sin(a) * (r0 + r1) / 2, 0.9); }
        this.shake(6);
        if (l > r0 - p.r && l < r1 + p.r) this.hurtPlayer(14, dx / l, dy / l, 300);
      } else if (b.hold != null && b.st - at[b.rings - 1] > 0.15) b.hold = null;
      if (b.st >= 1.8) { b.state = 'idle'; b.st = 0; b.hold = null; }
    } else if (b.state === 'recover') {
      if (b.st >= 0.5) { b.state = 'idle'; b.st = 0; b.hold = null; }
    }
  }

  close() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    if (this.app) this.app.destroy(true, { children: true });
    this.app = null;
    this.el.remove();
    this.onClose();
  }
}
