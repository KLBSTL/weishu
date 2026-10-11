// User-approved expansion and temporary recruitment pool reduction.
export const COLUMBIA_ROSTER = Object.freeze([
  ['bstalk', 'char_452_bstalk', 1, null, null, 1],
  ['tinman', 'char_4151_tinman', 2, 'chess_char_2_19_a', 'investShip', 1],
  ['silent', 'char_108_silent', 2, 'chess_char_2_02_a', 'visiShip', 1],
  ['pinecn', 'char_440_pinecn', 3, 'chess_char_3_10_a', 'swiftShip', 1],
  ['astesi', 'char_274_astesi', 3, null, 'arcaneShip', 1],
  ['plosis', 'char_128_plosis', 4, 'chess_char_4_21_a', 'skillfulShip', 1],
  ['f12yin', 'char_264_f12yin', 5, 'chess_char_5_17_a', 'investShip', 1],
  ['demkni', 'char_202_demkni', 5, 'chess_char_5_11_a', 'steadShip', 1],
  ['heyak', 'char_4027_heyak', 6, null, 'arcaneShip', 2],
  ['aphris', 'char_4229_aphris', 6, null, 'preciShip', 2],
]);
const RETIRED = [
  ['ctrail', 'char_4165_ctrail', 2, null, 'skillfulShip', 1],
  ['halo', 'char_135_halo', 3, null, 'arcaneShip', 1],
];
export const RETAINED_CHARACTERS = Object.freeze(['char_1040_blaze2', 'char_4114_harold']);
const descriptions = {
  bstalk: ['获得时，哥伦比亚+2层（无需激活）。', '获得时，哥伦比亚+4层（无需激活）。'],
  tinman: ['获得时，获得1个随身身份牌。', '获得时，获得2个随身身份牌。'],
  silent: ['进入休整期时，哥伦比亚与远见分别+2层（无需激活）。', '进入休整期时，哥伦比亚与远见分别+4层（无需激活）。'],
  ctrail: ['获得时，灵巧+2层（无需激活）。', '获得时，灵巧+4层（无需激活）。'],
  astesi: ['在场时，每买入1名干员，使已激活哥伦比亚+1层；每卖出1名干员，使已激活奥术+1层。', '在场时，每买入1名干员，使已激活哥伦比亚+2层；每卖出1名干员，使已激活奥术+2层。'],
  halo: ['进入休整期时，使已激活哥伦比亚与奥术分别+2层。', '进入休整期时，使已激活哥伦比亚与奥术分别+4层。'],
  heyak: ['哥伦比亚与奥术记录层数之和每满3层，自身造成伤害+1%。', '哥伦比亚与奥术记录层数之和每满3层，自身造成伤害+2%。'],
  aphris: ['进入休整期时，每持有2资金，使已激活的哥伦比亚与精准各+1层。', '进入休整期时，每持有1资金，使已激活的哥伦比亚与精准各+1层。'],
};
export function prepareColumbia({ act }) {
  for (const [code, charId, tier, existing, addon, skillIndex] of [...COLUMBIA_ROSTER, ...RETIRED]) {
    const base = existing ?? `chess_char_${tier}_columbia_${code}_a`, golden = base.replace(/_a$/, '_b');
    if (!existing) {
      const template = tier <= 3 ? 'chess_char_2_02_a' : 'chess_char_4_18_a';
      act.charShopChessDatas[base] = { ...structuredClone(act.charShopChessDatas[template]), chessId: base,
        goldenChessId: golden, charId, chessLevel: tier, shopLevelSortId: 100 + COLUMBIA_ROSTER.findIndex(r => r[0] === code),
        chessType: 'PRESET', backupCharId: charId, backupCharSkillIndex: skillIndex,
        backupCharUniEquipId: null, defaultUniEquipId: null, defaultSkillIndex: skillIndex, isHidden: false };
      for (const [suffix, id] of [['a', base], ['b', golden]]) {
        const rec = structuredClone(act.charChessDataDict[template.replace(/_a$/, `_${suffix}`)]);
        Object.assign(rec, { chessId: id, identifier: 2000 + Object.keys(act.charChessDataDict).length,
          upgradeChessId: suffix === 'a' ? golden : null });
        // [ASSUMED] Same first-playable training templates as Sarkaz; no default module (docs/design/columbia.md).
        rec.status.equipLevel = suffix === 'b' ? 3 : 0;
        act.charChessDataDict[id] = rec; act.chessNormalIdLookupDict[id] = base;
      }
    }
    Object.assign(act.charShopChessDatas[base], { chessLevel: tier, isHidden: false, defaultSkillIndex: skillIndex });
    for (const [suffix, id] of [['a', base], ['b', golden]]) {
      const rec = act.charChessDataDict[id]; rec.bondIds = ['columbiaShip', addon].filter(Boolean);
      if (descriptions[code]) {
        const gid = `garrison_columbia_${code}_${suffix}`, n = suffix === 'b' ? 2 : 1;
        rec.garrisonIds = [gid];
        act.garrisonDataDict[gid] = { garrisonDesc: descriptions[code][n - 1], description: descriptions[code][n - 1],
          eventType: ['bstalk', 'ctrail', 'tinman'].includes(code) ? 'SERVER_GAIN' : 'IN_BATTLE',
          eventTypeDesc: code === 'heyak' ? '作战能力' : '整备能力',
          eventTypeIcon: 'icon_gold', effectType: `COLUMBIA_${code.toUpperCase()}`, blackboard:
          ['halo', 'aphris'].includes(code) ? [
            { key: 'bond_add_count', value: code === 'halo' ? n : 2, valueStr: null },
            { key: 'bond_type', value: 0, valueStr: 'bond_by_id' },
            { key: 'bond_id', value: 0, valueStr: code === 'halo' ? 'columbiaShip,arcaneShip' : 'columbiaShip' },
          ] : [] };
        if (['silent', 'aphris'].includes(code)) act.garrisonDataDict[gid].eventType = 'SERVER_PREP_START';
        if (code === 'astesi') act.garrisonDataDict[gid].eventType = 'SERVER_TRANSACTION';
        if (['silent', 'aphris', 'astesi'].includes(code)) {
          act.garrisonDataDict[gid].blackboard = [
            { key: 'count', value: n, valueStr: null },
            { key: 'conditionkey', value: 0, valueStr: 'character_target_inboard' },
          ];
          if (code === 'aphris') act.garrisonDataDict[gid].blackboard.push({ key: 'funds_per_trigger', value: suffix === 'b' ? 1 : 2, valueStr: null });
        }
      }
      if (code === 'demkni' && suffix === 'b') {
        const gid = 'garrison_columbia_demkni_b';
        const g = structuredClone(act.garrisonDataDict.garrison_99_b);
        g.effectType = 'COLUMBIA_DEMKNI';
        g.garrisonDesc = '身前两格干员若为“休整期结束时”特质，分别复制两者的特质。';
        g.description = g.garrisonDesc; act.garrisonDataDict[gid] = g; rec.garrisonIds = [gid];
      }
      if (code === 'f12yin') {
        // Buy/sell observers require deployment and active bonds; Saria still copies prep-end traits only.
        const gid = `garrison_columbia_f12yin_${suffix}`;
        const g = structuredClone(act.garrisonDataDict[`garrison_34_${suffix}`]);
        const n = suffix === 'b' ? 2 : 1;
        g.effectType = 'COLUMBIA_F12YIN';
        g.eventType = 'SERVER_TRANSACTION';
        g.blackboard = [{ key: 'count', value: n, valueStr: null },
          { key: 'conditionkey', value: 0, valueStr: 'character_target_inboard' }];
        g.garrisonDesc = `在场时，每买入1名干员，使已激活哥伦比亚+${n}层；每卖出1名干员，使已激活投资人+${n}层。`;
        g.description = g.garrisonDesc; act.garrisonDataDict[gid] = g; rec.garrisonIds = [gid];
      }
      if (code === 'halo') {
        const g = act.garrisonDataDict[`garrison_columbia_halo_${suffix}`];
        g.eventType = 'SERVER_PREP_START'; g.eventTypeDesc = '整备能力'; g.effectType = 'SERVER_ADD_BOND';
        g.blackboard = [{ key: 'count', value: suffix === 'b' ? 4 : 2, valueStr: null },
          { key: 'bond', value: 0, valueStr: 'columbiaShip,arcaneShip' },
          { key: 'conditionkey', value: 0, valueStr: 'character_target_inboard' }];
      }
    }
  }
  for (const [code, , tier] of RETIRED) act.charShopChessDatas[`chess_char_${tier}_columbia_${code}_a`].isHidden = true;
  // Keep old ids and kits for saves/self-selection; remove only regular recruitment visibility.
  for (const [id, shop] of Object.entries(act.charShopChessDatas)) {
    const bonds = act.charChessDataDict[id]?.bondIds ?? [];
    if (!RETAINED_CHARACTERS.includes(shop.charId) && bonds.some(b => ['egirShip', 'victoriaShip'].includes(b))) shop.isHidden = true;
  }
  for (const suffix of ['a', 'b']) act.charChessDataDict[`chess_char_5_16_${suffix}`].bondIds = ['columbiaShip', 'skillfulShip'];
  // Ifrit remains Sarkaz/Farsight; she no longer counts toward Columbia.
  for (const [id, bond] of Object.entries(act.bondInfoDict)) {
    bond.chessIdList = Object.values(act.charChessDataDict).filter(c => c.bondIds.includes(id)).map(c => c.chessId);
  }
}
export function finishColumbia(files) {
  for (const [code, tier, name, template] of [
    ['chip', 3, '哥伦比亚芯片', 'chess_item_3_03_e'],
    ['field', 6, '力场发生器', 'chess_item_6_03_e'],
  ]) for (const suffix of ['a', 'b']) {
    const gold = suffix === 'b', key = `chess_item_${tier}_columbia_${code}_e`;
    const id = `${key}_${suffix}`, effectId = `eff_columbia_${code}_${suffix}`;
    const params = code === 'chip' ? { atk: gold ? .3 : .2, attack_speed: gold ? 30 : 20 }
      : { shield: gold ? 1000 : 500, damage_scale: gold ? 1.5 : 1.3, reduction: gold ? .5 : .3, hp: gold ? 1 : .5 };
    const desc = code === 'chip' ? `攻击力+${params.atk * 100}%，技能期间攻击速度+${params.attack_speed}。`
      : `技能持续期间每秒获得${params.shield}点屏障，屏障总量上限为生命上限的100%（萨卡兹六人效果仍限制为50%）。拥有屏障时造成伤害提升至${params.damage_scale * 100}%。同时装备哥伦比亚芯片时，受到伤害减少${params.reduction * 100}%，生命上限+${params.hp * 100}%。`;
    const rec = structuredClone(files.items[`${template}_${suffix}`]);
    Object.assign(rec, { id, baseId: `${key}_a`, goldenId: `${key}_b`, isGolden: gold,
      identifier: 3000 + tier * 10 + (gold ? 1 : 0), name, effectId, effectName: name, desc, descRaw: desc,
      shopSortId: 90, hideInShop: gold, shopExcluded: false, shopExcludedBy: null,
      mergeable: !gold, upgradeNum: gold ? 0 : 2, upgradeChessId: gold ? null : `${key}_b`,
      giveBondId: 'columbiaShip', requiresBondId: null, canGiveBond: false,
      buffs: [], params, category: 'STAT', kind: 'passive', family: null,
      implFormula: desc, note: 'User-approved 2026-10-10 design; icon reused from native equipment.', flavor: name });
    files.items[id] = rec;
    files.effects[effectId] = { ...structuredClone(files.effects[files.items[`${template}_${suffix}`].effectId]),
      effectId, name, desc, descRaw: desc, buffs: [], params };
  }
  const desc = '累计每新增25层，获得1个随身身份牌。\n<在场3名不同【哥伦比亚】干员>【哥伦比亚】攻击力+20%，每层再+0.7%。\n<在场6名不同【哥伦比亚】干员>任一成员攻击敌人时，在主目标位置引发半径2.5格的圆形法术轰击，伤害为在场哥伦比亚干员当前总攻击力的200%。被轰击的敌人每秒受到总攻击力×层数×0.5%的法术持续伤害，持续5秒；再次轰击刷新持续时间与快照，不叠加。范围同维什戴尔三技能。每名玩家的哥伦比亚全队共享10秒冷却，每满100层减少1秒，最低1秒；治疗、召唤物、持续伤害及独立追伤不触发。';
  files.effects.bondeffect_columbia = { ...structuredClone(files.effects.bondeffect_yan), effectId: 'bondeffect_columbia',
    name: '拓界共振', desc, descRaw: desc, buffs: [], params: {} };
  const members = Object.values(files.chess).filter(c => !c.isGolden && c.bonds.includes('columbiaShip'));
  files.bonds.columbiaShip = { ...structuredClone(files.bonds.sarkazShip), bondId: 'columbiaShip', name: '哥伦比亚',
    identifier: 25, iconId: 'icon_columbiaShip', desc, descRaw: desc, effectId: 'bondeffect_columbia', effectName: '拓界共振',
    effectDesc: desc, effectDescRaw: desc, bb: { base_atk: .20, atk_per_stack: .007, power_bond_char_cnt: 6 },
    members: members.map(c => c.chessId), visibleMembers: members.filter(c => c.visible).map(c => c.chessId),
    spec: { origin: 'User-approved Columbia fan expansion; docs/design/columbia.md' } };
}
