// User-approved fan squads; concrete design: docs/design/recruitment-squads.md.
export function finishRecruitment(files) {
  const specs = [
    { id: 'sarkaz', name: '薪火集结分队', hp: 22, bond: 'sarkazShip', rounds: [], count: 2,
      desc: '每个正式回合首次主动刷新商店时，优先出现2名不同的普通<萨卡兹>干员，仍需正常购买。不超过调度中心等级，遵守库存与禁用；不足时其余栏位正常刷新。免费刷新也可触发，回合开始的自动刷新不消耗次数。' },
    { id: 'columbia', name: '拓界研发分队', hp: 26, bond: 'columbiaShip', rounds: [3, 6, 9], count: 2,
      desc: '第1回合进入休整期时获得普通豆苗。第3、6、9回合进入休整期时获得1张研发调令，可保留。在休整期选1名普通<哥伦比亚>干员作为样本，从高一阶且不超过调度中心等级的2名不同普通<哥伦比亚>干员中选择1名，消耗样本与调令并免费获得所选干员；样本装备回收。' },
  ];
  for (const [i, s] of specs.entries()) {
    const bandId = `band_recruit_${s.id}`, effectId = `effect_recruit_${s.id}`;
    files.effects[effectId] = { effectId, name: s.name, desc: s.desc, descRaw: s.desc, buffs: [], params: {} };
    files.bands[bandId] = { bandId, sortId: 100 + i, name: s.name, iconId: `recruit_${s.id}`,
      modeTypeList: ['SINGLE', 'MULTI'], totalHp: s.hp, effectId, effectName: s.name, desc: s.desc, descRaw: s.desc,
      buffs: [], params: {}, victorCount: 0, rewardModulus: 1, unlockDesc: null, bondIds: [s.bond],
      recruitment: s.id === 'sarkaz' ? null : { kind: s.id, bond: s.bond, rounds: s.rounds, count: s.count,
        initialChess: s.id === 'columbia' ? Object.values(files.chess).find(c => !c.isGolden && c.charId === 'char_452_bstalk')?.chessId : null } };
    if (s.id === 'sarkaz') files.bands[bandId].shopPriority = { bond: s.bond, count: 2 };
  }
}
