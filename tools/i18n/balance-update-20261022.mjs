// English text for the maintainer-authored rules, keyed by the generated Chinese source.
export function balanceEnglish(data) {
  const dict={},add=(rec,text)=>{if(rec)for(const key of ['desc','descRaw','effectDesc','effectDescRaw'])if(rec[key])dict[rec[key]]=text;};
  for(const g of Object.values(data.garrisons??{})) {
    const id=g.garrisonId,gold=id.endsWith('_b'),n=gold?2:1;
    if(/^garrison_56_/.test(id))add(g,`At preparation end, each Operator on the normal Bench grants ${2*n} stacks to each active Sarkaz and Swift Alliance independently.`);
    if(/^garrison_43_/.test(id))add(g,`On the first real skill activation per battle, grant ${5*n} stacks to each active Sargon and Steadfast Alliance independently. Redeployment does not reset this limit.`);
    if(/^garrison_156_/.test(id))add(g,`On acquisition: grant ${8*n} Yan stacks without requiring activation. Does not grant Miracle stacks.`);
    if(/^garrison_balance_hoshi_/.test(id))add(g,`For every 3 active Yan stacks, gain ${n}% maximum HP and DEF. No ATK bonus.`);
    if(/^garrison_100_/.test(id))add(g,`For every full 3 stacks in the combined active Sargon, Swift and Precise Alliances, deal ${n}% more damage (one linear independent multiplier).`);
    if(/^garrison_balance_rosmontis_/.test(id))add(g,`For every full 3 stacks summed across all active core Alliances, deal ${n}% more damage. Sub-Alliances and inactive stacks do not count.`);
    if(/^garrison_columbia_aphris_/.test(id))add(g,`At preparation start, if Columbia is active, calculate floor(current funds/4) once${gold?'':', capped at 6'}. Pay that many funds and gain ${6*n} Columbia stacks per fund paid. Does not grant Precise stacks.`);
    if(/^garrison_24_/.test(id))add(g,`For every 10 bullets personally consumed, grant ${2*n} stacks to each active Laterano and Precise Alliance. No same-row requirement.`);
    if(g.bb?.copy_distance===2)add(g,`At preparation ${g.eventType==='SERVER_PREP_START'?'start':'end'}, copy the corresponding preparation traits of the Operators on the first and second tiles directly ahead, in order. Use each target's quality and execute as this Operator; skip empty tiles independently.`);
    if(id==='garrison_37_b')add(g,'At preparation start, sequentially recruit 2 random Operators from the Alliance currently having the most deployed members; reuse the normal pool and acquisition rules for each draw.');
  }
  const texts={
    sarkazShip:'[3] Each real skill activation by an own fielded Sarkaz Operator grants 15 percentage points of ATK to each currently living fielded Sarkaz recipient. Cap per deployment: 60% + 1% per stack; redeployment starts at zero. [6] Also grant each recipient a physical/Arts-only barrier equal to 5% of the current ATK sum of living own Sarkaz Operators, capped independently at max HP * (50% + 0.5% per stack). Primary hits add true damage equal to 15% of all remaining numeric barriers, without consuming them or applying source damage multipliers.',
    columbiaShip:'[3] Columbia Operators gain 20% + 0.7% per stack ATK. [6] Hits trigger an Arts bombardment with radius 2.5 and damage equal to 200% of the living own Columbia Operators\' current ATK sum. Shared cooldown: max(1, 8 - floor(stacks/10)*0.1) seconds. Every bombardment creates an independent 5-second region dealing 30% of its snapshotted ATK sum at seconds 1, 2, 3, 4 and 5. Overlaps stack independently. Each 10 newly earned stacks grants a President Doll.',
    lateranoShip:'[3] Ammo skills start with floor(base ammo * (1.05 + 0.015 per stack)) bullets. [6] Each bullet actually consumed grants 3 percentage points of ATK to Laterano recipients, capped at 90% + 1% per stack.',
    yanShip:'[3] Yan ATK increases with stacks. [6] Summon one Yan Aid using its template stats plus 30% of the starting ATK and HP sums of Yan Operators. Existing triple-target attacks, Burn buildup, elemental vulnerability and flame skill remain. [9] Summon two instead, with 1.5x ATK and 90% damage reduction; also grant stealth and an extra 100% current-ATK direct elemental hit per legal ordinary-attack target. Skill damage does not trigger this extra hit.',
  };
  for(const[id,text]of Object.entries(texts)){const b=data.bonds?.[id];add(b,text);add(data.effects?.[b?.effectId],text);}
  // Rebuilt overlays also expose existing custom relay and bounty texts that the old overlay omitted.
  Object.assign(dict, {
    '可以使用一个持续时间25秒的“中继器”，能改变自身的攻击方向，且使该次攻击距离+2；“中继器”在场时，自身攻击力+25%': 'Can deploy a Relay lasting 25 seconds to redirect her attacks and extend their range by 2 tiles. While the Relay is deployed, gain 25% ATK.',
    '可以使用一个持续时间35秒的“中继器”，“中继器”再部署时间变短，能改变自身的攻击方向，且使该次攻击距离+2；“中继器”在场时，自身攻击力+35%': 'Can deploy a Relay lasting 35 seconds with a shorter redeployment time to redirect her attacks and extend their range by 2 tiles. While the Relay is deployed, gain 35% ATK.',
    '能将谬因的攻击转向，且使该次攻击距离+2': 'Redirects Aphris\' attacks and extends their range by 2 tiles.',
    '转向': 'Redirection',
    '链路协议': 'Link Protocol',
  });
  const bountyNames = {
    '“最后的蒸汽骑士”': "'The Last Steam Knight'", '“木裂”埃克提尔尼尔': "'Eikthyrnir,' the Scar of the Shattered",
    '“桥夹”克里夫': "'Clip' Cliff", '“遗弃者”': 'The Forsaken', '扎罗，“狼之主”': 'Zaaro, Signore dei Lupi',
    '整合运动士兵': 'Reunion Soldier', '最后的骑士': 'The Last Knight', '漂泊颂偶': 'Wandering Puppet',
    '爱国者': 'Patriot', '编织泪水的术师': 'The Tear Weaver', '迷路的巨像': 'Lost Colossus', '锏': 'Degenbrecher',
  };
  const visit = value => {
    if (typeof value === 'string') {
      const title = value.match(/^(.+?)\s*·悬赏$/);
      if (title && bountyNames[title[1].trim()]) dict[value] = `${bountyNames[title[1].trim()]}/Bounty`;
      const desc = value.match(/^为自身第12回合作战添加1名(.+?)，完整击败后获得(\d+)资金，下回合到账；漏怪扣1生命。$/);
      if (desc && bountyNames[desc[1].trim()]) dict[value] = `Add 1 ${bountyNames[desc[1].trim()]} to your round 12 battle. Fully defeat it to earn ${desc[2]} funds at the start of the next round. If it leaks, lose 1 HP.`;
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child);
  };
  visit(data.effects); visit(data.choices);
  return dict;
}
