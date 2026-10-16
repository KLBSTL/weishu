// Maintainer-defined 天灾 rules, shared by the match and deterministic browser/server battle.
export const CATASTROPHE_ENEMY = Object.freeze({ hpMul: 100, atkMul: 10, defMul: 10, resMul: 3, damageTakenMul: 0.05 });

export function isCatastropheMode(modeId) {
  return modeId === 'mode_single_catastrophe' || modeId === 'mode_multi_catastrophe';
}

/** @param {{modeId?: string|null, round?: number, kind?: string}} battle */
export function isCatastropheBossBattle(battle) {
  return isCatastropheMode(battle.modeId) && (battle.round === 14 || battle.round === 15)
    && (battle.kind === 'boss' || battle.kind === 'hidden');
}
