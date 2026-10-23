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
  tinman: ['攻击力与生命值+20%；哥伦比亚记录层数每满10层，自然技力回复+0.05/秒。', '攻击力与生命值+40%；哥伦比亚记录层数每满10层，自然技力回复+0.1/秒。'],
  silent: ['进入休整期时，使已激活远见与哥伦比亚各+2层；若资金大于10，消耗1资金使本次层数翻倍。', '进入休整期时，使已激活远见与哥伦比亚各+4层；若资金大于10，消耗1资金使本次层数翻倍。'],
  ctrail: ['获得时，灵巧+2层（无需激活）。', '获得时，灵巧+4层（无需激活）。'],
  astesi: ['休整期结束时，消耗剩余资金（至多5资金），每消耗1使已激活哥伦比亚与奥术各+1层；下个休整期开始返还实际消耗的资金。', '休整期结束时，消耗剩余资金（至多5资金），每消耗1使已激活哥伦比亚与奥术各+2层；下个休整期开始返还实际消耗的资金。'],
  halo: ['进入休整期时，使已激活哥伦比亚与奥术分别+2层。', '进入休整期时，使已激活哥伦比亚与奥术分别+4层。'],
  heyak: ['哥伦比亚与奥术记录层数之和每满3层，自身造成伤害+1%。', '哥伦比亚与奥术记录层数之和每满3层，自身造成伤害+2%。'],
  aphris: ['进入休整期时，若哥伦比亚与精准同时激活，每持有4资金消耗1资金，使两盟约各+4层，至多触发6次；未同时激活不消耗。', '进入休整期时，若哥伦比亚与精准同时激活，每持有4资金消耗1资金，使两盟约各+8层，至多触发6次；未同时激活不消耗。'],
};
export function prepareColumbia({ act }) {
  for (const [code, charId, tier, existing, addon, skillIndex] of [...COLUMBIA_ROSTER, ...RETIRED]) {
    // Keep Astesia's existing ids and training when changing shop tier (saved loadouts and assets refer to them).
    const base = code === 'astesi' ? 'chess_char_3_columbia_astesi_a' : existing ?? `chess_char_${tier}_columbia_${code}_a`;
    const golden = base.replace(/_a$/, '_b');
    if (!existing) {
      const template = tier <= 3 || code === 'astesi' ? 'chess_char_2_02_a' : 'chess_char_4_18_a';
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
          eventType: ['bstalk', 'ctrail'].includes(code) ? 'SERVER_GAIN' : 'IN_BATTLE',
          eventTypeDesc: ['heyak', 'tinman'].includes(code) ? '作战能力' : '整备能力',
          eventTypeIcon: 'icon_gold', effectType: `COLUMBIA_${code.toUpperCase()}`, blackboard:
          ['halo', 'aphris'].includes(code) ? [
            { key: 'bond_add_count', value: code === 'halo' ? n : 2, valueStr: null },
            { key: 'bond_type', value: 0, valueStr: 'bond_by_id' },
            { key: 'bond_id', value: 0, valueStr: code === 'halo' ? 'columbiaShip,arcaneShip' : 'columbiaShip' },
          ] : [] };
        if (['silent', 'aphris'].includes(code)) act.garrisonDataDict[gid].eventType = 'SERVER_PREP_START';
        if (code === 'astesi') act.garrisonDataDict[gid].eventType = 'SERVER_PREP_FIN';
        if (['silent', 'aphris', 'astesi'].includes(code)) {
          act.garrisonDataDict[gid].blackboard = [
            { key: 'count', value: (code === 'aphris' ? 4 : code === 'silent' ? 2 : 1) * n, valueStr: null },
            { key: 'conditionkey', value: 0, valueStr: 'character_target_inboard' },
          ];
          if (code === 'aphris') {
            act.garrisonDataDict[gid].blackboard.push({ key: 'funds_per_trigger', value: 4, valueStr: null });
            act.garrisonDataDict[gid].blackboard.push({ key: 'max_triggers', value: 6, valueStr: null });
          }
          if (code === 'silent') {
            act.garrisonDataDict[gid].blackboard.push({ key: 'double_above_funds', value: 10, valueStr: null });
          }
          if (code === 'astesi') {
            act.garrisonDataDict[gid].blackboard.push({ key: 'max_cost', value: 5, valueStr: null });
          }
        }
      }
      if (code === 'demkni' && suffix === 'b') {
        const gid = 'garrison_columbia_demkni_b';
        const g = structuredClone(act.garrisonDataDict.garrison_99_b);
        g.effectType = 'SERVER_FRONT_SAME_EFFECT_PREP_FIN';
        g.garrisonDesc = '身前一格干员若为“休整期结束时”特质，本干员的特质与其相同。';
        g.description = g.garrisonDesc; act.garrisonDataDict[gid] = g; rec.garrisonIds = [gid];
      }
      if (code === 'f12yin') {
        // Round spending is counted by the economy; Saria can copy this prep-end trait again.
        const gid = `garrison_columbia_f12yin_${suffix}`;
        const g = structuredClone(act.garrisonDataDict[`garrison_34_${suffix}`]);
        const n = suffix === 'b' ? 2 : 1;
        g.effectType = 'COLUMBIA_F12YIN';
        g.eventType = 'SERVER_PREP_FIN';
        g.blackboard = [{ key: 'count', value: n, valueStr: null },
          { key: 'funds_per_trigger', value: 3, valueStr: null },
          { key: 'conditionkey', value: 0, valueStr: 'character_target_inboard' }];
        g.garrisonDesc = `休整期结束时，本回合每消耗3资金，使已激活投资人+${n}层。`;
        g.description = g.garrisonDesc; act.garrisonDataDict[gid] = g; rec.garrisonIds = [gid];
        const startId = `garrison_columbia_f12yin_start_${suffix}`;
        act.garrisonDataDict[startId] = { ...structuredClone(g), effectType: 'COLUMBIA_F12YIN_START',
          eventType: 'SERVER_PREP_START', garrisonDesc: `进入休整期时，每持有2资金使已激活哥伦比亚+${n}层，不消耗资金。`,
          description: `进入休整期时，每持有2资金使已激活哥伦比亚+${n}层，不消耗资金。`,
          blackboard: [{ key: 'count', value: n, valueStr: null }, { key: 'funds_per_trigger', value: 2, valueStr: null },
            { key: 'conditionkey', value: 0, valueStr: 'character_target_inboard' }] };
        rec.garrisonIds.push(startId);
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
  // Aegir regular operators are restored by the maintainer's 2026-10-22 revision.
  for (const suffix of ['a', 'b']) act.charChessDataDict[`chess_char_5_16_${suffix}`].bondIds = ['columbiaShip', 'skillfulShip'];
  // Ifrit remains Sarkaz/Farsight; she no longer counts toward Columbia.
  for (const [id, bond] of Object.entries(act.bondInfoDict)) {
    bond.chessIdList = Object.values(act.charChessDataDict).filter(c => c.bondIds.includes(id)).map(c => c.chessId);
  }
}
export function finishColumbia(files) {
  for (const [code, tier, name, template] of [
    ['chip', 4, '哥伦比亚动力甲', 'chess_item_3_03_e'],
    ['field', 6, '力场防护装置', 'chess_item_6_03_e'],
    ['doll', 4, '大总统玩偶', 'chess_item_2_07_e'],
  ]) for (const suffix of ['a', 'b']) {
    const gold = suffix === 'b', key = `chess_item_${code === 'chip' ? 3 : tier}_columbia_${code}_e`;
    const id = `${key}_${suffix}`, effectId = `eff_columbia_${code}_${suffix}`;
    const params = code === 'chip' ? { hp: gold ? .3 : .2, reduction: gold ? .25 : .15 }
      : code === 'field' ? { shield: gold ? 600 : 300, cap: 3000, combo_cap: 6000, atk: 50, aspd: 50 }
      : { count: gold ? 2 : 1 };
    const desc = code === 'chip' ? `生命值+${params.hp * 100}%，受到的物理与法术伤害-${params.reduction * 100}%。`
      : code === 'field' ? `技能持续期间每秒获得${params.shield}屏障，上限3000，技能结束保留；哥伦比亚携带者攻击力+50、攻速+50。同时装备哥伦比亚动力甲时获得抵抗，装置屏障上限6000（仍受盟约通用屏障限制）。`
      : `使用时销毁，下个休整期开始额外获得${params.count}资金；两个普通件可合成精锐。`;
    const rec = structuredClone(files.items[`${template}_${suffix}`]);
    Object.assign(rec, { id, baseId: `${key}_a`, goldenId: `${key}_b`, isGolden: gold,
      identifier: 3000 + tier * 10 + (code === 'doll' ? 4 : 0) + (gold ? 1 : 0), name, effectId, effectName: name, desc, descRaw: desc,
      tier, price: code === 'doll' ? 0 : code === 'chip' ? 3 : 4,
      // [ASSUMED] Zero-price president dolls are rewards, excluded from repeatable free shop purchases.
      shopSortId: 90, hideInShop: gold || code === 'doll', shopExcluded: code === 'doll', shopExcludedBy: code === 'doll' ? 'rewardOnly' : null,
      mergeable: !gold, upgradeNum: gold ? 0 : 2, upgradeChessId: gold ? null : `${key}_b`,
      giveBondId: code === 'doll' ? null : 'columbiaShip', requiresBondId: null, canGiveBond: false,
      buffs: code === 'doll' ? [{ key: 'use_equip_gain_coin_when_next_round_start', countType: 'NONE', bb: params, bbStr: {} }] : [],
      params, category: code === 'doll' ? 'ECONOMY' : 'STAT', kind: code === 'doll' ? 'consume_on_equip' : 'passive', family: null,
      implFormula: desc, note: 'User-approved 2026-10-13 DOCX revision; custom equipment icons supplied by the user.', flavor: name });
    if (code !== 'doll') rec.iconId = rec.trapId = `columbia-${code === 'chip' ? 'power-armor' : 'force-field'}`;
    files.items[id] = rec;
    files.effects[effectId] = { ...structuredClone(files.effects[files.items[`${template}_${suffix}`].effectId]),
      effectId, name, desc, descRaw: desc, buffs: [], params };
  }
  const desc = '累计每新增10层，获得1个大总统玩偶。\n<在场3名不同【哥伦比亚】干员>【哥伦比亚】攻击力+20%，每层再+0.7%。\n<在场6名不同【哥伦比亚】干员>任一在场本体对敌造成伤害时，在目标位置引发半径2.5格轨道轰炸，造成在场存活哥伦比亚本体总攻击力150%的法术伤害，并留下5秒燃烧区，每秒对区内敌人造成快照总攻击力30%的法术伤害。相同区域刷新，同一玩家的燃烧不叠加；不递归触发自身轰炸/燃烧，召唤物不触发。全队共享冷却10秒，每满10层减0.1秒，最低1秒。';
  files.effects.bondeffect_columbia = { ...structuredClone(files.effects.bondeffect_yan), effectId: 'bondeffect_columbia',
    name: '拓界共振', desc, descRaw: desc, buffs: [], params: {} };
  const members = Object.values(files.chess).filter(c => !c.isGolden && c.bonds.includes('columbiaShip'));
  files.bonds.columbiaShip = { ...structuredClone(files.bonds.sarkazShip), bondId: 'columbiaShip', name: '哥伦比亚',
    identifier: 25, iconId: 'icon_columbiaShip', desc, descRaw: desc, effectId: 'bondeffect_columbia', effectName: '拓界共振',
    effectDesc: desc, effectDescRaw: desc, bb: { base_atk: .20, atk_per_stack: .007, power_bond_char_cnt: 6 },
    members: members.map(c => c.chessId), visibleMembers: members.filter(c => c.visible).map(c => c.chessId),
    spec: { origin: 'User-approved Columbia fan expansion; docs/design/columbia.md' } };
  const bandId = 'band_ferdinand', effectId = 'effect_band_ferdinand';
  const bandDesc = '第1回合开始获得1件进阶哥伦比亚动力甲；第2回合起，每回合开始获得1件普通哥伦比亚动力甲。普通装备可按现有规则合成，满手时进入临时存放区。';
  const params = { firstItem: 'chess_item_3_columbia_chip_e_b', nextItem: 'chess_item_3_columbia_chip_e_a' };
  files.effects[effectId] = { effectId, name: '斐尔迪南分队', desc: bandDesc, descRaw: bandDesc, buffs: [], params };
  files.bands[bandId] = { bandId, sortId: 102, name: '斐尔迪南分队', iconId: 'columbia',
    modeTypeList: ['SINGLE', 'MULTI'], totalHp: 26, effectId, effectName: '动力甲供应', desc: bandDesc, descRaw: bandDesc,
    buffs: [], params, victorCount: 0, rewardModulus: 1, unlockDesc: null, bondIds: ['columbiaShip'] };
}
