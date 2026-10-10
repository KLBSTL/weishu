import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { SHIELD } from '../../server/sim/content/bonds/sarkaz.js';
import { compactResult, resultDigest } from '../../server/sim/spec.js';
import { unitStatsEntry } from '../../shared/protocol.js';
import { numericShieldTotal } from '../../server/sim/buffs.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `expected ${b}, got ${a}`);

test('Sarkaz roster interaction regression: Echo retaliation cannot recurse through Mlynar reflection', () => {
  const h = makeBattle({ units: [{ chessId: 'chess_char_5_19_b', row: 10, col: 5 }], autoFinish: false });
  h.step();
  const u = h.unit('chess_char_5_19_b'), e = h.spawn('enemy_9023_acdums', { pos: [10, 6] });
  h.step();
  const hp = e.hp;
  h.b.dealDamage(u, e, { amount: 100, type: 'true' });
  close(e.hp, hp - 1);
  assert.ok(u.stats.taken > 0);
  assert.deepEqual(h.b.errors, []);
});
const bond = (count, layers = 0) => ({ count, active: count >= 3, tier: count >= 6 ? 2 : count >= 3 ? 1 : 0, layers });
function setup(n = 6, L = 0, gs = {}) {
  const chess = {};
  const units = [];
  for (let i = 0; i < n; i++) {
    const id = `sarkaz_test_${i}_a`;
    chess[id] = { ...chessRec({ id, bonds: ['sarkazShip'], stats: { atk: 1000, maxHp: 4000, def: 0 },
      skill: { duration: 100, spCost: 1000, initSp: 0 } }), garrisonIds: gs[i] ?? [] };
    units.push({ chessId: id, row: 10, col: 2 + i });
  }
  const h = makeBattle({ defs: { chess, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 0, res: 0 }) } },
    units, bonds: { sarkazShip: bond(n, L), arcaneShip: { count: 2, active: true, tier: 1, layers: 0 } } });
  h.step(1);
  const ops = units.map((u) => h.unit(u.chessId));
  return { h, ops };
}

test('Sarkaz three: activation, raw layer scaling and live refresh', () => {
  for (const n of [2, 3, 5]) {
    const { h, ops } = setup(n, 100);
    close(ops[0].s.atk, n >= 3 ? 1800 : 1000);
    assert.equal(ops[0].findBuff(SHIELD), null);
    ops[0].skill.activate('test', { free: true });
    assert.equal(ops[0].findBuff(SHIELD), null);
    if (n >= 3) { h.b.addLayers('p1', 'sarkazShip', 50); h.step(2); close(ops[0].s.atk, 2100); }
    checkInvariants(h.b);
  }
});

test('Sarkaz barrier: all seven bodies contribute; every numeric shield shares the 50% cap', () => {
  const { h, ops } = setup(7);
  assert.ok(ops.every((u) => !u.findBuff(SHIELD)), 'no free opening shield');
  ops[0].skill.activate('test', { free: true });
  for (const u of ops) close(u.findBuff(SHIELD).shield, 252);
  h.b.addBuff(ops[1], { key: 'other-shield', shield: 3000 });
  for (let i = 0; i < 30; i++) { ops[0].skill.end('test'); ops[0].skill.activate('test', { free: true }); }
  close(ops[1].findBuff(SHIELD).shield, 252);
  close(ops[1].findBuff('other-shield').shield, 1748);
  h.run(11);
  close(numericShieldTotal(ops[1]), 2000);
  checkInvariants(h.b);
});

test('Sarkaz: dead and undeployed bodies excluded from attack sum', () => {
  const { h, ops } = setup(6);
  h.b.kill(ops[5], { reason: 'killed' });
  ops[0].skill.activate('test', { free: true });
  close(ops[0].findBuff(SHIELD).shield, 180);
  assert.equal(ops[5].findBuff(SHIELD), null);
});

test('Sarkaz: each primary hit adds 30% remaining shield; layers and hit-count shields add no rider', () => {
  for (const L of [0, 14, 15, 29, 30, 50, 100, 200]) {
    const { h, ops } = setup(6, L);
    const u = ops[0], e = h.spawn('dummy', { pos: [7, 9] });
    const hit = () => { const hp = e.hp; h.b.dealDamage(u, e, { amount: 1000, type: 'true', isAttack: true }); return hp - e.hp; };
    close(hit(), 1000);
    h.b.addBuff(u, { key: 'count-shield', shieldHits: 1 });
    close(hit(), 1000);
    h.b.removeBuff(u, 'count-shield');
    h.b.addBuff(u, { key: 'external', shield: 1 });
    close(hit(), 1000.3);
    h.b.dealDamage(e, u, { amount: 1, type: 'true', canDodge: false });
    close(hit(), 1000);
  }
});

test('Wisadel normal / elite reads only Sarkaz, and Ifrit stays fixed', () => {
  for (const form of ['a', 'b']) {
    const { h, ops } = setup(6, 100, { 0: [`garrison_sarkaz_wisdel_${form}`], 1: ['garrison_sarkaz_ifrit_a'] });
    close(ops[0].s.dmgDealtMul, form === 'a' ? 2 : 3);
    close(ops[1].s.dmgDealtMul, 1.30);
    h.b.addLayers('p1', 'arcaneShip', 200); h.step(2);
    close(ops[0].s.dmgDealtMul, form === 'a' ? 2 : 3);
    h.b.addLayers('p1', 'sarkazShip', 100); h.step(2);
    close(ops[0].s.dmgDealtMul, form === 'a' ? 3 : 5);
  }
});

test('Shining one reward per player per battle; subsequent casts still grant barrier', () => {
  const { h, ops } = setup(6, 20, { 0: ['garrison_sarkaz_shining_b'], 1: ['garrison_sarkaz_shining_a'] });
  ops[0].skill.activate('test', { free: true });
  close(h.b.players[0].bonds.sarkazShip.layers, 32);
  const first = ops[2].findBuff(SHIELD).shield;
  ops[1].skill.activate('test', { free: true });
  close(h.b.players[0].bonds.sarkazShip.layers, 32);
  close(ops[2].findBuff(SHIELD).shield, first * 2);
});

test('Typhon and Hibiscus no longer grow on kills', () => {
  const { h, ops } = setup(6, 0, { 0: ['garrison_sarkaz_typhon_b'], 1: ['garrison_sarkaz_typhon_b'], 2: ['garrison_sarkaz_hbisc2_b'] });
  const e = h.spawn('dummy', { pos: [7, 9] });
  h.b.dealDamage(ops[2], e, { amount: 1e9, type: 'true' });
  close(h.b.players[0].bonds.sarkazShip.layers, 0);
  close(h.b.players[0].bonds.arcaneShip.layers, 0);
});

test('Sarkaz statistics count actual barrier gain/absorption and survive result compaction', () => {
  const { h, ops } = setup(6);
  ops[0].skill.activate('test', { free: true });
  const e = h.spawn('dummy', { pos: [7, 9] });
  h.b.dealDamage(e, ops[1], { amount: 50, type: 'true', canDodge: false });
  h.step(3);
  const live = unitStatsEntry(ops[1], ops[1].s).combat;
  close(live.shield, 166);
  close(live.shieldGranted, 216);
  close(live.shieldAbsorbed, 50);
  assert.ok(live.fieldSeconds > 0 && live.barrierSeconds > 0);
  const stats = compactResult(h.result()).perPlayer.p1.unitStats.find((s) => s.uid === ops[1].uid);
  close(stats.shieldGranted, 216);
  close(stats.shieldAbsorbed, 50);
});

test('Shining spent marker is carried on the wire and affects the verification digest', () => {
  const { h, ops } = setup(6, 20, { 0: ['garrison_sarkaz_shining_a'] });
  const before = resultDigest(h.result()).hash;
  ops[0].skill.activate('test', { free: true });
  const result = compactResult(h.result());
  assert.equal(result.perPlayer.p1.sarkazShiningUsed, true);
  assert.notEqual(resultDigest(result).hash, before);
});

test('Sarkaz rider ignores source multipliers, accepts target vulnerability, and cannot recurse', () => {
  const { h, ops } = setup(6, 100, { 0: ['garrison_sarkaz_wisdel_b'] });
  const u = ops[0], e = h.spawn('dummy', { pos: [7, 9] });
  h.b.addBuff(u, { key: 'equipment-shield', shield: 1000 });
  h.b.addBuff(e, { key: 'vulnerable', mods: { dmgTakenMul: 1.5, trueTakenMul: 1.2 } });
  const hp = e.hp;
  h.b.dealDamage(u, e, { amount: 100, type: 'true', isAttack: true, mul: 4 });
  close(hp - e.hp, 100 * 3 * 4 * 1.5 * 1.2 + 300 * 1.5 * 1.2);
  close(numericShieldTotal(u), 1000);
  for (const tag of ['dot', 'aftershock', 'aphris:relay', 'bond:columbia:rider']) {
    const before = e.hp;
    h.b.dealDamage(u, e, { amount: 100, type: 'true', isSkill: true, tags: [tag] });
    close(before - e.hp, 100 * 3 * 1.5 * 1.2);
  }
  h.b.addBuff(u, { key: 'hp-loss', mods: { hpPct: -.75 } });
  close(numericShieldTotal(u), u.s.maxHp * .5);
});

test('Typhon shared 28/56 budget, only actual skill starts while an owner is on field', () => {
  for (const [form, cap] of [['a', 28], ['b', 56]]) {
    const { h, ops } = setup(6, 0, { 0: [`garrison_sarkaz_typhon_${form}`], 1: [`garrison_sarkaz_typhon_${form}`] });
    const cast = () => { ops[2].skill.end('test'); ops[2].skill.activate('test', { free: true }); };
    cast(); close(h.b.players[0].bonds.sarkazShip.layers, 2);
    const r = compactResult(h.result()); assert.equal(r.perPlayer.p1.sarkazTyphonUsed, 2);
    const copy = structuredClone(r); copy.perPlayer.p1.sarkazTyphonUsed = 4;
    assert.notEqual(resultDigest(r).hash, resultDigest(copy).hash);
    h.b.kill(ops[0], { reason: 'killed' }); h.b.kill(ops[1], { reason: 'killed' });
    cast(); close(h.b.players[0].bonds.sarkazShip.layers, 2);
    h.b.redeploy(ops[0], { free: true });
    for (let i = 0; i < 40; i++) cast();
    close(h.b.players[0].bonds.sarkazShip.layers, cap);
    assert.equal(compactResult(h.result()).perPlayer.p1.sarkazTyphonUsed, cap);
  }
});
