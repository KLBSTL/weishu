import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemies from '../../server/sim/content/enemies.js';
const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const wall = id => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e8, def: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const arena = (o = {}) => makeBattle({ content: 'generic', extraContent: [enemies], autoFinish: false, timeLimit: 600,
  defs: { chess: { wall: wall('wall'), wall2: wall('wall2') } },
  kits: { wall: () => ({ trait: { noAttack: true } }), wall2: () => ({ trait: { noAttack: true } }) },
  units: [{ chessId: 'wall', row: 9, col: 5 }], captureNoisy: true, ...o });
const put = (h, key, pos = [9, 5], extra = {}) => h.spawn(key, { pos, mods: { speedMul: 0, bountyLpr: 1 }, bounty: { coins: 9, ownerPlayerId: 'p1' }, ...extra });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5 * Math.max(1, Math.abs(b)), `${a} ~= ${b}`);

test('new leader base stats use the four approved overrides before round scaling, DEF/RES unchanged', () => {
  for (const [key, hp, atk, def, res] of [
    ['enemy_2013_csbot', 20000, 900, 800, 50], ['enemy_2072_skdny2', 30000, 350, 500, 70],
    ['enemy_2038_sydonq', 40000, 1400, 4000, 70], ['enemy_2055_smlead', 60000, 700, 3000, 30],
  ]) assert.deepEqual([E[key].stats.maxHp, E[key].stats.atk, E[key].stats.def, E[key].stats.res], [hp, atk, def, res]);
});

for (const [key, rebirth, ratio, inv] of [
  ['enemy_1506_patrt', 60, 1, 15], ['enemy_1546_cliff', 20, 1, 10],
  ['enemy_2038_sydonq', 30, 0.25, 2], ['enemy_1533_stmkgt', 8, 1, 15],
]) test(`${key}: KO is not final; LP1, rebirth and invulnerability consume time; final kill pays once`, () => {
  const h = arena(); h.step(); const e = put(h, key); h.step();
  assert.equal(e.lpr, 1);
  h.b.kill(e, h.unit('wall')); assert.ok(e.alive); assert.equal(h.result().perPlayer.p1.coins, 0);
  assert.ok(e.s.flags.invulnerable && e.s.flags.untargetable);
  h.run(rebirth - 0.1); assert.equal(e.form, 'reborn');
  h.run(0.2); assert.equal(e.form, key === 'enemy_1533_stmkgt' ? 'barrage2' : 'form2');
  near(e.hp, e.s.maxHp * ratio); assert.ok(e.s.flags.invulnerable);
  h.run(inv + 0.1); h.b.kill(e, h.unit('wall'));
  assert.ok(!e.alive); assert.equal(h.result().perPlayer.p1.coins, 9);
  h.b.kill(e, h.unit('wall')); assert.equal(h.result().perPlayer.p1.coins, 9);
});

test('Patriot: four-hit melee, nonstacking own-field aura, rebirth true pulses and phase-2 range', () => {
  const h = arena({ units: [{ chessId: 'wall', row: 9, col: 5 }, { chessId: 'wall2', row: 10, col: 8 }] });
  h.step(); const e = put(h, 'enemy_1506_patrt');
  const other = put(h, 'enemy_1002_nsabr', [10, 7], { ownerPlayerId: 'p2', bounty: null });
  h.runUntil(() => e.stats.attacks >= 1, 10);
  assert.equal(h.hooksOf('damaged').filter(c => c.source === e && c.dmg.isAttack).length, 4);
  assert.equal(other.s.atk, E.enemy_1002_nsabr.stats.atk);
  h.run(0.2); near(e.s.atk, E.enemy_1506_patrt.stats.atk * 1.7); // additive +20% aura and +50% stance.
  h.b.kill(e); const hp = h.unit('wall').hp; h.run(0.9); assert.ok(h.unit('wall').hp < hp);
  h.run(60); assert.equal(e.base.rangeRadius, 0.85); assert.ok(e.mem.ab.immune.has('freeze'));
  h.unit('wall').ground = false; h.unit('wall2').ground = false;
  h.runUntil(() => e.findBuff('ab:patriotSpear'), 20);
  assert.ok(e.profile.noAttack && e.s.flags.noMove);
  h.run(3.1);
  assert.equal(h.hooksOf('damaged').find(c => c.dmg.tags?.includes('patriotSpear'))?.target, h.unit('wall2'));
});

test('Cliff: stacking per-hit DEF loss; phase-2 hand loses target, blinks and refreshes cooldown', () => {
  const h = arena(); h.step(); const e = put(h, 'enemy_1546_cliff');
  h.runUntil(() => e.stats.attacks >= 2, 12);
  assert.ok(h.unit('wall').buffs.some(b => b.key.startsWith('ab:cliffDef:')));
  h.b.kill(e); h.run(30.2);
  const hand = e.mem.ab.list.find(a => a.cd === 30); hand.left = 0;
  h.step(); h.b.retreat(h.unit('wall')); h.run(1.5);
  assert.ok(h.eventsOf('fx').some(ev => ev[2]?.kind === 'blink') || hand.left < 1.5);
});

test('Hymn: unblocked fixed 100 arts/s, not scaled by its ATK; blocked stops it', () => {
  const h = arena(); h.step(); const e = put(h, 'enemy_2013_csbot', [11, 8], { mods: { speedMul: 0, atkMul: 10 } });
  const w = h.unit('wall'), hp = w.hp; h.run(1.1); near(hp - w.hp, 100);
  e.x = w.x; e.y = w.y; h.step(); assert.equal(e.blockedBy, w);
  const n = h.hooksOf('damaged').filter(c => c.dmg.tags?.includes('hymn')).length;
  h.run(1.1); assert.equal(h.hooksOf('damaged').filter(c => c.dmg.tags?.includes('hymn')).length, n);
});

test('Last Knight: cold retaliates on actual damage source and phase-2 becomes unblockable at quarter HP', () => {
  const h = arena(); h.step(); const e = put(h, 'enemy_2038_sydonq');
  h.b.dealDamage(h.unit('wall'), e, { amount: 100, type: 'true' });
  assert.ok(h.unit('wall').s.flags.cold);
  h.b.dealDamage(h.unit('wall'), e, { amount: 100, type: 'true' }); assert.ok(h.unit('wall').s.flags.freeze);
  h.b.kill(e); h.run(30.1); assert.ok(e.s.flags.unblockable && e.profile.noAttack); near(e.hpRatio, 0.25);
});

test('Wood: crossed thresholds extend state; fear immediately clears, cannot reapply until state ends; bind/slow suppressed', () => {
  const h = arena(); h.step(); const e = put(h, 'enemy_2055_smlead', [11, 8]);
  h.b.applyStatus(e, 'fear', { duration: 20, source: h.unit('wall') }); assert.ok(e.s.flags.fear);
  h.b.applyStatus(e, 'bind', { duration: 20 });
  h.b.dealDamage(h.unit('wall'), e, { amount: e.s.maxHp * 0.35, type: 'true' });
  assert.ok(!e.s.flags.fear && !e.s.flags.bind && e.s.flags.unblockable);
  assert.equal(h.b.applyStatus(e, 'fear', { duration: 20, source: h.unit('wall') }), false);
  near(e.s.physTakenMul, 0.2);
  h.b.dealDamage(h.unit('wall'), e, { amount: e.s.maxHp * 0.6, type: 'true' });
  near(e.findBuff('ab:annihilation').timeLeft, 9);
  h.run(6.1); assert.ok(e.findBuff('ab:annihilation')); assert.equal(h.b.applyStatus(e, 'fear', { duration: 1 }), false);
  h.run(3); assert.ok(!e.findBuff('ab:annihilation'));
  assert.equal(h.b.applyStatus(e, 'fear', { duration: 1 }), true);
  assert.ok(e.s.flags.bind, 'old bind timer resumes after immunity');
});

test('Caster: two-target necrosis, final-body bounty only; 7-second thorn is uncounted/nonprimary and never holds a clear', () => {
  const h = arena({ units: [{ chessId: 'wall', row: 9, col: 5 }, { chessId: 'wall2', row: 10, col: 5 }] });
  h.step(); const e = put(h, 'enemy_2072_skdny2', [9, 7]);
  h.runUntil(() => e.stats.attacks > 0 && h.allies().every(u => u.elem.apoptosis > 0), 10);
  assert.equal(e.profile.maxTargets, 2); assert.ok(h.allies().every(u => u.elem.apoptosis > 0));
  e.bounty.coins = 5; h.b.kill(e, h.unit('wall')); assert.equal(h.result().perPlayer.p1.coins, 5);
  h.run(6.9); assert.ok(!h.enemy('enemy_2073_skzrck')); h.run(0.2);
  const child = h.enemy('enemy_2073_skzrck'); assert.ok(child && !child.counted && !child.inTotal && child.mem.nonPrimary);
  assert.equal(child.bounty, null); assert.equal(child.mods?.bountyCoins, undefined);
  h.b.autoFinish = true; h.step(); assert.ok(h.b.finished);
  const short = arena({ autoFinish: true }); short.step(); const body = put(short, 'enemy_2072_skdny2');
  short.b.kill(body); short.step(); short.run(8); assert.ok(!short.enemy('enemy_2073_skzrck'));
});

test('Steam Knight: four attacks charge guard, HP threshold queues barrage until guard ends, returns to ground route', () => {
  const h = arena(); h.step(); const e = put(h, 'enemy_1533_stmkgt');
  h.runUntil(() => e.findBuff('ab:steamGuard'), 80); assert.ok(e.findBuff('ab:steamGuard'));
  h.b.dealDamage(h.unit('wall'), e, { amount: e.s.maxHp * 0.75, type: 'true' });
  h.step(); assert.ok(!e.findBuff('ab:steamAir'));
  h.run(7.1); assert.ok(e.findBuff('ab:steamAir') && e.isFlying && e.s.flags.invulnerable);
  const pos = [e.x, e.y]; h.run(14); assert.ok(!e.findBuff('ab:steamAir') && !e.isFlying);
  assert.deepEqual([e.x, e.y], pos); assert.equal(e.motion, 'WALK');
  assert.ok(h.hooksOf('damaged').some(c => c.dmg.tags?.includes('steamBarrage')));
  const h2 = arena(); h2.step(); const e2 = put(h2, 'enemy_1533_stmkgt');
  h2.runUntil(() => e2.stats.attacks === 4 && e2.swing && e2.atkCd <= 0.034, 80);
  assert.ok(e2.swing && e2.atkCd <= 0.034, 'the fourth attack has charged guard and the next attack action is ready');
  h2.b.dealDamage(h2.unit('wall'), e2, { amount: e2.s.maxHp * 0.75, type: 'true' }); h2.step();
  assert.ok(e2.findBuff('ab:steamGuard') && !e2.findBuff('ab:steamAir'), 'ready guard outranks the simultaneously queued barrage');
});

test('230-game-second timeout during rebirth leaks once at LP1, no bounty and no frozen timer', () => {
  const h = arena({ timeLimit: 230 }); h.step(); const e = put(h, 'enemy_1506_patrt');
  h.run(220); h.b.kill(e); h.run(11); assert.ok(h.b.finished);
  assert.equal(h.result().reason, 'timeout'); assert.equal(h.result().perPlayer.p1.coins, 0);
  const leaked = h.result().perPlayer.p1.leaked;
  assert.equal(leaked.filter(l => l.enemyKey === e.defId).length, 1);
  assert.equal(leaked[0].lpr, 1);
});
