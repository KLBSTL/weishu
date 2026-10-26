// Authored translations for the confirmed three-alliance revision.
export function triAllianceEnglish(data) {
  const dict = {};
  const add = (rec, text) => { for (const key of ['desc','descRaw','effectDesc','effectDescRaw']) if (rec?.[key]) dict[rec[key]] = text; };
  const texts = {
    sarkazShip: '[3] Real skill activations grant own living fielded Sarkaz Operators 15 percentage points of ATK, capped per deployment at 60% + 1% per permanent stack. [6] After activation, grant the caster and each own living field unit in its current attack range one alliance shield, up to 3 without expiry. Each blocks one valid Physical/Arts instance. Primary Sarkaz hits add true damage equal to 10% current ATK per remaining alliance shield, with source damage bonuses and without consuming shields.',
    sargonShip: '[3] Each real skill activation grants own fielded Sargon recipients one independent +10% ATK/+10 ASPD stack, up to 20; each lasts 5 + 0.22 times live permanent stacks seconds. [6] Normal strategies raise the cap to 40 and add 0.01 times starting Sargon stacks natural SP per second to automatic-recovery skills. The snapshot stays fixed this battle. Narantuya retains 20 stacks and the original equipment sharing instead of the normal six-member effects.',
    egirShip: '[3] Retain HP growth and battle-start devour. Devoured ATK is a base addition before ATK percentages; each marked target contributes its current effective base ATK exactly once, including previously settled devours. [5] Retain the original free-revival limit and ordering. [6] Own Aegir recipients gain starting Aegir stacks as extra base ATK before devour, once per battle; later stack growth does not change this addition.',
  };
  for (const [id,text] of Object.entries(texts)) { const b=data.bonds[id]; add(b,text); add(data.effects[b.effectId],text); }
  for (const g of Object.values(data.garrisons)) {
    const elite = g.garrisonId.endsWith('_b'), n=elite?2:1, shared=elite?'own Aegir Operators':'this Operator';
    const lifecycle=elite?' Shared after legal deployment; persists after knock-outs, clears on non-KO removal; duplicate traits do not stack.':'';
    const id=g.garrisonId;
    if (id.startsWith('garrison_aegir_udflow_')) add(g, `Against enemies strictly below 50% HP before impact, ${shared} attack at 150% ATK.${lifecycle}`);
    if (id.startsWith('garrison_aegir_ulpia_')) add(g, `Every 10 active Aegir stacks increase healing and legitimate HP regeneration received by ${shared} by 10%, linearly, once per restoration.${lifecycle}`);
    if (id.startsWith('garrison_aegir_skadi2_')) add(g, `Every 10 active Aegir stacks grant ${shared} 50 HP regeneration and 0.1 natural SP per second.${lifecycle}`);
    if (id.startsWith('garrison_aegir_clemnt_')) add(g, `Every 2 active Aegir stacks grant ${shared} +1% ATK.${lifecycle}`);
    if (id.startsWith('garrison_07_')) add(g, `Every 3 active Aegir stacks grant this Operator +${n} ASPD, without an ATK bonus.`);
    if (id.startsWith('garrison_38_')) add(g, `Each enemy personally defeated grants ${n} stacks to each active Aegir and Raid Alliance independently.`);
    if (id.startsWith('garrison_131_')) add(g, `The first enemy or allied Operator personally knocked out this battle grants ${6*n} active Aegir stacks; cap ${6*n} per battle. Does not grant Arcane stacks.`);
  }
  const band = data.bands.band_glady;
  add(band, 'Start with 29 LP. At the start of rounds 1/3/6/8, obtain one normal Specter/Skadi/Ulpianus/Gladiia respectively. Unavailable if Aegir is hard- or soft-banned.');
  add(data.effects[band?.effectId], dict[band?.desc]);
  dict['歌蕾蒂娅分队']='Gladiia Squad'; dict['深海集结']='Deepsea Assembly';
  for(const item of Object.values(data.items)) if(item.id?.startsWith('chess_item_6_04_e')) add(item, `Reduce incoming damage by ${item.isGolden?300:180}. Aegir carriers counter enemy damage with 50% of their current ATK as Arts, once per 0.5 seconds. A living fielded Aegir Operator carrying this and the Aegir Heavy Blade grants the same counter to own fielded Aegir Operators, with independent recipient cooldowns; duplicates do not stack and the provider must stay alive.`);
  return dict;
}
