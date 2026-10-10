// 豆苗: real crab stats, tactical-point recovery, four adjacent temporary crabs, timed DP.
import { num, skillRec } from '../shared/tier1.js';
const CRAB = 'token_10014_bstalk_crab';
const REST = 'bstalk:recover';
export function refreshCrab(battle, crab) {
  if (!crab?.alive) return;
  crab.mem.bstalkRecover = (crab.mem.bstalkRecover ?? 0) + 1;
  battle.removeBuff(crab, REST); crab.hp = crab.s.maxHp;
}
export function crabKit() {
  return { trait: { noHeal: true }, install(battle, unit) {
    const block = (unit.def.talents ?? []).reduce((n, t) => num(t.bb?.block_cnt, n), 1);
    battle.addBuff(unit, { key: 'bstalk:noHeal', mods: { blockCnt: block }, flags: { noHeal: true }, persist: true, allowDead: true });
    battle.on('fatal', ctx => {
      if (ctx.unit !== unit || unit.mem.bstalkTemporary) return;
      ctx.prevented = true; unit.hp = 1; battle.releaseBlocked(unit);
      const generation = unit.mem.bstalkRecover = (unit.mem.bstalkRecover ?? 0) + 1;
      battle.addBuff(unit, { key: REST, flags: { noBlock: true, disarm: true, invulnerable: true, untargetable: true } });
      const delay = unit.ownerUnit?.def?.raw?.status?.phase >= 2 ? 15 : 17;
      battle.after(delay, () => {
        if (unit.alive && unit.ownerUnit?.alive && unit.mem.bstalkRecover === generation) refreshCrab(battle, unit);
      }, { owner: unit });
    }, { owner: unit });
    battle.on('death', ({ unit: u }) => {
      if (u === unit.ownerUnit && unit.alive) battle.retreat(unit, { reason: 'owner-left', permanent: true });
    }, { owner: unit });
  } };
}
export default {
  char_452_bstalk: (bb, chess) => {
    const a = skillRec(chess, 'skchr_bstalk_1'), b = skillRec(chess, 'skchr_bstalk_2');
    const summon = (battle, unit) => {
      const placed = battle.allyUnits.find(u => u.ownerUnit === unit && u.defId === CRAB && u.uid != null && !u.removed);
      if (placed && !placed.alive) battle.redeploy(placed, { free: true });
      const live = battle.allyUnits.find(u => u.ownerUnit === unit && u.defId === CRAB && u.alive && !u.mem.bstalkTemporary);
      if (live) { unit.trait.reinforcement = live; return live; }
      const point = battle.findTacticalPoint(unit);
      const crab = point && battle.spawnToken(unit, CRAB, point[0], point[1], { kit: crabKit() });
      unit.trait.reinforcement = crab; return crab;
    };
    return { trait: { dmgMul: (battle, unit, target) =>
      target.blockedBy?.ownerUnit === unit && target.blockedBy.defId === CRAB ? (unit.profile.reinforceScale ?? 1.5) : 1,
    install(battle, unit) {
      battle.on('deploy', ({ unit: u }) => { if (u === unit) summon(battle, unit); }, { owner: unit, priority: -50 });
    } }, skills: {
      skchr_bstalk_1: { kind: 'instant', onStart({ battle, unit }) {
        battle.addDp(unit.ownerId, num(a?.bb.cost)); refreshCrab(battle, summon(battle, unit));
      } },
      skchr_bstalk_2: { kind: 'duration', onStart({ battle, unit }) {
        const main = summon(battle, unit); unit.mem.bstalkDp = 0;
        if (main) for (const [dr, dc] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
          const r = main.tileR + dr, c = main.tileC + dc;
          if (!battle.grid.canStand(r, c) || !battle.grid.groundPassable(r, c) || battle.isReservedTile(r, c)) continue;
          const crab = battle.spawnToken(unit, CRAB, r, c, { kit: crabKit() });
          if (crab) crab.mem.bstalkTemporary = true;
        }
        for (const crab of battle.allyUnits.filter(u => u.ownerUnit === unit && u.defId === CRAB && u.alive)) {
          battle.addBuff(crab, { key: 'bstalk:s2:def', mods: { defPct: num(b?.bb['attack@def']) } });
        }
      }, onTick({ battle, unit, dt }) {
        unit.mem.bstalkDp += dt;
        const interval = num(b?.bb.interval, 1.25);
        while (unit.mem.bstalkDp >= interval - 1e-9) {
          unit.mem.bstalkDp -= interval; battle.addDp(unit.ownerId, num(b?.bb.cost, 1));
        }
      }, onEnd({ battle, unit }) {
        for (const crab of battle.allyUnits.filter(u => u.ownerUnit === unit && u.defId === CRAB)) {
          battle.removeBuff(crab, 'bstalk:s2:def');
          if (crab.alive && crab.mem.bstalkTemporary) battle.retreat(crab, { reason: 'expired', permanent: true });
        }
      } },
    } };
  },
};
