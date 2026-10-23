// User-approved Columbia revision (2026-10-10); docs/design/columbia.md.
import * as S from '../support/index.js';
import { hasHp } from '../../damage.js';
export const BOND = 'columbiaShip';
export const BLAST_RADIUS = 2.5; // Same as op-wisdel.js S3_SPLASH.
export const IDENTITY_CARD = 'chess_item_1_04_e_a';
export const PRESIDENT_DOLL = 'chess_item_4_columbia_doll_e_a';
const has = (u, code, form) => (u?.def?.raw?.garrisonIds ?? []).includes(`garrison_columbia_${code}_${form}`);
const elite = (u, code) => has(u, code, 'b');
const owns = (u, code) => has(u, code, 'a') || elite(u, code);
export function install(battle) {
  for (const p of battle.players) {
    const pid = p.playerId, ops = S.playerOps(battle, pid);
    const active = () => S.bondActive(battle, pid, BOND), L = () => S.bondLayers(battle, pid, BOND);
    const member = u => u?.kind === 'op' && u.ownerId === pid && S.isMember(battle, u, BOND);
    const refresh = () => {
      for (const u of ops) {
        if (active() && member(u)) S.passiveBuff(battle, u, 'bond:columbia:attack', S.directMods({ atk: .20 + .007 * L() }));
        if (owns(u, 'tinman')) {
          const gold = elite(u, 'tinman');
          S.passiveBuff(battle, u, 'garrison:columbia:tinman', S.directMods({ atk: gold ? .4 : .2, hp: gold ? .4 : .2 },
            { spRecoveryFlat: Math.floor(L() / 10) * (gold ? .1 : .05) }));
        }
        if (owns(u, 'heyak')) S.passiveBuff(battle, u, 'garrison:columbia:heyak', {
          dmgDealtMul: 1 + (elite(u, 'heyak') ? .02 : .01) * Math.floor((L() + S.bondLayers(battle, pid, 'arcaneShip')) / 3),
        });
      }
    };
    refresh();
    battle.on('layerGain', ({ playerId, bondId }) => {
      if (playerId === pid && [BOND, 'arcaneShip'].includes(bondId)) battle.after(0, refresh);
    });
    if (!S.bondActive(battle, pid, BOND, 2)) continue;
    let readyAt = 0;
    battle.on('damaged', ({ source, target, amount, type, dmg }) => {
      if (!member(source) || !S.onField(source) || target?.side !== 'enemy' || !(amount > 0) || type === 'element'
        || dmg?.tags?.some(tag => tag.startsWith('bond:columbia:')) || battle.time + 1e-9 < readyAt) return;
      const layers = L();
      readyAt = battle.time + Math.max(1, 8 - Math.floor(layers / 10) * .1);
      // Reserve a shared cooldown before extra damage; snapshot living, deployed operators only.
      const atk = ops.filter(u => member(u) && S.onField(u)).reduce((sum, u) => sum + u.s.atk, 0);
      const x = target.x, y = target.y;
      battle.after(0, () => {
        battle.fx('aoe', { x, y, radius: BLAST_RADIUS, id: source.id, skill: 'columbia:blast' });
        for (const e of battle.foesInRadius(x, y, BLAST_RADIUS, true)) {
          battle.dealDamage(source, e, { amount: atk * 2, type: 'arts', canDodge: false, tags: ['bond:columbia:burst'] });
        }
        battle.fx('aoe', { x, y, radius: BLAST_RADIUS, duration: 5, id: source.id, skill: 'columbia:burn' });
        // Each closure owns one snapshot and exactly five ticks, including coincident centres.
        const zone = { x, y, atk, source, ticks: 0 };
        const burn = () => {
          for (const e of battle.foesInRadius(zone.x, zone.y, BLAST_RADIUS)) {
            if (!hasHp(e)) continue;
            battle.dealDamage(zone.source, e, { amount: zone.atk * .3, type: 'arts', canDodge: false,
              tags: ['dot', 'bond:columbia:dot'] });
          }
          if (++zone.ticks < 5) battle.after(1, burn);
        };
        battle.after(1, burn);
      });
    });
  }
}
export function registerMeta(registry) {
  registry.band('band_ferdinand', {
    onRoundStart(ctx, ev) {
      const round = ev.round;
      if (!Number.isInteger(round) || round < 1 || ctx.counter('ferdinand:round') === round) return;
      ctx.setCounter('ferdinand:round', round);
      const p = ctx.gd.band('band_ferdinand').params;
      ctx.grantItem(round === 1 ? p.firstItem : p.nextItem);
    },
  });
  const spendingTrait = secondaryBond => ({
    run(ctx) {
      const { count, funds_per_trigger } = ctx.source.bb;
      const triggers = Math.floor(ctx.roundStats().spent / funds_per_trigger);
      ctx.addLayers(secondaryBond, triggers * count, { requireActive: true });
    },
  });
  registry.garrison('COLUMBIA_F12YIN', spendingTrait('investShip'));
  registry.garrison('COLUMBIA_F12YIN_START', {
    run(ctx) { ctx.addLayers(BOND, Math.floor(ctx.funds() / ctx.source.bb.funds_per_trigger) * ctx.source.bb.count, { requireActive: true }); },
  });
  registry.garrison('COLUMBIA_BSTALK', {
    onGain(ctx) { ctx.addLayers(BOND, ctx.chessRecord(ctx.source.piece.id)?.isGolden ? 4 : 2, { requireActive: false }); },
  });
  registry.garrison('COLUMBIA_SILENT', {
    run(ctx) {
      const { count, double_above_funds } = ctx.source.bb;
      const doubled = ctx.funds() > double_above_funds && ctx.spendFunds(1);
      for (const id of ['visiShip', BOND]) ctx.addLayers(id, count * (doubled ? 2 : 1), { requireActive: true });
    },
  });
  registry.garrison('COLUMBIA_ASTESI', {
    run(ctx) {
      const paid = Math.min(ctx.funds(), ctx.source.bb.max_cost);
      if (paid > 0 && ctx.spendFunds(paid)) {
        for (const id of [BOND, 'arcaneShip']) ctx.addLayers(id, paid * ctx.source.bb.count, { requireActive: true });
        ctx.addPendingFunds(paid);
      }
    },
  });
  registry.garrison('COLUMBIA_APHRIS', {
    run(ctx) {
      if (!ctx.bondActive(BOND)) return;
      const { count, funds_per_trigger, max_triggers } = ctx.source.bb;
      const triggers = Math.min(max_triggers ?? Infinity, Math.floor(ctx.funds() / funds_per_trigger));
      if (triggers <= 0 || !ctx.spendFunds(triggers)) return;
      const n = triggers * count;
      ctx.addLayers(BOND, n, { requireActive: true });
    },
  });
  registry.garrison('COLUMBIA_CTRAIL', {
    onGain(ctx) { ctx.addLayers('skillfulShip', ctx.chessRecord(ctx.source.piece.id)?.isGolden ? 4 : 2, { requireActive: false }); },
  });
  registry.global('columbia_identity_cards', {
    onLayers(ctx, ev) {
      if (ev.bondId !== BOND || !(ev.to > ev.from)) return;
      const before = ctx.counter('columbia:earnedLayers'), after = before + ev.to - ev.from;
      ctx.setCounter('columbia:earnedLayers', after);
      for (let n = Math.floor(before / 10); n < Math.floor(after / 10); n++) ctx.grantItem(PRESIDENT_DOLL);
    },
  });
}
