// User-approved fan expansion. Mutate build inputs, never generated JSON by hand.
export const SARKAZ_ROSTER = Object.freeze([
  ['vigna', 'char_290_vigna', 1, 'chess_char_1_05_a', 'indomShip', 1],
  ['hbisc2', 'char_1024_hbisc2', 2, null, 'arcaneShip', 1],
  ['meteo', 'char_219_meteo', 2, null, 'swiftShip', 1],
  ['mudrok', 'char_311_mudrok', 3, 'chess_char_4_18_a', 'soloShip', 1],
  ['ifrit', 'char_134_ifrit', 4, null, 'visiShip', 1],
  ['shining', 'char_147_shining', 4, null, null, 2],
  ['typhon', 'char_2012_typhon', 5, null, 'preciShip', 1],
  ['nymph', 'char_4146_nymph', 5, 'chess_char_5_22_a', 'swiftShip', 1],
  ['wisdel', 'char_1035_wisdel', 6, null, 'preciShip', 1],
]);

const descriptions = {
  vigna: ['商店购买价格为1资金。', '商店购买价格为1资金。'],
  mudrok: ['获得时，获得1资金。', '获得时，获得2资金。'],
  meteo: ['获得时，自身所属盟约各+2层（无需激活）。', '获得时，自身所属盟约各+4层（无需激活）。'],
  hbisc2: ['休整期结束时，自身所属盟约各+2层（无需激活）。', '休整期结束时，自身所属盟约各+4层（无需激活）。'],
  ifrit: ['自身攻击力与生命上限各+30%。', '自身攻击力与生命上限各+60%。'],
  shining: ['开启技能，使层数最多的已激活盟约+6层；每轮最多一次。', '开启技能，使层数最多的已激活盟约+12层；每轮最多一次。'],
  typhon: ['在场时，任一己方萨卡兹真实开技使已激活萨卡兹+2层；每正式回合共享上限28。', '在场时，任一己方萨卡兹真实开技使已激活萨卡兹+2层；每正式回合共享上限56。'],
  wisdel: ['每层已激活的萨卡兹使自身造成伤害+1%。', '每层已激活的萨卡兹使自身造成伤害+2%。'],
};

export function prepareSarkaz(ctx) {
  const { act } = ctx;
  // Keep the 0.2.2 baseline's unrelated loadouts stable when rebuilding from a newer upstream cache.
  // Shu's newly published second module needs a separate kit/fidelity review.
  if (ctx.uniequip.charEquip?.char_2025_shu) {
    ctx.uniequip.charEquip.char_2025_shu = ctx.uniequip.charEquip.char_2025_shu.filter((id) => id !== 'uniequip_003_shu');
  }
  for (const [code, charId, tier, existing, addon, skillIndex] of SARKAZ_ROSTER) {
    const base = existing ?? `chess_char_${tier}_sarkaz_${code}_a`;
    const golden = base.replace(/_a$/, '_b');
    if (!existing) {
      const template = tier === 2 ? 'chess_char_2_02_a' : 'chess_char_4_18_a';
      const shop = structuredClone(act.charShopChessDatas[template]);
      Object.assign(shop, { chessId: base, goldenChessId: golden, charId, chessLevel: tier,
        shopLevelSortId: 80 + SARKAZ_ROSTER.findIndex((x) => x[0] === code), chessType: 'PRESET',
        backupCharId: charId, backupCharSkillIndex: skillIndex, backupCharUniEquipId: null,
        defaultUniEquipId: null, defaultSkillIndex: skillIndex, isHidden: false });
      act.charShopChessDatas[base] = shop;
      for (const [suffix, id] of [['a', base], ['b', golden]]) {
        const rec = structuredClone(act.charChessDataDict[template.replace(/_a$/, `_${suffix}`)]);
        Object.assign(rec, { chessId: id, identifier: 1000 + Object.keys(act.charChessDataDict).length,
          upgradeChessId: suffix === 'a' ? golden : null });
        // [ASSUMED] First playable uses the tier-2 / tier-4 template training, no default module on new entries.
        rec.status.equipLevel = suffix === 'b' ? 3 : 0;
        act.charChessDataDict[id] = rec;
        act.chessNormalIdLookupDict[id] = base;
      }
    }
    Object.assign(act.charShopChessDatas[base], { chessLevel: tier, isHidden: false, defaultSkillIndex: skillIndex });
    for (const [suffix, id] of [['a', base], ['b', golden]]) {
      const rec = act.charChessDataDict[id];
      rec.bondIds = ['sarkazShip', ...(addon ? [addon] : [])];
      if (descriptions[code]) {
        const gid = `garrison_sarkaz_${code}_${suffix}`;
        rec.garrisonIds = [gid];
        act.garrisonDataDict[gid] = {
          garrisonDesc: descriptions[code][suffix === 'a' ? 0 : 1],
          description: descriptions[code][suffix === 'a' ? 0 : 1],
          eventType: ['vigna', 'mudrok', 'meteo'].includes(code) ? 'SERVER_GAIN' : 'IN_BATTLE',
          eventTypeDesc: ['vigna', 'mudrok', 'meteo'].includes(code) ? '整备能力' : '作战能力',
          eventTypeIcon: 'icon_gold', effectType: `SARKAZ_${code.toUpperCase()}`, blackboard: [],
        };
        // Reuse the server's declared-gain allowance validator for these custom handlers.
        if (['typhon', 'shining'].includes(code)) {
          const amount = code === 'typhon' ? 2 : code === 'shining' ? (suffix === 'b' ? 12 : 6) : (suffix === 'b' ? 2 : 1);
          act.garrisonDataDict[gid].blackboard = [
            { key: 'bond_add_count', value: amount, valueStr: null },
            { key: 'bond_type', value: 0, valueStr: code === 'shining' ? 'bond_actived_maxstack' : 'bond_by_id' },
            { key: 'bond_id', value: 0, valueStr: code === 'hbisc2' ? 'sarkazShip,arcaneShip' : 'sarkazShip' },
            ...(code === 'shining' ? [{ key: 'max_add_count_per_battle', value: amount, valueStr: null }] : []),
          ];
        }
        if (code === 'hbisc2') Object.assign(act.garrisonDataDict[gid], {
          eventType: 'SERVER_PREP_FIN', eventTypeDesc: '整备能力',
          blackboard: [{ key: 'count', value: suffix === 'b' ? 4 : 2, valueStr: null },
            { key: 'conditionkey', value: 0, valueStr: 'character_target_inboard' }],
        });
      }
    }
  }
  // Keep the legacy hidden Nymph id for saved loadouts, but one character identity in bond counting.
  for (const suffix of ['a', 'b']) act.charChessDataDict[`chess_char_6_10_${suffix}`].bondIds = ['sarkazShip', 'swiftShip'];
  // Existing add-on member popups are generated from these lists.
  for (const [id, bond] of Object.entries(act.bondInfoDict)) {
    bond.chessIdList = Object.values(act.charChessDataDict).filter((c) => c.bondIds.includes(id)).map((c) => c.chessId);
  }
}

export function finishSarkaz(files) {
  for (const [code, tier, name, template, icon] of [
    ['bone', 2, '束灵骨', 'chess_item_2_01_e', 'binding-bone'],
    ['remains', 6, '死魂灵残躯', 'chess_item_6_03_e', 'revenant-remains'],
  ]) for (const suffix of ['a', 'b']) {
    const gold = suffix === 'b', key = `chess_item_${tier}_sarkaz_${code}_e`;
    const id = `${key}_${suffix}`, effectId = `eff_sarkaz_${code}_${suffix}`;
    const params = code === 'bone' ? { shield_ratio: gold ? .30 : .15 }
      : { hp: .50, attack_speed: gold ? 45 : 25 };
    const desc = code === 'bone'
      ? `部署时，自身及身前一格的己方干员各获得其生命上限${gold ? 30 : 15}%的屏障。各来源数值屏障合计不超过受益者生命上限50%；同一来源重新部署替换旧盾，不累积。`
      : `生命上限+50%。同时装备任意品质束灵骨时，攻击速度+${params.attack_speed}；同名装备只取最高品质效果。`;
    const rec = structuredClone(files.items[`${template}_${suffix}`]);
    Object.assign(rec, { id, baseId: `${key}_a`, goldenId: `${key}_b`, isGolden: gold, tier,
      identifier: 4000 + tier * 10 + (gold ? 1 : 0), name, effectId, effectName: name, desc, descRaw: desc,
      iconId: `sarkaz_${icon}`, trapId: `sarkaz_${icon}`, shopSortId: 91, hideInShop: gold,
      shopExcluded: false, shopExcludedBy: null, mergeable: !gold, upgradeNum: gold ? 0 : 2,
      upgradeChessId: gold ? null : `${key}_b`, giveBondId: 'sarkazShip', requiresBondId: null, canGiveBond: false,
      buffs: [], params, category: 'STAT', kind: 'passive', family: null, implFormula: desc,
      note: 'User-approved fan equipment; collectible icon credit: PRTS.', flavor: name });
    files.items[id] = rec;
    files.effects[effectId] = { ...structuredClone(files.effects[files.items[`${template}_${suffix}`].effectId]),
      effectId, name, desc, descRaw: desc, buffs: [], params };
  }
  for (const c of Object.values(files.chess)) if (c.charId === 'char_290_vigna') c.price = 1;
  const desc = '【萨卡兹】攻击力+20%，每层再+0.7%。\n<在场6名不同【萨卡兹】干员>任一成员开技时，全体成员获得在场存活萨卡兹本体总攻击力3%的屏障；各来源数值屏障合计上限为自身最大生命50%。有效主攻击追加自身剩余数值屏障30%的真实伤害，不消耗盾，不吃来源增伤，可吃目标易伤。多段逐段、群攻逐目标；余震与独立追伤不再触发，次数盾不计。';
  const members = Object.values(files.chess).filter((c) => !c.isGolden && c.bonds.includes('sarkazShip'));
  files.effects.bondeffect_sarkaz = { ...structuredClone(files.effects.bondeffect_yan),
    effectId: 'bondeffect_sarkaz', name: '众魂回响', desc, descRaw: desc, buffs: [], params: {} };
  files.bonds.sarkazShip = { ...structuredClone(files.bonds.yanShip), bondId: 'sarkazShip', name: '萨卡兹',
    identifier: 24, powerIdList: [], iconId: 'icon_sarkazShip', thresholds: [3, 6],
    desc, descRaw: desc, effectId: 'bondeffect_sarkaz', effectName: '众魂回响', effectDesc: desc, effectDescRaw: desc,
    effectDescParams: [], bb: { base_atk: 0.20, atk_per_stack: 0.007, power_bond_char_cnt: 6 }, bbStr: {}, buffs: [],
    baseParams: [], perStackParams: [], members: members.map((c) => c.chessId),
    visibleMembers: members.filter((c) => c.visible).map((c) => c.chessId),
    spec: { origin: 'User-approved Sarkaz fan expansion; docs/design/sarkaz.md' } };
}
