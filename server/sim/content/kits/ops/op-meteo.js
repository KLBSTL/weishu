// Meteorite / 陨星: official skill blackboards; PRTS 陨星 (S1 radius 2, ordinary splash radius 1).
// [ASSUMED] S2 is an immediate radius-1 impact; no projectile flight delay in this first playable.
import { num, talentBb, skillRec, enemiesInGrid } from '../shared/tier1.js';

export default {
  char_219_meteo: (bb, chess) => {
    const talent = talentBb(chess, 0);
    const s1 = skillRec(chess, 'skchr_meteo_1');
    const s2 = skillRec(chess, 'skchr_meteo_2');
    return {
      trait: { splashRadius: 1 },
      talents: [{ install(battle, unit) {
        battle.on('beforeAttack', ({ attacker }) => {
          if (attacker !== unit) return;
          battle.removeBuff(unit, 'meteo:crit');
          if (battle.rng.chance(num(talent.prob))) battle.addBuff(unit, {
            key: 'meteo:crit', duration: .1, mods: { atkPct: num(talent.atk) },
          });
        }, { owner: unit });
        battle.on('attack', ({ attacker }) => {
          if (attacker === unit) battle.removeBuff(unit, 'meteo:crit');
        }, { owner: unit });
      } }],
      skills: {
        skchr_meteo_1: { kind: 'instant', attack: { atkScale: num(s1?.bb.atk_scale, 1), splashRadius: 2 } },
        skchr_meteo_2: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const target = enemiesInGrid(battle, unit, null, { n: 1 })[0];
            if (!target) return;
            const data = s2?.bb ?? bb;
            // This separate skill cast rolls once for the whole explosion, not once per victim.
            const crit = battle.rng.chance(num(talent.prob)) ? num(talent.atk) : 0;
            if (crit) battle.addBuff(unit, { key: 'meteo:skillCrit', mods: { atkPct: crit } });
            const amount = unit.s.atk * num(data.atk_scale, 1);
            for (const e of battle.foesInRadius(target.x, target.y, 1)) {
              battle.applyStrongest(e, 'meteo:def', { duration: num(data.duration, 10), value: -num(data.def),
                mods: (v) => ({ defFlat: -v }), source: unit });
              battle.dealDamage(unit, e, { amount, type: 'phys', isSkill: true, tags: ['skill', 'meteo:s2'] });
            }
            battle.removeBuff(unit, 'meteo:skillCrit');
            battle.fx('explosion', { x: target.x, y: target.y, radius: 1, id: unit.id });
          },
        },
      },
    };
  },
};
