import { num, talentBb } from './tier1.js';
// Astesia / Astgenne: count time on field, reset when redeployed, never stack while knocked out.
export function rampAspd(chess, key) {
  const t = talentBb(chess, 0);
  return { install(battle, unit) {
    let time = 0, applied = -1;
    battle.on('deploy', ({ unit: u, move }) => { if (u === unit && !move) { time = 0; applied = -1; } }, { owner: unit });
    battle.on('tick', ({ dt }) => {
      if (!unit.alive || !unit.deployed) return;
      time += dt;
      const stacks = Math.min(num(t.max_stack_cnt, 5), Math.floor((time + 1e-9) / num(t.interval, 20)));
      if (stacks === applied) return;
      applied = stacks;
      battle.addBuff(unit, { key, mods: { aspd: stacks * num(t.attack_speed) } });
    }, { owner: unit });
  } };
}
