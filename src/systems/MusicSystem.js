// Background music. One streamed <audio> element; the stage type picks a playlist that plays in
// fixed order (see Playlist). Switching type fades the old track out, new tracks fade in.
// Volume = config volume × duck (pause menu / game over) × fade; off = paused element.
import { Playlist } from './Playlist.js';

export class MusicSystem {
  constructor(cfg, { createAudio = () => new Audio() } = {}) {
    this.cfg = cfg; // config.music (live)
    this.createAudio = createAudio;
    this.playlist = new Playlist(cfg.playlists);
    this.el = null;
    this.type = null;     // stage type now playing (or fading in)
    this.pending = null;  // stage type to switch to once the fade-out ends
    this.track = null;
    this.fade = 0;        // 0..1 multiplier
    this.enabled = true;
    this.ducked = false;
    this.suspended = false;
  }

  ensureEl() {
    if (this.el) return this.el;
    const el = this.createAudio();
    el.preload = 'auto';
    el.addEventListener('ended', () => this.startTrack()); // next track of the same type, in order
    this.el = el;
    return el;
  }

  // switch to a stage type; same type keeps the current track running
  play(type) {
    if (type === this.type && !this.pending) { this.kick(); return; }
    if (!this.track || this.fade <= 0.001 || !this.audible()) { this.type = type; this.pending = null; this.startTrack(); return; }
    this.pending = type; // update() fades out, then starts it
  }

  // skip to the next track of the current type (debug)
  next() { if (this.type) this.startTrack(); }

  startTrack() {
    const file = this.playlist.take(this.type);
    if (!file) return;
    const el = this.ensureEl();
    this.track = file;
    el.src = file;
    el.loop = this.playlist.size(this.type) === 1;
    this.fade = 0;
    el.volume = 0;
    this.kick();
  }

  audible() { return this.enabled && !this.suspended; }

  kick() {
    if (!this.el || !this.track || !this.audible()) return;
    const r = this.el.play();
    if (r && r.catch) r.catch(() => { this.blocked = true; });
  }

  // call from a user gesture: retries a play() the browser refused before any interaction
  unlock() { if (this.blocked) { this.blocked = false; this.kick(); } }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.el) this.el.pause();
    else this.kick();
  }

  setDuck(on) { this.ducked = on; }
  suspend() { this.suspended = true; if (this.el) this.el.pause(); }
  resume() { this.suspended = false; this.kick(); }

  update(dt) {
    if (!this.el) return;
    const step = dt / Math.max(0.05, this.cfg.fadeTime);
    if (this.pending) {
      this.fade = Math.max(0, this.fade - step * 2); // fade out twice as fast
      if (this.fade === 0) { this.type = this.pending; this.pending = null; this.startTrack(); }
    } else {
      this.fade = Math.min(1, this.fade + step);
    }
    const v = this.cfg.volume * (this.ducked ? this.cfg.duck : 1) * this.fade;
    this.el.volume = Math.min(1, Math.max(0, v));
  }
}
