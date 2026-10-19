// Maintainer-approved 2026-10-19 balance. Provenance survives summons and unite; base data/count power stay original.
export const FIREBALLS = new Set(['enemy_1177_dufrbl', 'enemy_1177_dufrbl_2']);
const GHOSTS = new Set(['enemy_1008_ghost', 'enemy_1026_aghost']);
export const ultimateRound = r => Number.isInteger(r) && r >= 1 && r <= 13;
export function ultimateBalance(b, key, mods) {
  const active = /_(abyss|catastrophe)$/.test(b.modeId ?? '') && ['normal', 'unite'].includes(b.kind)
    && ultimateRound(b.round) && mods?.ultimateRound === b.round;
  return { atk: active && mods?.ultimateType === 'FIREPOWER' ? .9 : 1,
    hp: active && mods?.ultimateType === 'BREAKTHROUGH' && GHOSTS.has(key) ? .8 : 1,
    freeLeak: active && freeFireball(key, mods) };
}
export function freeFireball(key, mods) {
  return FIREBALLS.has(key) && mods?.ultimateType === 'FIREPOWER' && ultimateRound(mods?.ultimateRound);
}
export const chargeableLeak = l => !!l && l.counted !== false && !freeFireball(l.enemyKey, l.mods);
