// Confirmed maintainer rules; docs/balance-update-20261022-spec.md.
const bb = values => Object.entries(values).map(([key, v]) => ({key, value:typeof v==='number'?v:0, valueStr:typeof v==='string'?v:null}));
export function prepareBalanceUpdate({act}) {
  const gs=act.garrisonDataDict,chs=act.charChessDataDict,shops=act.charShopChessDatas;
  const change=(id,desc,values,props={})=>Object.assign(gs[id],{garrisonDesc:desc,description:desc,blackboard:bb(values),...props});
  const identities=(base,bonds)=>{
    const char=shops[base].charId;
    for(const [id,s]of Object.entries(shops))if(s.charId===char)for(const key of [id,s.goldenChessId])if(chs[key])chs[key].bondIds=[...bonds];
  };
  for(const[base,bonds]of [
    ['chess_char_6_columbia_aphris_a',['columbiaShip']],['chess_char_4_sarkaz_ifrit_a',['sarkazShip']],
    ['chess_char_5_08_a',['victoriaShip','steadShip']],['chess_char_2_19_a',['swiftShip','columbiaShip','investShip']],
    ['chess_char_3_06_a',['sargonShip','steadShip']],['chess_char_5_23_a',['yanShip','miraShip']],
  ])identities(base,bonds);
  for(const suffix of ['a','b']) {
    const gold=suffix==='b',n=gold?2:1;
    change(`garrison_56_${suffix}`,`<休整期结束时>普通整备区每有1名干员，使已激活的【萨卡兹】【迅捷】各+${2*n}层`,
      {multi:2*n,add_method:'hand_count',bond:'sarkazShip,swiftShip',conditionkey:'character_target_inboard'});
    change(`garrison_43_${suffix}`,`<战斗中>本场第一次开启技能时，使已激活的【萨尔贡】【坚守】各+${5*n}层`,
      {key:'act1autochess_gar_event_useskill',bond_type:'bond_by_id',bond_id:'sargonShip,steadShip',bond_add_type:'by_count',bond_add_count:5*n,first_skill_only:1});
    change(`garrison_156_${suffix}`,`<获得时>【炎】层数+${8*n}（无需激活）`,{bond:'yanShip',count:8*n},{effectType:'SERVER_ADD_BOND'});
    for(const base of ['chess_char_4_15','chess_char_5_23'])chs[`${base}_${suffix}`].garrisonIds=[`garrison_156_${suffix}`];
    const hosi=`garrison_balance_hoshi_${suffix}`;
    gs[hosi]=structuredClone(gs[`garrison_65_${suffix}`]);
    change(hosi,`已激活的【炎】每满3层，自身最大生命与防御各+${n}%`,
      {key:'act1autochess_gar_eff_attrByBond',bond_id:'yanShip',divide_num:3,max_hp:.01*n,def:.01*n},
      {effectType:'GAIN_BUFF',eventType:'IN_BATTLE',eventTypeDesc:'作战能力',eventTypeIcon:'icon_battle'});
    chs[`chess_char_4_17_${suffix}`].garrisonIds=[hosi];
    change(`garrison_100_${suffix}`,`已激活的【萨尔贡】【迅捷】【精准】层数之和每满3层，自身造成伤害+${n}%`,
      {key:'LOCAL_DAMAGE_BY_BOND',bond_id:'sargonShip,swiftShip,preciShip',divide_num:3,damage_scale_per_stack:.01*n});
    const rose=`garrison_balance_rosmontis_${suffix}`;
    gs[rose]=structuredClone(gs[`garrison_09_${suffix}`]);
    change(rose,`所有已激活核心盟约层数之和每满3层，自身造成伤害+${n}%`,
      {key:'LOCAL_DAMAGE_BY_BOND',core_only:1,divide_num:3,damage_scale_per_stack:.01*n});
    chs[`chess_char_6_12_${suffix}`].garrisonIds=[rose,`garrison_03_${suffix}`];
    change(`garrison_columbia_aphris_${suffix}`,`<进入休整期时>若哥伦比亚已激活，每持有4资金支付1资金，使哥伦比亚+${6*n}层${gold?'（无次数上限）':'（至多6次）'}。`,
      {count:6*n,funds_per_trigger:4,...(gold?{}:{max_triggers:6}),conditionkey:'character_target_inboard'});
    const ammo=gs[`garrison_24_${suffix}`];
    ammo.blackboard=ammo.blackboard.filter(x=>!['check_count','conditionkey'].includes(x.key));
    ammo.garrisonDesc=ammo.description=`<战斗中>自身每实际消耗10发弹药，使已激活的【拉特兰】【精准】各+${2*n}层`;
  }
  for(const [id,event]of [['garrison_86_b','进入休整期时'],['garrison_99_b','休整期结束时'],['garrison_columbia_demkni_b','休整期结束时']]) {
    const g=gs[id];g.blackboard.push(...bb({copy_distance:2}));
    g.garrisonDesc=g.description=`${event}，依次复制身前第1格、第2格干员的“${event}”特质（使用目标品质，以自身为主体）。`;
  }
  gs.garrison_37_b.blackboard.push(...bb({count:2}));
  gs.garrison_37_b.garrisonDesc=gs.garrison_37_b.description='<进入休整期时>依次随机获得2名当前人数最多盟约的干员';
  shops.chess_char_5_23_a.chessLevel=4;
  for(const suffix of ['a','b'])chs[`chess_char_5_23_${suffix}`].status=structuredClone(chs[`chess_char_4_15_${suffix}`].status);
  // The old four-tier alias remains hidden; the stable five-tier ID now denotes the sole regular four-tier identity.
  shops.chess_char_4_15_a.isHidden=true;
  for(const[id,bond]of Object.entries(act.bondInfoDict))bond.chessIdList=Object.values(chs).filter(c=>c.bondIds.includes(id)).map(c=>c.chessId);
}
export function finishBalanceChess(chess) {
  for(const [old,canonical]of [['1_16','2_19'],['5_16','4_21'],['6_10','5_22'],['4_15','5_23']]) {
    for(const id of [old,canonical])for(const form of ['a','b']) {
      const c=chess[`chess_char_${id}_${form}`];c.bondIdentityId=`chess_char_${canonical}_a`;
      if(old==='4_15'&&id===old) {
        c.baseId=`chess_char_${canonical}_a`;c.goldenId=`chess_char_${canonical}_b`;
        if(!c.isGolden)c.upgradeChessId=c.goldenId;
      }
    }
  }
}
export function finishBalanceUpdate(files) {
  const descriptions={
    sarkazShip:'【3】己方在场萨卡兹本体每次开启技能，使己方在场存活萨卡兹各获得15个百分点攻击力，单次部署上限60%+1%×层数。\n【6】同时享受三人效果；开技后按存活本体当前攻击和的5%为每名受益者增加仅吸收物理/法术的屏障，本来源上限为其最大生命×(50%+0.5%×层数)。主攻击命中额外造成攻击者所有剩余数值屏障15%的真实伤害，不消耗屏障。',
    columbiaShip:'【3】哥伦比亚干员攻击力+20%+0.7%×层数。\n【6】攻击触发以目标为中心半径2.5格的轰炸，造成己方存活哥伦比亚本体攻击和200%的法术伤害；共享冷却max(1,8−floor(层数/10)×0.1)秒。每次产生独立燃烧区域，5秒内每秒造成快照攻击和30%的法术伤害，共5次；重叠区域独立结算。每新增10层获得大总统玩偶。',
  };
  for(const[id,desc]of Object.entries(descriptions)) {
    Object.assign(files.bonds[id],{desc,descRaw:desc,effectDesc:desc,effectDescRaw:desc});
    Object.assign(files.effects[files.bonds[id].effectId],{desc,descRaw:desc});
  }
  Object.assign(files.bonds.sarkazShip.bb,{base_atk:0,atk_per_stack:0,atk_per_cast:.15,base_atk_cap:.6,atk_cap_per_stack:.01,
    shield_atk_ratio:.05,shield_base_hp_cap:.5,shield_hp_cap_per_stack:.005,rider_ratio:.15});
  Object.assign(files.bonds.columbiaShip.bb,{burst_atk_ratio:2,base_cooldown:8,burn_atk_ratio:.3,burn_duration:5});
  const later=files.bonds.lateranoShip;
  const desc=later.effectDesc.split('\n')[0]+'\n<在场6名不同【拉特兰】干员>每实际消耗1发弹药，使拉特兰受益干员增加3个百分点攻击，上限90%+1%×拉特兰层数。';
  Object.assign(later,{desc,descRaw:desc,effectDesc:desc,effectDescRaw:desc});
  for(const params of [later.bb,...later.buffs.map(b=>b.bb)])Object.assign(params,{atk_per_consume:.03,max_atk_for_consume:.90,max_atk_per_stack:.01});
  const effect=files.effects[later.effectId];Object.assign(effect,{desc,descRaw:desc});
  Object.assign(effect.params,{atk_per_consume:.03,max_atk_for_consume:.90,max_atk_per_stack:.01});
  for(const b of effect.buffs)Object.assign(b.bb,{atk_per_consume:.03,max_atk_for_consume:.90,max_atk_per_stack:.01});
  const yan=files.bonds.yanShip;
  const extra='\n九人追加：炎佑获得隐匿，普通攻击对每个合法命中目标追加当前攻击力100%的直接元素伤害。';
  yan.desc+=extra;yan.descRaw+=extra;yan.effectDesc+=extra;yan.effectDescRaw+=extra;
  files.effects[yan.effectId].desc+=extra;files.effects[yan.effectId].descRaw+=extra;
  Object.assign(later.spec.formulas,{'atkPerAmmo(6)':'0.03','atkCap(6)':'0.90 + 0.01*L'});
  later.spec.tiers[1].effect='Each consumed bullet adds 3 percentage points of ATK; cap 90% + 1%*L.';
  later.spec.caps='90% + 1%*L from the six-member effect';
  later.spec.layerGain=later.spec.layerGain.replace(' with 3 ops in its row','');
  yan.spec.tiers[2].effect+=' Also grants stealth and one 100% current-ATK direct elemental rider per ordinary attack target.';
  yan.spec.layerGain=yan.spec.layerGain.replace(/录武官[^;；]*/, '录武官 on gain +8/+16 炎');
  files.bonds.sarkazShip.spec={origin:'Confirmed 2026-10-22 revision',formulas:{attackCap:'.60 + .01*L',shieldPerCast:'.05*livingOwnSarkazAtk',shieldCap:'maxHP*(.50+.005*L)',trueRider:'.15*remainingNumericShields'}};
  files.bonds.columbiaShip.spec={origin:'Confirmed 2026-10-22 revision',formulas:{burst:'2*livingOwnColumbiaAtk',cooldown:'max(1,8-floor(L/10)*.1)',burn:'.30*snapshotAtk each second for five ticks per independent region'}};
  files.backups.diy.operators.char_4231_clemnt.bonds=['egirShip'];
}
