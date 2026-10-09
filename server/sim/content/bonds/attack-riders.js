// Primary direct attack hits may grant one rider per segment and target, never another rider.
const excluded = new Set(['aftershock', 'dot', 'periodic', 'reflect', 'counter', 'burst', 'hpLoss',
  'followup', 'wisdel:bomb', 'wisdel:shock', 'aphris:relay']);
export function primaryHit(dmg) {
  return !!dmg && !dmg.sourceless && dmg.type !== 'element' && (dmg.isAttack || dmg.isSkill) &&
    !(dmg.tags ?? []).some(t => excluded.has(t) || /^(bond:|item:|garrison:)/.test(t));
}
