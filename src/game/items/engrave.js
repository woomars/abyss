// 각인 (Phase 6, 8.6): a set name engraved on a legendary of a set part. Gold first; the chance falls
// with each try on the same item (tuning/engrave.json chance) and the hammer's three blows add to it.
// Success: a set name at random (a different one if it already had one); its own effect stays.
// Failure: the item is gone, and a generous heap of powder is left (gear with a legacy token stays).
// The roll is a shuffle bag: for each chance (in whole %) a bag of 100 balls with that many winners,
// drawn without putting back and refilled when empty — so 90% wins exactly 90 of every 100 tries.
import { findItem, powderOf } from './Forge.js';

const pick = (list, i) => list[Math.min(i, list.length - 1)];

// legendary, and a part the sets have (weapon, helm, armor, gloves, boots)
export function canEngrave(cfg, item) {
  if (!item || item.grade !== 'legendary') return false;
  const any = Object.values(cfg.sets)[0];
  return !!any && Object.prototype.hasOwnProperty.call(any.pieces, item.slot);
}

export function engraveCost(econ, item) {
  const e = econ.engrave;
  return Math.round(e.base * (1 + e.perAttempt * (item.engraves || 0)));
}

// hits: good blows of the three (0..3)
export function engraveChance(ecfg, item, hits) {
  const c = pick(ecfg.chance, item.engraves || 0) + (ecfg.hitBonus[String(hits)] || 0);
  return Math.max(0, Math.min(1, Math.round(c * 1e6) / 1e6));
}

// the three blows' speeds (seconds until the red band meets the target): normal, or now and then fast / slow
export function hammerSpeeds(ecfg, item, rng) {
  const normal = pick(ecfg.normalChance, item.engraves || 0), s = ecfg.speeds;
  return [0, 1, 2].map(() => { const r = rng(); return r < normal ? s.normal : r < normal + (1 - normal) / 2 ? s.fast : s.slow; });
}

// one ball from the bag of this chance (bags: { "90": { win, lose } } — kept by the family)
export function drawBag(bags, chance, rng) {
  const pct = Math.round(chance * 100);
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  const k = String(pct);
  let b = bags[k];
  if (!b || b.win + b.lose <= 0) b = bags[k] = { win: pct, lose: 100 - pct };
  const won = rng() * (b.win + b.lose) < b.win;
  if (won) b.win -= 1; else b.lose -= 1;
  return won;
}

export const judgeHit = (press, target, tol) => Math.abs(press - target) <= tol + 1e-9;

// the whole try: pays, rolls, and engraves or breaks; { ok, success, chance, set, powder }
export function engraveItem(ctx, ecfg, id, hits, rng) {
  const f = findItem(ctx, id);
  if (!f || !canEngrave(ctx.cfg, f.item)) return { ok: false, reason: 'item' };
  const it = f.item, cost = engraveCost(ctx.econ, it);
  if (ctx.vault.gold < cost) return { ok: false, reason: 'gold' };
  ctx.vault.gold -= cost;
  const chance = engraveChance(ecfg, it, hits);
  if (!ctx.vault.engraveBags) ctx.vault.engraveBags = {};
  if (drawBag(ctx.vault.engraveBags, chance, rng)) {
    const sets = Object.keys(ctx.cfg.sets).filter((k) => k !== it.set);
    it.set = sets[Math.floor(rng() * sets.length) % sets.length];
    if (!it.legendary) it.name = ctx.cfg.sets[it.set].pieces[it.slot]; // a set piece is named after its new set; a unique keeps its name
    it.engraves = (it.engraves || 0) + 1;
    ctx.vault.markSeen(it);
    return { ok: true, success: true, chance, set: it.set, cost };
  }
  if (it.token) return { ok: true, success: false, chance, kept: true, cost }; // a legacy token keeps it whole
  // broken: off the hero, out of the bag or the stash, into powder
  if (f.where === 'equipped') ctx.loadout.unequip(f.slot);
  else {
    const list = f.where === 'pocket' ? ctx.pocket : ctx.vault.stash;
    list.splice(list.indexOf(it), 1);
  }
  const powder = powderOf(ctx, it, [0, 0, 0]);
  powder[it.quality] += ctx.cfg.grades[it.grade].powder * (ecfg.failPowder - 1);
  for (let q = 0; q < 3; q++) ctx.vault.powder[q] += powder[q];
  return { ok: true, success: false, chance, powder, cost };
}
