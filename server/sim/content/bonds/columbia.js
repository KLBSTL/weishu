// Columbia expansion: direct attacks build apoptosis; only pre-existing apoptosis bursts enable the HP rider.
import * as S from '../support/index.js';
import { hasHp } from '../../damage.js';
import { primaryHit } from './attack-riders.js';
export const BOND = 'columbiaShip';
const has = (u, code, form) => (u?.def?.raw?.garrisonIds ?? []).includes(`garrison_columbia_${code}_${form}`);
const elite = (u, code) => has(u, code, 'b');
const owns = (u, code) => has(u, code, 'a') || elite(u, code);
function gain(battle, u, bonds, n) {
  const added = S.gainLayers(battle, { playerId: u.ownerId, bonds, n, source: u, reason: 'garrison' });
  u.stats.layersGranted = (u.stats.layersGranted ?? 0) + added;
}
export function install(battle) {
  for (const p of battle.players) {
    const pid = p.playerId, ops = S.playerOps(battle, pid);
    const active = () => S.bondActive(battle, pid, BOND), L = () => S.bondLayers(battle, pid, BOND);
    const member = u => u?.kind === 'op' && u.ownerId === pid && S.isMember(battle, u, BOND);
    const refresh = () => {
      for (const u of ops) {
        if (active() && member(u)) S.passiveBuff(battle, u, 'bond:columbia:attack', S.directMods({ atk: .15 + .005 * L() }));
        if (owns(u, 'heyak')) S.passiveBuff(battle, u, 'garrison:columbia:heyak', {
          dmgDealtMul: active() ? 1 + (elite(u, 'heyak') ? .02 : .01) * L() : 1,
        });
      }
    };
    refresh();
    battle.on('layerGain', ({ playerId, bondId }) => {
      if (playerId === pid && bondId === BOND) battle.after(0, refresh);
    });
    const sharedKills = ops.some(u => elite(u, 'aphris'));
    battle.on('kill', ({ killer, victim }) => {
      if (!killer || killer.ownerId !== pid || killer.kind !== 'op' || victim?.side !== 'enemy') return;
      if (sharedKills || owns(killer, 'aphris')) gain(battle, killer, BOND, 2);
    });
    battle.on('hit', ({ source, target, dmg }) => {
      if (source?.ownerId === pid && owns(source, 'astesi') && source.blocking?.includes(target) && !dmg.sourceless) {
        dmg.mul *= elite(source, 'astesi') ? 1.40 : 1.25;
      }
    });
    if (!S.bondActive(battle, pid, BOND, 2)) continue;
    const hits = new WeakMap();
    battle.on('hit', ({ source, target, dmg }) => {
      if (!member(source) || target?.side !== 'enemy' || !primaryHit(dmg)) return;
      hits.set(dmg, { atk: source.s.atk, burst: (target.findBuff('apoptosisBurst')?.timeLeft ?? 0) > 0, layers: L() });
    }, { priority: -1000 });
    battle.on('damaged', ({ source, target, dmg }) => {
      const hit = hits.get(dmg); hits.delete(dmg);
      if (!hit || !source || !hasHp(target)) return;
      battle.dealDamage(source, target, { amount: hit.atk * .20, type: 'element', element: 'apoptosis',
        canDodge: false, tags: ['bond:columbia:buildup'] });
      if (hit.burst && hasHp(target)) battle.dealDamage(source, target, {
        amount: hit.atk * (1.10 + .003 * hit.layers), type: 'elemental', element: 'apoptosis',
        canDodge: false, tags: ['bond:columbia:rider'],
      });
    });
  }
}
export function registerMeta(registry) {
  registry.garrison('COLUMBIA_F12YIN', {
    run(ctx) {
      const n = ctx.roundStats().gainedChess | 0;
      ctx.addLayers('investShip', n * ctx.source.bb.multi, { requireActive: true });
      ctx.addLayers(BOND, n * ctx.source.bb.columbia_multi, { requireActive: true });
    },
  });
  registry.garrison('COLUMBIA_BSTALK', {
    onGain(ctx) {
      if (ctx.counter('columbia:bstalk:first')) return;
      ctx.setCounter('columbia:bstalk:first', 1);
      ctx.addLayers(BOND, 2, { requireActive: false });
    },
  });
  registry.garrison('COLUMBIA_CTRAIL', {
    onGain(ctx) { ctx.addLayers('skillfulShip', ctx.chessRecord(ctx.source.piece.id)?.isGolden ? 4 : 2, { requireActive: false }); },
  });
  registry.global('columbia_acquire', {
    onMerge(ctx, ev) {
      if (ev.kind !== 'chess' || ctx.chessRecord(ev.piece?.id)?.charId !== 'char_452_bstalk') return;
      const key = `columbia:bstalk:promotion:${ev.piece.uid}`;
      if (ctx.counter(key)) return;
      ctx.setCounter(key, 1); ctx.addLayers(BOND, 4, { requireActive: false });
    },
  });
}
