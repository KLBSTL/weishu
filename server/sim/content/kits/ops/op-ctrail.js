// 云迹: airborne only during skills; S2 two normal targets plus one additional flying target.
import { num, skillRec, talentBb, enemiesInGrid } from '../shared/tier1.js';
export default {
  char_4165_ctrail: (bb, chess) => {
    const a = skillRec(chess, 'skchr_ctrail_1'), b = skillRec(chess, 'skchr_ctrail_2'), t = talentBb(chess, 0);
    const takeoff = ({ battle, unit }) => { battle.releaseBlocked(unit); battle.removeBuff(unit, 'ctrail:ground'); };
    const land = ({ battle, unit }) => { battle.releaseBlocked(unit); battle.addBuff(unit, { key: 'ctrail:ground', mods: { defPct: num(t.def) } }); };
    return { trait: { blockFly: false }, skills: {
      skchr_ctrail_1: { kind: 'duration', activateOnDeploy: true, duration: num(a?.bb.duration, a?.duration ?? 30),
        mods: { atkPct: num(a?.bb.atk), dodgePhys: num(a?.bb.prob) }, flags: { liftoff: true, blockFly: true },
        targeting: { rangeGrid: a?.rangeGrid }, onStart: takeoff, onEnd: land },
      skchr_ctrail_2: { kind: 'duration', mods: { atkPct: num(b?.bb.atk) }, flags: { liftoff: true, blockFly: true },
        targeting: { rangeGrid: b?.rangeGrid, maxTargets: 3 }, onStart: takeoff, onEnd: land },
    }, install(battle, unit) {
      battle.removeBuff(unit, 'trait:skywalker');
      battle.on('deploy', ({ unit: u }) => { if (u === unit && !unit.s.flags.liftoff) land({ battle, unit }); }, { owner: unit, priority: 100 });
      battle.on('beforeAttack', ctx => {
        if (ctx.attacker !== unit || !unit.skill?.active || unit.skill.id !== 'skchr_ctrail_2') return;
        const targets = ctx.targets.slice(0, 2);
        const extra = enemiesInGrid(battle, unit).find(e => e.isFlying && !targets.includes(e));
        if (extra) targets.push(extra);
        ctx.targets = targets;
      }, { owner: unit });
      battle.on('hit', ({ source, dmg }) => {
        if (source === unit && dmg.isAttack && unit.s.flags.liftoff) dmg.amount *= num(t.atk_scale, 1);
      }, { owner: unit });
      battle.on('damaged', ({ source, target, dmg }) => {
        if (source === unit && dmg.isAttack && target?.isFlying && unit.skill?.active && unit.skill.id === 'skchr_ctrail_2') {
          battle.applyStatus(target, 'sluggish', { duration: num(b?.bb['attack@sluggish'], 1.5), source: unit });
        }
      }, { owner: unit });
    } };
  },
};
