// User-approved Columbia revision (2026-10-10); docs/design/columbia.md.
import * as S from '../support/index.js';
import { hasHp } from '../../damage.js';
export const BOND = 'columbiaShip';
export const BLAST_RADIUS = 2.5; // Same as op-wisdel.js S3_SPLASH.
export const IDENTITY_CARD = 'chess_item_1_04_e_a';
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
    const afflictions = new WeakMap(); // One refreshed DoT per player and enemy, independent of its position.
    battle.on('attack', ({ attacker: source, targets }) => {
      const target = targets?.find(t => t?.side === 'enemy');
      if (!member(source) || !S.onField(source) || !target || battle.time + 1e-9 < readyAt) return;
      const layers = L();
      readyAt = battle.time + Math.max(1, 10 - Math.floor(layers / 100));
      // Reserve a shared cooldown before extra damage; snapshot living, deployed operators only.
      const atk = ops.filter(u => member(u) && S.onField(u)).reduce((sum, u) => sum + u.s.atk, 0);
      const x = target.x, y = target.y;
      battle.after(0, () => {
        battle.fx('aoe', { x, y, radius: BLAST_RADIUS, id: source.id, skill: 'columbia:blast' });
        for (const e of battle.foesInRadius(x, y, BLAST_RADIUS, true)) {
          battle.dealDamage(source, e, { amount: atk * 2, type: 'arts', canDodge: false, tags: ['bond:columbia:burst'] });
          if (!hasHp(e)) continue;
          const mark = {};
          afflictions.set(e, mark);
          for (let second = 1; second <= 5; second++) battle.after(second, () => {
            if (afflictions.get(e) !== mark || !hasHp(e)) return;
            battle.dealDamage(source, e, { amount: atk * layers * .005, type: 'arts', canDodge: false,
              tags: ['dot', 'bond:columbia:dot'] });
            if (second === 5) afflictions.delete(e);
          });
        }
      });
    });
  }
}
export function registerMeta(registry) {
  const spendingTrait = secondaryBond => ({
    run(ctx) {
      const { count, columbia_count, funds_per_trigger, max_layers } = ctx.source.bb;
      const triggers = Math.floor(ctx.roundStats().spent / funds_per_trigger);
      const capped = n => Number.isFinite(max_layers) ? Math.min(n, max_layers) : n;
      ctx.addLayers(BOND, capped(triggers * (columbia_count ?? count)), { requireActive: true });
      ctx.addLayers(secondaryBond, capped(triggers * count), { requireActive: true });
    },
  });
  registry.garrison('COLUMBIA_F12YIN', spendingTrait('investShip'));
  registry.garrison('COLUMBIA_BSTALK', {
    onGain(ctx) { ctx.addLayers(BOND, ctx.chessRecord(ctx.source.piece.id)?.isGolden ? 4 : 2, { requireActive: false }); },
  });
  registry.garrison('COLUMBIA_TINMAN', {
    onGain(ctx) {
      const count = ctx.chessRecord(ctx.source.piece.id)?.isGolden ? 2 : 1;
      for (let i = 0; i < count; i++) ctx.grantItem(IDENTITY_CARD);
    },
  });
  registry.garrison('COLUMBIA_SILENT', {
    run(ctx) { for (const id of [BOND, 'visiShip']) ctx.addLayers(id, 2 * ctx.source.bb.count, { requireActive: true }); },
  });
  registry.garrison('COLUMBIA_ASTESI', spendingTrait('arcaneShip'));
  registry.garrison('COLUMBIA_APHRIS', {
    run(ctx) {
      if (!ctx.bondActive(BOND) || !ctx.bondActive('preciShip')) return;
      const { count, funds_per_trigger } = ctx.source.bb;
      const triggers = Math.floor(ctx.funds() / funds_per_trigger);
      if (triggers <= 0 || !ctx.spendFunds(triggers)) return;
      const n = triggers * count;
      for (const id of [BOND, 'preciShip']) ctx.addLayers(id, n, { requireActive: true });
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
      for (let n = Math.floor(before / 25); n < Math.floor(after / 25); n++) ctx.grantItem(IDENTITY_CARD);
    },
  });
}
