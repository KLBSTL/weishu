// 星源: two independent chain attacks, using the engine's chain falloff and per-target sluggish.
import { num, skillRec } from '../shared/tier1.js';
import { rampAspd } from '../shared/columbia.js';
export default {
  char_135_halo: (bb, chess) => {
    const a = skillRec(chess, 'skchr_halo_1'), b = skillRec(chess, 'skchr_halo_2');
    return { talents: [rampAspd(chess, 'halo:aspd')], skills: {
      skchr_halo_1: { kind: 'nextAttack', targeting: { maxTargets: num(a?.bb.max_target, 2) },
        attack: { atkScale: num(a?.bb.atk_scale, 1) } },
      skchr_halo_2: { kind: 'duration', mods: { atkPct: num(b?.bb.atk) },
        targeting: { rangeGrid: b?.rangeGrid, maxTargets: num(b?.bb['attack@max_target'], 2) } },
    }, install(battle, unit) {
      if (unit.skill?.id === 'skchr_halo_1') unit.skill.spec.attack.chain = {
        ...unit.profile.chain, count: num(a?.bb['chain.max_target'], 4), sluggish: num(a?.bb.sluggish, .5),
      };
    } };
  },
};
