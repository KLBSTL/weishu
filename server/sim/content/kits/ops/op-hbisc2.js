// Hibiscus the Purifier / 濯尘芙蓉. Official blackboards and PRTS 濯尘芙蓉 S2 notes.
// Incantation healing is supplied by professions.js; do not heal a second time here.
// [ASSUMED] Tethers deal their first tick after one second, then once per second for eight seconds.
import { num, talentBb, skillRec, enemiesInGrid } from '../shared/tier1.js';

export default {
  char_1024_hbisc2: (bb, chess) => {
    const t = talentBb(chess, 0);
    const s1 = skillRec(chess, 'skcom_atk_up[3]');
    const data = skillRec(chess, 'skchr_hbisc2_2')?.bb ?? bb;
    const key = 'hbisc2:tethers';
    return {
      talents: [{ install(battle, unit) {
        battle.on('hit', ({ source, target, dmg }) => {
          if (source !== unit || target?.side !== 'enemy' || !dmg.isAttack) return;
          battle.applyStrongest(target, 'hbisc2:artsFragile', { duration: num(t['weak[magic][limit]'], 5),
            value: num(t.damage_scale, 1), mods: (v) => ({ artsTakenMul: v }), source: unit });
        }, { owner: unit });
      } }],
      skills: {
        'skcom_atk_up[3]': { kind: 'duration', mods: { atkPct: num(s1?.bb.atk) } },
        skchr_hbisc2_2: {
          kind: 'duration', duration: num(data.hit_duration, 8), attack: { noAttack: true },
          onStart({ battle, unit }) {
            unit.mem[key] = { targets: enemiesInGrid(battle, unit, null, { n: num(data.max_target, 2) }), acc: 0 };
          },
          onTick({ battle, unit, skill, dt }) {
            const st = unit.mem[key];
            if (!st) return;
            st.targets = st.targets.filter((e) => e.alive && e.deployed && !e.hidden && !e.s.flags.levitate && !e.s.flags.untargetable);
            if (!st.targets.length) { skill.end('targets-lost'); return; }
            for (const e of st.targets) battle.applyStrongest(e, `hbisc2:slow:${unit.id}`, {
              duration: .1, value: -num(data.move_speed), mods: (v) => ({ moveMul: 1 - v }), source: unit,
            });
            st.acc += dt;
            while (st.acc >= 1 - 1e-9) {
              st.acc -= 1;
              for (const e of st.targets) if (e.alive) battle.dealDamage(unit, e, {
                amount: unit.s.atk * num(data.atk_scale, 1), type: 'arts', isSkill: true, tags: ['skill', 'hbisc2:s2', 'dot'],
              });
            }
          },
          onEnd({ battle, unit }) {
            for (const e of unit.mem[key]?.targets ?? []) battle.removeBuff(e, `hbisc2:slow:${unit.id}`);
            delete unit.mem[key];
          },
        },
      },
    };
  },
};
