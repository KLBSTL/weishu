// User-confirmed R12 advanced bounties, 2026-10-17. Values precede the existing round multipliers.
export const ADVANCED_BOUNTIES = Object.freeze([
  ['soldier', 'enemy_1002_nsabr', 0], ['abandoned', 'enemy_2005_axetro', 3],
  ['hymn', 'enemy_2013_csbot', 3], ['golem', 'enemy_2003_rockman', 4],
  ['caster', 'enemy_2072_skdny2', 5], ['degen', 'enemy_1525_blkswb', 6],
  ['wolf', 'enemy_1535_wlfmster', 6], ['patriot', 'enemy_1506_patrt', 7],
  ['cliff', 'enemy_1546_cliff', 7], ['knight', 'enemy_2038_sydonq', 9],
  ['wood', 'enemy_2055_smlead', 9], ['steam', 'enemy_1533_stmkgt', 9],
]);

export function prepareAdvancedBounties(ctx) {
  const existing = new Set(['abandoned', 'golem', 'degen', 'wolf']);
  ctx.act.enemyInfoDict.ADVANCED_BOUNTIES = [...ADVANCED_BOUNTIES.filter(x => !existing.has(x[0])).map(x => x[1]), 'enemy_2073_skzrck'];
}

export function finishAdvancedBounties({ config, choices, effects, enemies }) {
  for (const [key, maxHp, atk] of [
    ['enemy_2013_csbot', 20000, 900], ['enemy_2072_skdny2', 30000, 350],
    ['enemy_2038_sydonq', 40000, 1400], ['enemy_2055_smlead', 60000, 700],
  ]) Object.assign(enemies[key].stats, { maxHp, atk });
  // This child is not an objective and never holds a cleared battle open.
  enemies.enemy_2073_skzrck.notCountInTotal = true;
  for (const [id, enemyKey, coin] of ADVANCED_BOUNTIES) {
    const effectId = `advanced_bounty_${id}`;
    const name = `${id === 'soldier' ? '整合运动士兵' : enemies[enemyKey].name}·悬赏`;
    const desc = `为自身第12回合作战添加1名${id === 'soldier' ? '整合运动士兵' : enemies[enemyKey].name}，完整击败后获得${coin}资金，下回合到账；漏怪扣1生命。`;
    const params = { count: 1, coin, round: 1, enemy_id: enemyKey };
    effects[effectId] = { effectId, effectType: 'ENEMY_GAIN', name, desc, descRaw: desc,
      counterType: 'NONE', continuedRound: -1, decoIconId: null, enemyPrice: coin, advancedBounty: true,
      buffs: [{ key: 'add_enemy_kill_gain_coin', countType: 'NONE', bb: { count: 1, coin, round: 1 }, bbStr: { enemy_id: enemyKey } }], params };
    choices.cards.bounty.push({ effectId, name, desc, tier: 3, coin, payout: 'kill', rounds: 1,
      multiRound: false, enemyKey, count: 1, draft: true, draftPool: 'advanced', advancedBounty: true,
      adds: [{ enemyKey, count: 1, coin, rounds: 1, payout: 'kill', buffKey: 'add_enemy_kill_gain_coin' }],
      draftExcluded: null, series: null });
  }
  choices.bountyDrafts.advanced = { maxTotal: 30, pick: 'uniformLegalSet', count: 6 };
  for (const type of ['single', 'multi']) {
    const mode = config.modes[`mode_${type}_catastrophe`], schedule = choices.schedule[mode.modeId];
    mode.spRounds.push(12);
    mode.rounds['12'].isSpPrepare = true;
    schedule.spRounds.push(12);
    schedule.rounds['12'] = { families: [{ family: 'bounty', weight: 1 }], cards: type === 'single' ? 3 : 6,
      bountyDraft: 'advanced', events: {}, assumed: false };
  }
}
