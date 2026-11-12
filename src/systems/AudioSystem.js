// Sound effects. Recorded samples (config.audio, see assets/audio/CREDITS.md) are used when loaded;
// otherwise each event falls back to a synthesized Web Audio voice. All playback goes through play().
import { hitSound, deathSound, skillSound } from './soundMap.js';

const MAX_VOICES = 24;
// sample name -> synth voice used until (or if) the sample loads
const FALLBACK = {
  slash: 'slash', hit: 'impact', hitHeavy: 'heavyImpact', crit: 'critImpact',
  deathSoldier: 'death', deathElite: 'death', deathBoss: 'death', enemyAttack: 'whoosh', hurt: 'hurt',
  skillSpin: 'skill_spin', skillRush: 'skill_rushStrike', skillWave: 'skill_bladeWave', skillHit: 'heavyImpact',
};

export class AudioSystem {
  constructor(events, rng, audioCfg = null) {
    this.rng = rng;
    this.cfg = audioCfg; // config.audio (files, volume, byType)
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = true;
    this.voices = 0;
    this.hitsThisFrame = 0;
    this.frameTag = 0;
    this.buffers = new Map();

    events.on('slash', (e) => this.sample('slash', { pitch: 1 + e.chainIndex * 0.06, gain: e.strong ? 1.2 : 1 }));
    events.on('hit', (e) => {
      if (!this.budgetHit()) return;
      const name = this.cfg ? hitSound(e, this.cfg) : (e.crit ? 'crit' : e.enemy && e.enemy.isElite ? 'hitHeavy' : 'hit');
      const pitch = name === 'hit' ? 1 + e.chainIndex * 0.05 : name === 'skillHit' ? 1 + Math.min(e.chainIndex, 6) * 0.03 : 1;
      this.sample(name, { pitch, gain: e.skill && e.crit ? 1.2 : 1 });
    });
    events.on('kill', (e) => this.sample(this.cfg ? deathSound(e.enemy && e.enemy.type, this.cfg) : 'deathSoldier'));
    events.on('chainLink', (e) => this.play('link', { pitch: 1 + 0.12 * e.chainIndex }));
    events.on('turn', () => this.play('whoosh', { gain: 0.7 }));
    events.on('skill', (e) => this.sample(this.cfg ? skillSound(e.id, this.cfg) : `skill_${e.id}`));
    events.on('enemyStrike', () => this.sample('enemyAttack'));
    events.on('playerHit', () => this.sample('hurt'));
    events.on('playerDown', () => this.play('down'));
    events.on('exitOpen', () => this.play('chime'));
    events.on('chestOpen', (e) => this.play('coins', { gain: e.big ? 1.3 : 1 }));
    events.on('floorExit', () => this.play('portal'));
    events.on('enemyShoot', () => this.play('bow'));
    events.on('wraithBlink', () => this.play('blink'));
    events.on('bossPattern', (e) => this.play(e.kind === 'summon' ? 'summon' : 'warn'));
    events.on('bossEnrage', () => this.play('roar'));
    events.on('bossBasic', () => this.play('warn', { gain: 0.55, pitch: 1.35 }));
    events.on('chainBroken', () => this.play('whoosh', { gain: 0.6, pitch: 0.6 }));
    events.on('relicOffer', () => this.play('chime', { pitch: 0.8 }));
    events.on('lootDrop', (e) => { if (e.item.grade === 'epic' || e.item.grade === 'legendary') this.play('chime', { pitch: 0.6, gain: 0.8 }); });
    events.on('lootPickup', (e) => {
      const i = ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(e.item.grade);
      if (i >= 4) { this.play('portal', { pitch: 1.6, gain: 0.6 }); this.play('chime', { pitch: 1.3, gain: 1.2 }); }
      else this.play('coins', { pitch: 0.8 + i * 0.12, gain: 0.5 + i * 0.15 });
    });
    events.on('levelUp', () => { this.play('chime', { pitch: 1 }); setTimeout(() => this.play('chime', { pitch: 1.5 }), 120); });
    events.on('setComplete', () => { this.play('roar', { pitch: 1.4, gain: 0.6 }); this.play('chime', { pitch: 1.2, gain: 1.3 }); });
    events.on('forgeAction', (e) => {
      if (e.kind === 'equip' || e.kind === 'unequip') this.play('clank');
      else if (e.kind === 'salvage') this.play('crush');
      else if (e.kind === 'enhance') this.play('hammer');
      else if (e.kind === 'enhanceUp') { this.play('hammer'); setTimeout(() => this.play('chime', { pitch: 1.3 }), 90); }
      else this.play('coins', { gain: 0.5, pitch: 0.7 });
    });
    events.on('legacyToken', () => { this.play('roar', { pitch: 0.8, gain: 0.5 }); this.play('chime', { pitch: 0.7, gain: 1.3 }); });
    events.on('tokenApplied', () => { this.play('hammer', { pitch: 0.8 }); setTimeout(() => this.play('chime', { pitch: 1.1, gain: 1.4 }), 150); });
    events.on('stun', () => this.play('chime', { pitch: 2.2, gain: 0.35 }));
    events.on('stormZap', () => this.play('blink', { pitch: 1.8, gain: 0.5 }));
    events.on('quake', () => this.play('roar', { pitch: 2, gain: 0.35 }));
    events.on('setBlast', () => this.play('portal', { pitch: 0.7, gain: 0.8 }));
    events.on('evade', () => this.play('blink', { pitch: 1.2, gain: 0.6 }));
    events.on('relicReroll', () => this.play('coins', { gain: 0.8 }));
    events.on('relicPick', () => this.play('chime', { pitch: 1.25, gain: 1.2 }));
  }

  // fetch + decode every configured sample (after the AudioContext exists)
  loadSamples() {
    if (!this.cfg || this.loading) return;
    this.loading = true;
    for (const [name, url] of Object.entries(this.cfg.files)) {
      fetch(url)
        .then((r) => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
        .then((a) => this.ctx.decodeAudioData(a))
        .then((buf) => { this.buffers.set(name, buf); })
        .catch((err) => console.warn('sound not loaded, using synth', name, err));
    }
  }

  // recorded sample if loaded, else the synthesized fallback voice
  sample(name, { pitch = 1, gain = 1 } = {}) {
    const buf = this.buffers.get(name);
    if (!buf) { this.play(FALLBACK[name] || name, { pitch, gain }); return; }
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    if (this.voices >= MAX_VOICES) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch * (1 + (this.rng() * 2 - 1) * 0.04);
    const g = this.ctx.createGain();
    const vol = this.cfg && this.cfg.volume[name] != null ? this.cfg.volume[name] : 1;
    g.gain.value = vol * gain * (1 + (this.rng() * 2 - 1) * 0.08);
    src.connect(g);
    g.connect(this.master);
    src.start();
    this.voices++;
    src.onended = () => { this.voices--; };
  }

  // must be called from a user gesture (first pointerdown)
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.6 : 0;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.loadSamples();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (err) {
      console.warn('audio unavailable', err);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.6 : 0;
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // at most 3 impact sounds per slash so big crowds don't clip
  budgetHit() {
    const tag = this.ctx ? Math.floor(this.ctx.currentTime * 60) : 0;
    if (tag !== this.frameTag) { this.frameTag = tag; this.hitsThisFrame = 0; }
    this.hitsThisFrame++;
    return this.hitsThisFrame <= 3;
  }

  play(name, { pitch = 1, gain = 1 } = {}) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    if (this.voices >= MAX_VOICES) return;
    const p = pitch * (1 + (this.rng() * 2 - 1) * 0.06);
    const g = gain * (1 + (this.rng() * 2 - 1) * 0.1);
    const fn = VOICES[name];
    if (fn) fn(this, p, g);
  }

  // --- building blocks ---
  track(node, stopAt) {
    this.voices++;
    node.onended = () => { this.voices--; };
    node.stop(stopAt);
  }

  env(peak, attack, decay) {
    const t = this.ctx.currentTime;
    const gn = this.ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    gn.connect(this.master);
    return gn;
  }

  tone(type, f0, f1, peak, dur, attack = 0.003) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    o.connect(this.env(peak, attack, dur));
    o.start(t);
    this.track(o, t + attack + dur + 0.02);
  }

  noiseBurst(filterType, f0, f1, q, peak, dur, attack = 0.002) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    src.connect(f);
    f.connect(this.env(peak, attack, dur));
    src.start(t, this.rng() * 0.3);
    this.track(src, t + attack + dur + 0.02);
  }
}

const VOICES = {
  clank: (a, p, g) => {
    a.tone('square', 1800 * p, 1500 * p, 0.05 * g, 0.12);
    a.noiseBurst('highpass', 3000 * p, 2000 * p, 1, 0.18 * g, 0.08);
  },
  crush: (a, p, g) => {
    a.noiseBurst('lowpass', 1800 * p, 200 * p, 0.8, 0.35 * g, 0.35);
    a.tone('sawtooth', 160 * p, 60 * p, 0.1 * g, 0.3);
  },
  hammer: (a, p, g) => {
    a.tone('triangle', 900 * p, 820 * p, 0.2 * g, 0.35);
    a.tone('square', 2600 * p, 2400 * p, 0.04 * g, 0.2);
    a.noiseBurst('bandpass', 2400 * p, 1600 * p, 2, 0.25 * g, 0.06);
  },
  slash: (a, p, g) => a.noiseBurst('bandpass', 3200 * p, 900 * p, 1.2, 0.35 * g, 0.09),
  impact: (a, p, g) => {
    a.tone('sine', 150 * p, 55, 0.6 * g, 0.12);
    a.noiseBurst('lowpass', 2500, 400, 0.7, 0.25 * g, 0.05);
  },
  critImpact: (a, p, g) => {
    a.tone('sine', 120 * p, 38, 0.8 * g, 0.24);
    a.tone('triangle', 1400 * p, 900 * p, 0.18 * g, 0.18);
    a.noiseBurst('lowpass', 4000, 300, 0.7, 0.35 * g, 0.08);
  },
  heavyImpact: (a, p, g) => {
    a.tone('sine', 95 * p, 32, 0.8 * g, 0.2);
    a.noiseBurst('lowpass', 900, 150, 0.8, 0.35 * g, 0.12);
  },
  death: (a, p, g) => {
    a.noiseBurst('lowpass', 1600 * p, 250, 0.8, 0.22 * g, 0.16);
    a.tone('square', 320 * p, 110, 0.06 * g, 0.12);
  },
  link: (a, p, g) => a.tone('sine', 880 * p, 1320 * p, 0.14 * g, 0.08, 0.002),
  bow: (a, p, g) => {
    a.tone('triangle', 520 * p, 180 * p, 0.1 * g, 0.08);
    a.noiseBurst('highpass', 3000 * p, 6000 * p, 1, 0.1 * g, 0.12, 0.005);
  },
  blink: (a, p, g) => {
    a.tone('sine', 900 * p, 200 * p, 0.08 * g, 0.3, 0.02);
    a.noiseBurst('bandpass', 1800 * p, 400 * p, 3, 0.08 * g, 0.3, 0.03);
  },
  warn: (a, p, g) => {
    a.tone('sawtooth', 110 * p, 90 * p, 0.12 * g, 0.4, 0.05);
    a.tone('sine', 55 * p, 45 * p, 0.3 * g, 0.45, 0.05);
  },
  summon: (a, p, g) => {
    a.tone('triangle', 200 * p, 600 * p, 0.1 * g, 0.5, 0.05);
    a.noiseBurst('bandpass', 600 * p, 2000 * p, 2, 0.1 * g, 0.5, 0.1);
  },
  roar: (a, p, g) => {
    a.tone('sawtooth', 150 * p, 60 * p, 0.25 * g, 1.0, 0.05);
    a.noiseBurst('lowpass', 900, 120, 0.8, 0.35 * g, 1.0, 0.05);
  },
  chime: (a, p, g) => {
    a.tone('sine', 660 * p, 660 * p, 0.16 * g, 0.5, 0.01);
    a.tone('sine', 990 * p, 990 * p, 0.12 * g, 0.6, 0.06);
  },
  coins: (a, p, g) => {
    for (let i = 0; i < 4; i++) setTimeout(() => { if (a.ctx) a.tone('triangle', (1400 + i * 260) * p, (1500 + i * 260) * p, 0.1 * g, 0.14); }, i * 55);
  },
  portal: (a, p, g) => {
    a.noiseBurst('bandpass', 300 * p, 2400 * p, 2, 0.2 * g, 0.45, 0.05);
    a.tone('sine', 220 * p, 880 * p, 0.12 * g, 0.45, 0.02);
  },
  whoosh: (a, p, g) => a.noiseBurst('bandpass', 500 * p, 1700 * p, 2.5, 0.12 * g, 0.12, 0.02),
  hurt: (a, p, g) => {
    a.tone('square', 220 * p, 90, 0.12 * g, 0.16);
    a.noiseBurst('lowpass', 1200, 200, 0.8, 0.3 * g, 0.1);
  },
  down: (a, p, g) => {
    a.tone('sawtooth', 180 * p, 40, 0.18 * g, 0.9, 0.01);
    a.noiseBurst('lowpass', 800, 60, 0.7, 0.35 * g, 0.7, 0.01);
  },
  skill_spin: (a, p, g) => {
    a.noiseBurst('bandpass', 400 * p, 2400 * p, 1.5, 0.3 * g, 0.3, 0.04);
    a.tone('sawtooth', 220 * p, 90, 0.08 * g, 0.3);
  },
  skill_rushStrike: (a, p, g) => {
    a.noiseBurst('bandpass', 300 * p, 3000 * p, 1.2, 0.3 * g, 0.22, 0.01);
    a.tone('sine', 110 * p, 40, 0.6 * g, 0.25);
  },
  skill_bladeWave: (a, p, g) => {
    a.tone('sawtooth', 300 * p, 1200 * p, 0.08 * g, 0.25, 0.01);
    a.noiseBurst('highpass', 1500 * p, 5000 * p, 1, 0.15 * g, 0.25, 0.01);
  },
};
