// User-approved expansion and temporary recruitment pool reduction.
export const COLUMBIA_ROSTER = Object.freeze([
  ['bstalk', 'char_452_bstalk', 1, null, 'deputShip', 1],
  ['ctrail', 'char_4165_ctrail', 2, null, 'skillfulShip', 1],
  ['astesi', 'char_274_astesi', 3, null, 'arcaneShip', 1],
  ['halo', 'char_135_halo', 3, null, 'arcaneShip', 1],
  ['plosis', 'char_128_plosis', 4, 'chess_char_4_21_a', 'skillfulShip', 1],
  ['f12yin', 'char_264_f12yin', 5, 'chess_char_5_17_a', 'investShip', 1],
  ['demkni', 'char_202_demkni', 5, 'chess_char_5_11_a', 'steadShip', 1],
  ['heyak', 'char_4027_heyak', 6, null, 'preciShip', 2],
  ['aphris', 'char_4229_aphris', 6, null, 'miraShip', 2],
]);
export const RETAINED_CHARACTERS = Object.freeze(['char_1040_blaze2', 'char_4114_harold']);
const descriptions = {
  bstalk: ['本局首次获得本体时，哥伦比亚+2层（无需激活）；每次晋级精锐再+4层。', '晋级精锐时，哥伦比亚+4层（无需激活）。'],
  ctrail: ['获得时，灵巧+2层（无需激活）。', '获得时，灵巧+4层（无需激活）。'],
  astesi: ['对自身当前阻挡的敌人造成伤害提升至125%。', '对自身当前阻挡的敌人造成伤害提升至140%。'],
  halo: ['进入休整期时，使已激活哥伦比亚与奥术分别+2层。', '进入休整期时，使已激活哥伦比亚与奥术分别+4层。'],
  heyak: ['每层已激活哥伦比亚使自身造成伤害+1%。', '每层已激活哥伦比亚使自身造成伤害+2%。'],
  aphris: ['自身击杀敌人，使已激活哥伦比亚+2层。', '开战时授予己方全队干员：击杀敌人使已激活哥伦比亚+2层；同名授予不叠加。'],
};
export function prepareColumbia({ act }) {
  for (const [code, charId, tier, existing, addon, skillIndex] of COLUMBIA_ROSTER) {
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
      const rec = act.charChessDataDict[id]; rec.bondIds = ['columbiaShip', addon];
      if (descriptions[code]) {
        const gid = `garrison_columbia_${code}_${suffix}`, n = suffix === 'b' ? 2 : 1;
        rec.garrisonIds = [gid];
        act.garrisonDataDict[gid] = { garrisonDesc: descriptions[code][n - 1], description: descriptions[code][n - 1],
          eventType: ['bstalk', 'ctrail'].includes(code) ? 'SERVER_GAIN' : 'IN_BATTLE',
          eventTypeDesc: ['bstalk', 'ctrail'].includes(code) ? '整备能力' : '作战能力',
          eventTypeIcon: 'icon_gold', effectType: `COLUMBIA_${code.toUpperCase()}`, blackboard:
          ['halo', 'aphris'].includes(code) ? [
            { key: 'bond_add_count', value: code === 'halo' ? n : 2, valueStr: null },
            { key: 'bond_type', value: 0, valueStr: 'bond_by_id' },
            { key: 'bond_id', value: 0, valueStr: code === 'halo' ? 'columbiaShip,arcaneShip' : 'columbiaShip' },
          ] : [] };
      }
      if (code === 'f12yin') {
        // Preserve the native Investor event/condition and copyability by Saria.
        const gid = `garrison_columbia_f12yin_${suffix}`;
        const g = structuredClone(act.garrisonDataDict[`garrison_34_${suffix}`]);
        const n = suffix === 'b' ? 2 : 1;
        g.effectType = 'COLUMBIA_F12YIN';
        g.blackboard.push({ key: 'columbia_multi', value: n * 2, valueStr: null });
        g.garrisonDesc = `休整期结束时，本回合每获得1名干员，使已激活投资人+${n}层、哥伦比亚+${n * 2}层。`;
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
  // Keep old ids and kits for saves/self-selection; remove only regular recruitment visibility.
  for (const [id, shop] of Object.entries(act.charShopChessDatas)) {
    const bonds = act.charChessDataDict[id]?.bondIds ?? [];
    if (!RETAINED_CHARACTERS.includes(shop.charId) && bonds.some(b => ['egirShip', 'victoriaShip'].includes(b))) shop.isHidden = true;
  }
  for (const suffix of ['a', 'b']) act.charChessDataDict[`chess_char_5_16_${suffix}`].bondIds = ['columbiaShip', 'skillfulShip'];
  // Ifrit is one shared identity; keep her Sarkaz trait, Farsight tag, tier and skills intact.
  for (const suffix of ['a', 'b']) act.charChessDataDict[`chess_char_4_sarkaz_ifrit_${suffix}`].bondIds = ['sarkazShip', 'columbiaShip', 'visiShip'];
  for (const [id, bond] of Object.entries(act.bondInfoDict)) {
    bond.chessIdList = Object.values(act.charChessDataDict).filter(c => c.bondIds.includes(id)).map(c => c.chessId);
  }
}
export function finishColumbia(files) {
  const desc = '【哥伦比亚】攻击力+15%，每层再+0.5%。\n<在场6名不同【哥伦比亚】干员>有效主攻击附加当前攻击力20%的凋亡损伤；命中前目标已处于凋亡损伤爆发时，另造成当前攻击力（110%+每层0.3%）的元素伤害。多段逐段、群攻逐目标，独立追伤不再次触发。';
  files.effects.bondeffect_columbia = { ...structuredClone(files.effects.bondeffect_yan), effectId: 'bondeffect_columbia',
    name: '拓界共振', desc, descRaw: desc, buffs: [], params: {} };
  const members = Object.values(files.chess).filter(c => !c.isGolden && c.bonds.includes('columbiaShip'));
  files.bonds.columbiaShip = { ...structuredClone(files.bonds.sarkazShip), bondId: 'columbiaShip', name: '哥伦比亚',
    identifier: 25, iconId: 'icon_columbiaShip', desc, descRaw: desc, effectId: 'bondeffect_columbia', effectName: '拓界共振',
    effectDesc: desc, effectDescRaw: desc, bb: { base_atk: .15, atk_per_stack: .005, power_bond_char_cnt: 6 },
    members: members.map(c => c.chessId), visibleMembers: members.filter(c => c.visible).map(c => c.chessId),
    spec: { origin: 'User-approved Columbia fan expansion; docs/design/columbia.md' } };
}
