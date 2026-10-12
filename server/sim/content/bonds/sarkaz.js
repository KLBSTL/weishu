// Original expansion approved by the user; rules: docs/design/sarkaz.md.
// Numeric barriers are separate from hit-count shields. No timers or random choices.
import * as S from '../support/index.js';
import { numericShieldTotal, clampNumericShields } from '../../buffs.js';
import { hasHp } from '../../damage.js';
import { primaryHit } from './attack-riders.js';
import { typhonUsage } from '../../../../shared/typhonUsage.js';

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
        if (active() && member(u)) S.passiveBuff(battle, u, 'bond:sarkaz:attack', S.directMods({ atk: .20 + .007 * L() }));
        if (owns(u, 'wisdel')) S.passiveBuff(battle, u, 'garrison:sarkaz:wisdel', {
          dmgDealtMul: active() ? 1 + (elite(u, 'wisdel') ? .02 : .01) * L() : 1,
        });
      }
    };
    refresh();
    for (const u of ops) if (owns(u, 'ifrit')) {
      const n = elite(u, 'ifrit') ? .6 : .3;
      S.passiveBuff(battle, u, 'garrison:sarkaz:ifrit', S.directMods({ atk: n, hp: n }));
    }
    battle.on('layerGain', ({ playerId, bondId }) => {
      if (playerId === pid && bondId === BOND) battle.after(0, refresh);
    });

    const carriedUsage = typhonUsage(p.input?.contentInfo?.sarkazTyphonUsed);
    for (const u of ops) if (owns(u, 'typhon')) u.mem.sarkazTyphonUsed = carriedUsage[u.uid] ?? 0;
    battle.on('skillStart', ({ unit }) => {
      if (!member(unit) || !S.onField(unit) || !active() || !battle.flags.layerGainsEnabled) return;
      const holders = ops.filter(u => owns(u, 'typhon') && S.onField(u));
      for (const holder of holders) {
        if (holder.mem.sarkazTyphonUsed >= (elite(holder, 'typhon') ? 56 : 28)) continue;
        holder.mem.sarkazTyphonUsed += 2;
        gain(battle, holder, BOND, 2);
      }
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
  registry.garrison('SARKAZ_VIGNA', { onGain() {} }); // Price is stored on the chess record, including elite.
  registry.garrison('SARKAZ_MUDROK', {
    onGain(ctx) { ctx.addFunds(ctx.chessRecord(ctx.source.piece.id)?.isGolden ? 2 : 1, 'garrison'); },
  });
  registry.garrison('SARKAZ_METEO', {
    onGain(ctx) {
      const n = ctx.chessRecord(ctx.source.piece.id)?.isGolden ? 8 : 4;
      for (const bond of ctx.pieceBonds(ctx.source.piece.uid)) ctx.addLayers(bond, n, { requireActive: false });
    },
  });
  registry.garrison('SARKAZ_HBISC2', {
    run(ctx) {
      for (const bond of ctx.pieceBonds(ctx.source.piece.uid)) ctx.addLayers(bond, ctx.source.bb.count, { requireActive: false });
    },
  });
  registry.global('sarkaz_acquire', {
    onBattleStart(ctx, ev) {
      if (ev.input && ctx.counter('sarkaz:shining:round') === ctx.round) {
        (ev.input.contentInfo ??= {}).sarkazShiningUsed = true;
      }
      if (ev.input) {
        const used = {};
        for (const piece of ctx.board()) if (ctx.counter(`sarkaz:typhon:round:${piece.uid}`) === ctx.round) {
          const n = ctx.counter(`sarkaz:typhon:used:${piece.uid}`);
          if (n > 0) used[piece.uid] = n;
        }
        if (Object.keys(used).length) (ev.input.contentInfo ??= {}).sarkazTyphonUsed = used;
      }
    },
    onBattleResult(ctx, ev) {
      if (ev.result?.sarkazShiningUsed || ev.unite?.sarkazShiningUsed) ctx.setCounter('sarkaz:shining:round', ctx.round);
      for (const result of [ev.result, ev.unite]) for (const [uid, n] of Object.entries(typhonUsage(result?.sarkazTyphonUsed))) {
        if (!ctx.piece(Number(uid))) continue;
        const roundKey = `sarkaz:typhon:round:${uid}`, usedKey = `sarkaz:typhon:used:${uid}`;
        const before = ctx.counter(roundKey) === ctx.round ? ctx.counter(usedKey) : 0;
        ctx.setCounter(roundKey, ctx.round);
        ctx.setCounter(usedKey, Math.max(before, n));
      }
    },
  });
}
