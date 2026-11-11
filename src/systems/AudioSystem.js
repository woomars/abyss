// Synthesized sound effects (no audio files). All playback goes through play(name, opts),
// so real samples can replace the synth voices later.
const MAX_VOICES = 24;

export class AudioSystem {
  constructor(events, rng) {
    this.rng = rng;
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = true;
    this.voices = 0;
    this.hitsThisFrame = 0;
    this.frameTag = 0;

    events.on('slash', (e) => this.play('slash', { pitch: 1 + e.chainIndex * 0.06, gain: e.strong ? 1.2 : 1 }));
    events.on('hit', (e) => {
      if (!this.budgetHit()) return;
      if (e.crit) this.play('critImpact');
      else if (e.enemy && e.enemy.isElite) this.play('heavyImpact');
      else this.play('impact', { pitch: 1 + e.chainIndex * 0.05 });
    });
    events.on('kill', () => this.play('death'));
    events.on('chainLink', (e) => this.play('link', { pitch: 1 + 0.12 * e.chainIndex }));
    events.on('turn', () => this.play('whoosh', { gain: 0.7 }));
    events.on('skill', (e) => this.play(`skill_${e.id}`));
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
  whoosh: (a, p, g) => a.noiseBurst('bandpass', 500 * p, 1700 * p, 2.5, 0.12 * g, 0.12, 0.02),
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
