// User-approved fan squads; concrete design: docs/design/recruitment-squads.md.
export function finishRecruitment(files) {
  const specs = [
    { id: 'sarkaz', name: '薪火集结分队', hp: 22, bond: 'sarkazShip', rounds: [], count: 2,
      desc: '每个正式回合首次主动刷新商店时，优先出现2名不同的普通<萨卡兹>干员，仍需正常购买。不超过调度中心等级，遵守库存与禁用；不足时其余栏位正常刷新。免费刷新也可触发，回合开始的自动刷新不消耗次数。' },
    { id: 'columbia', name: '拓界研发分队', hp: 26, bond: 'columbiaShip', rounds: [], count: 1,
      desc: '每个正式回合开始时，若资金大于等于10，消耗1资金，随机获得1名不高于当前调度中心等级的普通<哥伦比亚>干员。遵守共享库存与禁用；无合格干员或存放空间时不扣款。' },
  ];
  for (const [i, s] of specs.entries()) {
    const bandId = `band_recruit_${s.id}`, effectId = `effect_recruit_${s.id}`;
    files.effects[effectId] = { effectId, name: s.name, desc: s.desc, descRaw: s.desc, buffs: [], params: {} };
    files.bands[bandId] = { bandId, sortId: 100 + i, name: s.name, iconId: `recruit_${s.id}`,
      modeTypeList: ['SINGLE', 'MULTI'], totalHp: s.hp, effectId, effectName: s.name, desc: s.desc, descRaw: s.desc,
      buffs: [], params: {}, victorCount: 0, rewardModulus: 1, unlockDesc: null, bondIds: [s.bond],
      recruitment: s.id === 'sarkaz' ? null : { kind: 'columbia-income', bond: s.bond, rounds: [], count: 1,
        minFunds: 10, cost: 1, initialChess: null } };
    if (s.id === 'sarkaz') files.bands[bandId].shopPriority = { bond: s.bond, count: 2 };
  }
}
