// Confirmed complete specification: docs/specs/tri-alliance-20261025.md.
const bb = values => Object.entries(values).map(([key, v]) => ({ key, value: typeof v === 'number' ? v : 0, valueStr: typeof v === 'string' ? v : null }));
export const CLEMNT = 'chess_char_5_aegir_clemnt_a';

export function prepareTriAlliance({ act, uniequip }) {
  const shops = act.charShopChessDatas, chs = act.charChessDataDict, gs = act.garrisonDataDict;
  const ulpia = shops.chess_char_5_05_a;
  ulpia.chessLevel = 4;
  for (const form of ['a', 'b']) {
    const c = chs[`chess_char_5_05_${form}`];
    c.status = structuredClone(chs[`chess_char_4_09_${form}`].status);
    chs[`chess_char_3_05_${form}`].bondIds = ['egirShip', 'raidShip'];
  }
  const golden = CLEMNT.replace(/_a$/, '_b');
  const template = shops.chess_char_5_04_a;
  // The existing prototype and charId kit are reused; only one regular inventory identity is introduced.
  const available = Object.keys(uniequip?.equipDict ?? {}).filter(id => uniequip.equipDict[id]?.charId === 'char_4231_clemnt' && uniequip.equipDict[id]?.typeIcon !== 'original');
  const moduleId = available.sort()[0] ?? null;
  shops[CLEMNT] = { ...structuredClone(template), chessId: CLEMNT, goldenChessId: golden, charId: 'char_4231_clemnt',
    chessLevel: 5, shopLevelSortId: 120, chessType: 'PRESET', backupCharId: 'char_4231_clemnt', backupCharSkillIndex: 1,
    backupCharUniEquipId: moduleId, defaultUniEquipId: moduleId, defaultSkillIndex: 1, isHidden: false };
  for (const form of ['a', 'b']) {
    const id = CLEMNT.replace(/_a$/, `_${form}`);
    chs[id] = { ...structuredClone(chs[`chess_char_5_04_${form}`]), chessId: id, identifier: 2900 + (form === 'b' ? 1 : 0),
      upgradeChessId: form === 'a' ? golden : null, bondIds: ['egirShip'], garrisonIds: [] };
    act.chessNormalIdLookupDict[id] = CLEMNT;
  }
  const baseByCode = { udflow: 'chess_char_1_04', ulpia: 'chess_char_5_05', skadi2: 'chess_char_6_04', clemnt: CLEMNT.replace(/_a$/, '') };
  for (const form of ['a', 'b']) {
    const elite = form === 'b', n = elite ? 2 : 1;
    const descriptions = {
      udflow: elite ? '本玩家所有阿戈尔干员攻击生命比例严格低于50%的敌人时，攻击力提升至150%。本场合法部署后，被击倒仍保留共享，非击倒离场清除。同名不叠加。'
        : '攻击生命比例严格低于50%的敌人时，该次攻击的攻击力提升至150%。',
      ulpia: `已激活阿戈尔每满10层，${elite ? '本玩家所有阿戈尔干员' : '自身'}受到的合法治疗与生命恢复量+10%。${elite ? '本场部署后击倒保留共享，非击倒离场清除；同名不叠加。' : ''}`,
      skadi2: `已激活阿戈尔每满10层，${elite ? '本玩家所有阿戈尔干员' : '自身'}每秒恢复50生命、自然技力回复+0.1/秒。${elite ? '本场部署后击倒保留共享，非击倒离场清除；同名不叠加。' : ''}`,
      clemnt: `已激活阿戈尔每满2层，${elite ? '本玩家所有阿戈尔干员' : '自身'}攻击力+1%。${elite ? '本场部署后击倒保留共享，非击倒离场清除；同名不叠加。' : ''}`,
    };
    for (const [code, base] of Object.entries(baseByCode)) {
      const gid = `garrison_aegir_${code}_${form}`, desc = descriptions[code];
      gs[gid] = { garrisonDesc: desc, description: desc, eventType: 'IN_BATTLE', eventTypeDesc: '作战能力',
        eventTypeIcon: 'icon_battle', effectType: 'GAIN_BUFF', blackboard: bb({ key: 'LOCAL_AEGIR_TRAIT', code, shared: elite ? 1 : 0 }) };
      chs[`${base}_${form}`].garrisonIds = [gid];
    }
    const change = (id, desc, values) => Object.assign(gs[id], { garrisonDesc: desc, description: desc, blackboard: bb(values) });
    change(`garrison_07_${form}`, `已激活阿戈尔每满3层，自身攻击速度+${n}。`,
      { key: 'act1autochess_gar_eff_attrByBond', bond_id: 'egirShip', divide_num: 3, attack_speed: n });
    change(`garrison_38_${form}`, `<战斗中>自身每击倒1名敌人，使已激活阿戈尔、突袭分别+${n}层。`,
      { key: 'act1autochess_gar_event_selfkillenemy', check_cnt: 1, bond_add_count: n, bond_type: 'bond_by_id', bond_id: 'egirShip,raidShip', bond_add_type: 'by_count' });
    change(`garrison_131_${form}`, `<战斗中>本场首次自身击倒敌人或我方干员时，使已激活阿戈尔+${6*n}层（本场上限${6*n}）。`,
      { key: 'act1autochess_gar_event_selfkillenemy', check_cnt: 1, first_kill_only: 1, bond_add_count: 6*n, max_add_count_per_battle: 6*n,
        bond_type: 'bond_by_id', bond_id: 'egirShip', bond_add_type: 'by_count', garrison_key: `garrison_131_${form}` });
  }
  for (const [id, bond] of Object.entries(act.bondInfoDict)) bond.chessIdList = Object.values(chs).filter(c => c.bondIds.includes(id)).map(c => c.chessId);
}

export function finishTriAlliance(files) {
  const setBond = (id, desc, values) => {
    const b = files.bonds[id], e = files.effects[b.effectId];
    Object.assign(b, { desc, descRaw: desc, effectDesc: desc, effectDescRaw: desc });
    Object.assign(e, { desc, descRaw: desc });
    for (const p of [b.bb, e.params, ...b.buffs.map(v => v.bb), ...e.buffs.map(v => v.bb)]) Object.assign(p, values);
  };
  setBond('sarkazShip', '【3】己方在场萨卡兹本体开技，使本玩家存活在场萨卡兹各获得15个百分点攻击力，单次部署上限60%+1%×层数。\n【6】开技后，当前攻击范围内本玩家存活在场单位及自身各获得1层盟约护盾，最多3层，无自然到期；每层完全抵挡一次有效物理或法术伤害。萨卡兹主攻击附加自身当前攻击力10%×剩余盟约盾层数的真实伤害，享受来源增伤，不消耗护盾。', { shield_max_hits: 3, rider_ratio: .10 });
  for (const p of [files.bonds.sarkazShip.bb, ...files.bonds.sarkazShip.buffs.map(v => v.bb), files.effects[files.bonds.sarkazShip.effectId].params]) {
    for (const key of ['shield_atk_ratio', 'shield_base_hp_cap', 'shield_hp_cap_per_stack']) delete p[key];
  }
  files.bonds.sarkazShip.spec = { origin: 'Confirmed 2026-10-25 revision', formulas: { attackCap: '.60 + .01*L', shield: 'min(3,H+1)', trueRider: '.10*currentATK*H with source multipliers' } };
  setBond('sargonShip', '【3】本玩家萨尔贡干员开技，使本玩家在场萨尔贡各获得独立临时增益：攻击力+10%、攻速+10，最多20层，每层持续5+0.22×当时永久层数秒。\n【6】普通策略上限提高至40层，自动回复技能额外自然回技0.01×开战萨尔贡层数/秒；该回技同场固定。娜仁图亚仍为20层并使用原装备共享，不获得普通六人回技。', { base_atk: .10, base_attack_speed: 10, max_buff_stack_cnt: 20, six_max_buff_stack_cnt: 40, sp_per_start_layer: .01 });
  files.bonds.sargonShip.spec = { origin: 'Confirmed 2026-10-25 revision', formulas: { attack: '.10*N', aspd: '10*N', duration: '5+.22*L_live', cap: 'normal six:40; otherwise20', naturalSp: 'normal six:.01*L_start' } };
  const egir = files.bonds.egirShip;
  const old = egir.effectDesc.replace(/最终加算/g, '百分比前基础加算');
  setBond('egirShip', old + '\n【6】本玩家阿戈尔额外基础攻击+1×开战阿戈尔永久层数；开战吞噬前生效，同场固定一份。吞噬读取目标当前有效基础攻击，按合法目标逐笔继承，不复制最终面板。', { six_bond_char_cnt: 6, base_atk_per_start_layer: 1 });
  egir.thresholds = [3, 5, 6];
  if (egir.spec) egir.spec = { origin: 'Confirmed 2026-10-25 revision', formulas: { attack: '(base+settledBaseAdditions)*(1+atkPct)', six: 'L_start before devour' }, thresholds: [3, 5, 6] };
  const diy = files.backups.diy;
  diy.ownedPool = diy.ownedPool.filter(id => id !== 'char_4231_clemnt');
  delete diy.operators.char_4231_clemnt;
  const bandId = 'band_glady', desc = '初始生命29。第1、3、6、8正式回合开始时，分别获得1名未进阶幽灵鲨、斯卡蒂、乌尔比安、歌蕾蒂娅。阿戈尔被硬禁或软禁时不可选。';
  const rewards = ['char_143_ghost','char_263_skadi','char_4145_ulpia','char_474_glady'].map(charId => Object.values(files.chess).find(c => c.charId === charId && c.visible && !c.isGolden)?.chessId);
  if (rewards.some(id => !id)) throw new Error('Gladiia fixed recruitment identity missing');
  const effectId = 'effect_glady';
  files.effects[effectId] = { effectId, name: '歌蕾蒂娅分队', desc, descRaw: desc, buffs: [], params: {} };
  files.bands[bandId] = { ...structuredClone(files.bands.band_recruit_columbia), bandId, sortId: 110, name: '歌蕾蒂娅分队', iconId: 'glady', totalHp: 29,
    effectId, effectName: '深海集结', desc, descRaw: desc, bondIds: ['egirShip'], shopPriority: null,
    recruitment: { kind: 'fixed-chess', bond: 'egirShip', rounds: [1,3,6,8], rewards, count: 1, initialChess: null } };
  for (const item of Object.values(files.items)) if (item.itemId?.startsWith('chess_item_6_04_e') || item.id?.startsWith('chess_item_6_04_e')) {
    const desc = `固定减伤${item.isGolden ? 300 : 180}；阿戈尔携带者受敌方伤害后对来源反击自身当前攻击50%的法术伤害，每0.5秒一次。同一存活在场阿戈尔同时携带阿戈尔重刃时，将这份反击给予本玩家在场阿戈尔，各自独立冷却，同名不叠加；提供者倒下即失效。`;
    Object.assign(item, { desc, descRaw: desc });
  }
}
