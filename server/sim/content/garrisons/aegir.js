// Confirmed 2026-10-25 Aegir traits. Shared traits survive knock-outs, never non-KO exits or new battles.
import * as S from '../support/index.js';
import { primaryHit } from '../bonds/attack-riders.js';

const BOND = 'egirShip';
const GROUPS = ['udflow', 'ulpia', 'skadi2', 'clemnt'];
const gid = (code, form) => `garrison_aegir_${code}_${form}`;
const owns = (u, code, form) => (u.def?.raw?.garrisonIds ?? []).includes(gid(code, form));

export function installAegirTraits(battle) {
  const state = S.battleStore(battle, 'garrisons:aegir', () => ({ installed: false }));
  if (state.installed) return;
  state.installed = true;
  const providers = new Set();
  const ops = battle.allyUnits.filter(S.isOp);
  if (!ops.some(u => GROUPS.some(code => owns(u, code, 'a') || owns(u, code, 'b')))) return;
  const member = u => S.isOp(u) && S.isMember(battle, u, BOND);
  const active = (u, code) => owns(u, code, 'a') || (owns(u, code, 'b') && providers.has(u))
    || (member(u) && ops.some(p => p.ownerId === u.ownerId && owns(p, code, 'b') && providers.has(p)));
  const refresh = () => {
    for (const p of providers) if (!p.alive && p.removeReason !== 'killed') providers.delete(p);
    for (const u of ops) {
      const L = S.bondActive(battle, u.ownerId, BOND) ? S.bondLayers(battle, u.ownerId, BOND) : 0;
      for (const code of GROUPS) {
        const key = `gar:aegir:${code}`;
        const enabled = active(u, code);
        const k = Math.floor(L / (code === 'clemnt' ? 2 : 10));
        const signature = `${enabled}|${k}`;
        const cache = u.mem.aegirTraitCache ??= {};
        if (cache[code] === signature) continue;
        cache[code] = signature;
        if (!enabled || code === 'udflow') { battle.removeBuff(u, key); continue; }
        const mods = code === 'ulpia' ? { recoveryTakenMul: 1 + .10 * k }
          : code === 'skadi2' ? { hpRegen: 50 * k, spRecoveryFlat: .1 * k }
          : S.directMods({ atk: .01 * k });
        S.passiveBuff(battle, u, key, mods);
      }
    }
  };
  battle.on('deploy', ({ unit, move }) => {
    if (!move && GROUPS.some(code => owns(unit, code, 'b'))) providers.add(unit);
    refresh();
  });
  battle.on('unitLeave', ({ unit, reason }) => {
    if (reason !== 'killed') providers.delete(unit);
    refresh();
  });
  // Live layers/qualification and suppressed non-KO exits are reconciled before the next combat action.
  battle.on('tick', refresh);
  battle.on('layerGain', () => battle.after(0, refresh));
  battle.on('hit', ({ source, target, dmg }) => {
    if (!source || target?.side !== 'enemy' || !primaryHit(dmg) || !active(source, 'udflow')) return;
    if (target.hp < target.s.maxHp * .5) dmg.amount *= 1.5;
  }, { priority: 0 });
  refresh();
}
