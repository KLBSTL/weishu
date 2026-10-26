// Original expansion approved by the user; rules: docs/design/sarkaz.md.
// The six-member alliance owns a separate 0..3 physical/Arts hit shield.
import * as S from '../support/index.js';
import { COLS } from '../../constants.js';
import { hasHp } from '../../damage.js';
import { primaryHit } from './attack-riders.js';
import { typhonUsage } from '../../../../shared/typhonUsage.js';

export const BOND = 'sarkazShip';
export const SHIELD = 'bond:sarkaz:hits';
export const shieldLayers = (u) => Math.min(3, Math.max(0, u?.findBuff(SHIELD)?.shieldHits ?? 0));
export const hasBarrier = (u) => shieldLayers(u) > 0;
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
        if (owns(u, 'wisdel')) S.passiveBuff(battle, u, 'garrison:sarkaz:wisdel', {
          dmgDealtMul: active() ? 1 + (elite(u, 'wisdel') ? .02 : .01) * L() : 1,
        });
      }
    };
    refresh();
    if (active()) {
      battle.on('deploy', ({ unit, move }) => {
        if (move || !member(unit)) return;
        unit.mem.sarkazAttack = 0;
        battle.removeBuff(unit, 'bond:sarkaz:attack');
      });
      battle.on('skillStart', ({ unit }) => {
        if (!active() || !member(unit) || !S.onField(unit)) return;
        for (const u of S.bondMembers(battle, pid, BOND, { fieldOnly: true })) {
          u.mem.sarkazAttack = Math.min(.60 + .01 * L(), (u.mem.sarkazAttack ?? 0) + .15);
          S.passiveBuff(battle, u, 'bond:sarkaz:attack', S.directMods({ atk: u.mem.sarkazAttack }));
        }
      }, { priority: -150 });
    }
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
    battle.on('skillStart', ({ unit }) => {
      if (!member(unit) || !S.onField(unit)) return;
      refresh(); // earlier skill-start growth is already recorded; skill mods apply before skillStart.
      // Read the caster's current attack range AFTER the skill's own startup/range changes.
      battle._refreshRange(unit);
      const recipients = battle.allyUnits.filter(u => u.ownerId === pid && S.onField(u)
        && (u === unit || unit.rangeKeySet.has(u.tileR * COLS + u.tileC)));
      for (const u of recipients) {
        battle.addBuff(u, { key: SHIELD, shieldHits: Math.min(3, shieldLayers(u) + 1),
          duration: Infinity, shieldType: ['phys', 'arts'], visible: true });
        S.fxOn(battle, 'shield', u, unit.id, SHIELD);
      }
    }, { priority: -200 });
    const hits = new WeakMap();
    battle.on('hit', ({ source, target, dmg }) => {
      if (!member(source) || target?.side !== 'enemy' || !primaryHit(dmg)) return;
      hits.set(dmg, .10 * source.s.atk * shieldLayers(source));
    }, { priority: -1000 });
    battle.on('damaged', ({ source, target, dmg }) => {
      const amount = hits.get(dmg); hits.delete(dmg);
      if (!(amount > 0) || !source || !hasHp(target)) return;
      // Retain source multipliers; the bond tag (and absence of attack/skill flags) prevents recursive riders.
      battle.dealDamage(source, target, { amount, type: 'true', canDodge: false, tags: ['bond:sarkaz:rider'] });
    });
    battle.on('tick', ({ dt }) => {
      for (const u of ops) {
        if (S.onField(u) && member(u)) {
          u.stats.fieldSeconds = (u.stats.fieldSeconds ?? 0) + dt;
          if (hasBarrier(u)) u.stats.barrierSeconds = (u.stats.barrierSeconds ?? 0) + dt;
        }
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
