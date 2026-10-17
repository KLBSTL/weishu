// Confirmed 2026-10-17 rules, shared by the match and both deterministic battle runners.
export const CATASTROPHE_ENEMY = Object.freeze({ normalSpeedMul: 1.5, bossHpMul: 1.5, hiddenHpMul: 2,
  bossPhysArtsMul: 0.75, hiddenPhysArtsMul: 0.5 });

export function isCatastropheMode(modeId) {
  return modeId === 'mode_single_catastrophe' || modeId === 'mode_multi_catastrophe';
}

/** @param {{modeId?: string|null, round?: number, kind?: string}} battle */
export function isCatastropheBossBattle(battle) {
  return isCatastropheMode(battle.modeId) && (battle.round === 14 || battle.round === 15)
    && (battle.kind === 'boss' || battle.kind === 'hidden');
}

export function isCatastropheHiddenBattle(battle) {
  return isCatastropheMode(battle.modeId) && battle.round === 15 && battle.kind === 'hidden';
}

export function catastropheHpMul(battle) {
  if (!isCatastropheBossBattle(battle)) return 1;
  return battle.round === 15 ? CATASTROPHE_ENEMY.hiddenHpMul : CATASTROPHE_ENEMY.bossHpMul;
}

export function catastropheSpeedMul(battle) {
  return isCatastropheMode(battle.modeId) && battle.round >= 1 && battle.round <= 13 ? CATASTROPHE_ENEMY.normalSpeedMul : 1;
}

export function catastropheDamageMul(battle, type) {
  if (!isCatastropheBossBattle(battle) || (type !== 'phys' && type !== 'arts')) return 1;
  return battle.round === 15 ? CATASTROPHE_ENEMY.hiddenPhysArtsMul : CATASTROPHE_ENEMY.bossPhysArtsMul;
}
