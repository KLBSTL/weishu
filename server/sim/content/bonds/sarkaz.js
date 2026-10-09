// Original expansion approved by the user; rules: docs/design/sarkaz.md.
// Numeric barriers are separate from hit-count shields. No timers or random choices.
import * as S from '../support/index.js';
import { numericShieldTotal, clampNumericShields } from '../../buffs.js';
import { hasHp } from '../../damage.js';
import { primaryHit } from './attack-riders.js';

export const BOND = 'sarkazShip';
export const SHIELD = 'bond:sarkaz:barrier';
export const hasBarrier = (u) => numericShieldTotal(u) > 0;
const traits = (u) => u.def?.raw?.garrisonIds ?? [];
const has = (u, code, form) => traits(u).includes(`garrison_sarkaz_${code}_${form}`);
const elite = (u, code) => has(u, code, 'b');
const owns = (u, code) => has(u, code, 'a') || elite(u, code);
const gain = (battle, u, bonds, n) => {
  const added = S.gainLayers(battle, { playerId: u.ownerId, source: u, bonds, n, reason: 'garrison' });
  u.stats.layersGranted = (u.stats.layersGranted ?? 0) + added;
  return added;
};

export function install(battle) {
  for (const p of battle.players) {
    const pid = p.playerId;
    const ops = S.playerOps(battle, pid);
    const L = () => S.bondLayers(battle, pid, BOND);
    const active = () => S.bondActive(battle, pid, BOND);
    const member = (u) => u?.kind === 'op' && u.ownerId === pid && S.isMember(battle, u, BOND);
    const refresh = () => {
      for (const u of ops) {
        if (active() && member(u)) S.passiveBuff(battle, u, 'bond:sarkaz:attack', S.directMods({ atk: .20 + .006 * L() }));
        if (owns(u, 'wisdel')) S.passiveBuff(battle, u, 'garrison:sarkaz:wisdel', {
          dmgDealtMul: active() ? 1 + (elite(u, 'wisdel') ? .02 : .01) * L() : 1,
        });
      }
    };
    refresh();
    for (const u of ops) if (owns(u, 'ifrit')) S.passiveBuff(battle, u, 'garrison:sarkaz:ifrit', { dmgDealtMul: 1.30 });
    battle.on('layerGain', ({ playerId, bondId }) => {
      if (playerId === pid && bondId === BOND) battle.after(0, refresh);
    });

    battle.on('kill', ({ killer, victim }) => {
      if (!killer || killer.ownerId !== pid || victim?.side !== 'enemy') return;
      if (owns(killer, 'hbisc2')) gain(battle, killer, [BOND, 'arcaneShip'], elite(killer, 'hbisc2') ? 2 : 1);
    });

    let typhonUsed = Math.max(0, Math.min(56, p.input?.contentInfo?.sarkazTyphonUsed ?? 0));
    battle.on('skillStart', ({ unit }) => {
      if (!member(unit) || !S.onField(unit) || !active() || !battle.flags.layerGainsEnabled) return;
      const holders = ops.filter(u => owns(u, 'typhon') && S.onField(u));
      const holder = holders.find(u => elite(u, 'typhon')) ?? holders[0];
      if (!holder || typhonUsed >= (elite(holder, 'typhon') ? 56 : 28)) return;
      typhonUsed += 2;
      for (const u of ops) if (owns(u, 'typhon')) u.mem.sarkazTyphonUsed = typhonUsed;
      gain(battle, holder, BOND, 2);
    }, { priority: 90 });

    let shiningUsed = !!p.input?.contentInfo?.sarkazShiningUsed;
    battle.on('skillStart', ({ unit }) => {
      if (unit?.ownerId !== pid || !owns(unit, 'shining') || shiningUsed || !battle.flags.layerGainsEnabled) return;
      const target = S.topActiveBond(battle, pid);
      if (!target) return;
      shiningUsed = true;
      unit.mem.sarkazShiningUsed = true;
      gain(battle, unit, target, elite(unit, 'shining') ? 12 : 6);
    }, { priority: 100 });

    if (!S.bondActive(battle, pid, BOND, 2)) continue;
    for (const u of ops) if (member(u)) { u.trait.numericShieldCap = .5; clampNumericShields(u); }
    battle.on('skillStart', ({ unit }) => {
      if (!member(unit) || !S.onField(unit)) return;
      refresh(); // earlier skill-start growth is already recorded; skill mods apply before skillStart.
      const recipients = S.bondMembers(battle, pid, BOND, { fieldOnly: true });
      const total = S.playerOps(battle, pid, { fieldOnly: true })
        .filter((u) => S.unitBonds(u).includes(BOND)).reduce((n, u) => n + u.s.atk, 0);
      for (const u of recipients) {
        const old = u.findBuff(SHIELD)?.shield ?? 0;
        const room = Math.max(0, u.s.maxHp * .50 - numericShieldTotal(u));
        const shield = old + Math.min(total * .03, room);
        u.stats.shieldGranted = (u.stats.shieldGranted ?? 0) + Math.max(0, shield - old);
        if (shield > 0) battle.addBuff(u, { key: SHIELD, shield, duration: Infinity });
        S.fxOn(battle, 'shield', u, unit.id, SHIELD);
      }
    }, { priority: -200 });
    const hits = new WeakMap();
    battle.on('hit', ({ source, target, dmg }) => {
      if (!member(source) || target?.side !== 'enemy' || !primaryHit(dmg)) return;
      hits.set(dmg, .3 * numericShieldTotal(source));
    }, { priority: -1000 });
    battle.on('damaged', ({ source, target, dmg }) => {
      const amount = hits.get(dmg); hits.delete(dmg);
      if (!(amount > 0) || !source || !hasHp(target)) return;
      // Skip source multipliers; target vulnerability/reduction, shields, immunity and kill credit remain native.
      battle.dealDamage(source, target, { amount, type: 'true', sourceless: true, canDodge: false, tags: ['bond:sarkaz:rider'] });
    });
    battle.on('tick', ({ dt }) => {
      for (const u of ops) {
        if (S.onField(u) && member(u)) {
          u.stats.fieldSeconds = (u.stats.fieldSeconds ?? 0) + dt;
          if (hasBarrier(u)) u.stats.barrierSeconds = (u.stats.barrierSeconds ?? 0) + dt;
        }
        clampNumericShields(u);
      }
    });
  }
}

export function registerMeta(registry) {
  // Explicit gain handlers preserve the dispatcher contract and Investor re-triggers.
  registry.garrison('SARKAZ_VIGNA', {
    onGain(ctx) {
      if (ctx.counter('sarkaz:vigna:first')) return;
      ctx.setCounter('sarkaz:vigna:first', 1);
      ctx.addLayers(BOND, 2, { requireActive: false });
    },
  });
  registry.garrison('SARKAZ_METEO', {
    onGain(ctx) {
      ctx.addLayers('swiftShip', ctx.chessRecord(ctx.source.piece.id)?.isGolden ? 4 : 2, { requireActive: false });
    },
  });
  registry.global('sarkaz_acquire', {
    onBattleStart(ctx, ev) {
      if (ev.input && ctx.counter('sarkaz:shining:round') === ctx.round) {
        (ev.input.contentInfo ??= {}).sarkazShiningUsed = true;
      }
      if (ev.input && ctx.counter('sarkaz:typhon:round') === ctx.round) {
        (ev.input.contentInfo ??= {}).sarkazTyphonUsed = ctx.counter('sarkaz:typhon:used');
      }
    },
    onBattleResult(ctx, ev) {
      if (ev.result?.sarkazShiningUsed || ev.unite?.sarkazShiningUsed) ctx.setCounter('sarkaz:shining:round', ctx.round);
      const used = Math.max(ev.result?.sarkazTyphonUsed ?? 0, ev.unite?.sarkazTyphonUsed ?? 0,
        ctx.counter('sarkaz:typhon:round') === ctx.round ? ctx.counter('sarkaz:typhon:used') : 0);
      ctx.setCounter('sarkaz:typhon:round', ctx.round);
      ctx.setCounter('sarkaz:typhon:used', Math.min(56, used));
    },
    onMerge(ctx, ev) {
      if (ev.kind !== 'chess' || ctx.chessRecord(ev.piece?.id)?.charId !== 'char_290_vigna') return;
      const key = `sarkaz:vigna:promotion:${ev.piece.uid}`;
      if (ctx.counter(key)) return;
      ctx.setCounter(key, 1);
      ctx.addLayers(BOND, 4, { requireActive: false });
    },
  });
}
