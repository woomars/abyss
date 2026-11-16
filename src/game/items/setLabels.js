// The set screen's stage lines, built from the tuning tables (tuning/sets.json) so a changed table
// changes the line too. Each line lists what that stage adds; items.json labels are the fallback.
import { t, tr } from '../../i18n/index.js';

const TABLE = { abyss: 'lightning', arcaneVeil: 'storm', meteor: 'meteor', galeHunter: 'gale', gravecall: 'wraith' };
const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const STAT = { damage: pct, chainDamage: pct, chain: String, maxHp: String, attackFlat: String };
const stats = (row) => Object.entries(row || {}).filter(([k, v]) => v && STAT[k]).map(([k, v]) => t(`set.${k}`, { v: STAT[k](v) }));

export function setLabel(cfg, setId, n) {
  const T = cfg.setTables && cfg.setTables[TABLE[setId]], i = n - 1, out = [];
  if (!T) return tr((cfg.sets[setId].labels || {})[n] || '');
  const add = (key, v, f = pct) => { if (v) out.push(t(key, { v: f(v) })); };
  if (setId === 'abyss') {
    out.push(...stats(T.stats && T.stats[i]));
    add('set.chainStun', T.stun[i]);
    if (n === 5) out.push(t('set.lightningFull'));
  } else if (setId === 'arcaneVeil') {
    add('set.blade', T.radius[i]);
    add('set.spinStun', T.stun[i]);
    if (n === 5) out.push(t('set.stormFull'));
  } else if (setId === 'meteor') {
    add('set.core', T.coreRadius[i]);
    add('set.area', T.radiusScale[i]);
    add('set.reach', T.distance[i]);
    if (n < 5) add('set.push', T.knockback[i]);
    if (n === 5) out.push(t('set.meteorFull'));
  } else if (setId === 'galeHunter') {
    add('set.waveDamage', T.damage[i]);
    add('set.falloff', T.falloff[i]);
    add('set.waveStun', T.stun[i]);
    if (T.angles && T.angles[n] !== T.angles[n - 1]) out.push(t('set.angle', { v: T.angles[n] }));
    const sum = T.stun.slice(0, n).reduce((a, b) => a + b, cfg.stunBase || 0);
    if (n === 5 && sum >= 1 - 1e-9) out.push(t('set.galeSure'));
  } else if (setId === 'gravecall') {
    if (n === 1) out.push(t('set.wraithRule'));
    const row = T.summons[i];
    if (row) {
      const lives = [...new Set(row.life)];
      out.push(t('set.wraith', { n: row.count, s: lives.join('·') }));
    }
    out.push(...stats(T.stats && T.stats[i]));
    add('set.wraithStun', T.stun[i]);
  }
  return out.join(', ');
}
