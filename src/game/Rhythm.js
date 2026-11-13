// Beat mixing for attacks: a stage is a list of beats (seconds to the next attack) and telegraph
// lengths (short / mid / long), cycled together. Higher stages mix quick and slow beats, so the
// player has to read the warning and wait for the long gap to strike. Pure.
export class Rhythm {
  constructor(stage) {
    this.beats = (stage && stage.beats && stage.beats.length) ? stage.beats : [2];
    this.tele = (stage && stage.tele && stage.tele.length) ? stage.tele : ['mid'];
    this.i = 0;
  }

  reset() { this.i = 0; }

  next() {
    const i = this.i++;
    return { wait: this.beats[i % this.beats.length], tele: this.tele[i % this.tele.length] };
  }
}

// the table `name` at `stage` (1-based, clamped to the table)
export function rhythmFor(cfg, name, stage = 1) {
  const list = (cfg.rhythms && cfg.rhythms[name]) || [];
  const s = list[Math.max(0, Math.min(list.length - 1, Math.round(stage) - 1))];
  return new Rhythm(s);
}

// how long a telegraph lasts: the base windup scaled by its kind
export function teleTime(cfg, base, tele) {
  const k = (cfg.teleScale && cfg.teleScale[tele]) || 1;
  return base * k;
}
