import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { SHIELD } from '../../server/sim/content/bonds/sarkaz.js';
import { compactResult, resultDigest } from '../../server/sim/spec.js';
import { unitStatsEntry } from '../../shared/protocol.js';
import { numericShieldTotal } from '../../server/sim/buffs.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `expected ${b}, got ${a}`);

test('confirmed local custom bonds survive data rebuild: Mudrock Sarkaz/Steadfast, Shining Sarkaz/Support', () => {
  const h = makeBattle({ autoFinish: false });
  for (const form of ['a', 'b']) {
    assert.deepEqual(h.b.data.rawChess(`chess_char_4_18_${form}`).bonds, ['sarkazShip', 'steadShip']);
    assert.deepEqual(h.b.data.rawChess(`chess_char_4_sarkaz_shining_${form}`).bonds, ['sarkazShip', 'deputShip']);
  }
});

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
      rangeGrid: Array.from({ length: 21 }, (_, i) => [0, i - 10]), skill: { duration: 100, spCost: 1000, initSp: 0 } }), garrisonIds: gs[i] ?? [] };
    units.push({ chessId: id, row: 10, col: 2 + i });
  }
  const h = makeBattle({ defs: { chess, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, speed: 0, def: 0, res: 0 }) } },
    units, bonds: { sarkazShip: bond(n, L), arcaneShip: { count: 2, active: true, tier: 1, layers: 0 } } });
  h.step(1);
  const ops = units.map((u) => h.unit(u.chessId));
  return { h, ops };
}

test('Sarkaz three hit shields: valid damage only, no numeric budget, deployment resets', () => {
  const {h,ops}=setup(6,600),u=ops[0];
  for(let i=0;i<44;i++){u.skill.end('test');u.skill.activate('test',{free:true});}
  close(u.s.atk,7600);close(u.findBuff(SHIELD).shieldHits,3);close(numericShieldTotal(u),0);
  const e=h.spawn('dummy',{pos:[7,9]}),hp=u.hp;
  h.b.dealDamage(e,u,{amount:100,type:'true'}); h.b.dealDamage(e,u,{amount:100,type:'elemental'});
  close(u.hp,hp-200);close(u.findBuff(SHIELD).shieldHits,3);
  for(const type of ['phys','arts','phys'])h.b.dealDamage(e,u,{amount:100,type,canDodge:false});
  close(u.hp,hp-200);assert.equal(u.findBuff(SHIELD),null);
  h.b.dealDamage(e,u,{amount:100,type:'phys',canDodge:false});close(u.hp,hp-300);
  h.b.emit('deploy',{unit:u,move:true});close(u.s.atk,7600);
  h.b.kill(u,{reason:'killed'});h.step();assert.equal(h.b._deploy(u),true);
  close(u.s.atk,1000);assert.equal(u.findBuff(SHIELD),null);close(ops[1].s.atk,7600);
  assert.deepEqual(h.b.errors,[]);
});

test('Sarkaz zero-layer cap and non-growth buffs still work with battle layer gains disabled', () => {
  const {h,ops}=setup(6,0),u=ops[0];h.b.flags.layerGainsEnabled=false;
  for(let i=0;i<5;i++){u.skill.end('test');u.skill.activate('test',{free:true});}
  close(u.s.atk,1600);assert.ok(u.findBuff(SHIELD).shieldHits>0);
  close(h.b.players[0].bonds.sarkazShip.layers,0);
});

test('Sarkaz three: no opening ATK, real casts add ATK without retroactive layer grants', () => {
  for (const n of [2, 3, 5]) {
    const { h, ops } = setup(n, 100);
    close(ops[0].s.atk, 1000);
    assert.equal(ops[0].findBuff(SHIELD), null);
    ops[0].skill.activate('test', { free: true });
    assert.equal(ops[0].findBuff(SHIELD), null);
    if (n >= 3) { h.b.addLayers('p1', 'sarkazShip', 50); h.step(2); close(ops[0].s.atk, 1150); }
    checkInvariants(h.b);
  }
});

test('Sarkaz hit shields share a three-layer cap, never clip numeric equipment shields or expire', () => {
  const {h,ops}=setup(7); const u=ops[1];
  assert.ok(ops.every(u=>!u.findBuff(SHIELD)));
  for(let i=0;i<4;i++){ops[i].skill.activate('test',{free:true});}
  for(const u of ops)close(u.findBuff(SHIELD).shieldHits,3);
  h.b.addBuff(u,{key:'other-shield',shield:3000});h.run(11);
  close(numericShieldTotal(u),3000);close(u.findBuff(SHIELD).shieldHits,3);checkInvariants(h.b);
});

test('Sarkaz: dead and undeployed units do not receive the alliance shield', () => {
  const {h,ops}=setup(6);h.b.kill(ops[5],{reason:'killed'});ops[0].skill.activate('test',{free:true});
  close(ops[0].findBuff(SHIELD).shieldHits,1);assert.equal(ops[5].findBuff(SHIELD),null);
});

test('Sarkaz: only its own hit shields contribute 10% current ATK per layer', () => {
  const {h,ops}=setup(6,100),u=ops[0],e=h.spawn('dummy',{pos:[7,9]});
  const hit=()=>{const hp=e.hp;h.b.dealDamage(u,e,{amount:1000,type:'true',isAttack:true});return hp-e.hp;};
  h.b.addBuff(u,{key:'other-count',shieldHits:3});h.b.addBuff(u,{key:'other-number',shield:9000});
  close(hit(),1000);
  for(const H of [1,2,3]){h.b.addBuff(u,{key:SHIELD,shieldHits:H,shieldType:['phys','arts']});close(hit(),1000+100*H);close(u.findBuff(SHIELD).shieldHits,H);}
});

test('Wisadel normal / elite reads only Sarkaz; Ifrit adds stats instead of damage scaling', () => {
  for (const form of ['a', 'b']) {
    const { h, ops } = setup(6, 100, { 0: [`garrison_sarkaz_wisdel_${form}`], 1: ['garrison_sarkaz_ifrit_a'] });
    close(ops[0].s.dmgDealtMul, form === 'a' ? 2 : 3);
    close(ops[1].s.dmgDealtMul, 1);
    close(ops[1].s.atk, 1300); close(ops[1].s.maxHp, 5200);
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
  const first = ops[2].findBuff(SHIELD).shieldHits;
  ops[1].skill.activate('test', { free: true });
  close(h.b.players[0].bonds.sarkazShip.layers, 32);
  close(ops[2].findBuff(SHIELD).shieldHits, first + 1);
});

test('Typhon and Hibiscus no longer grow on kills', () => {
  const { h, ops } = setup(6, 0, { 0: ['garrison_sarkaz_typhon_b'], 1: ['garrison_sarkaz_typhon_b'], 2: ['garrison_sarkaz_hbisc2_b'] });
  const e = h.spawn('dummy', { pos: [7, 9] });
  h.b.dealDamage(ops[2], e, { amount: 1e9, type: 'true' });
  close(h.b.players[0].bonds.sarkazShip.layers, 0);
  close(h.b.players[0].bonds.arcaneShip.layers, 0);
});

test('Sarkaz live statistics distinguish remaining hit layers from numeric shield amounts', () => {
  const {h,ops}=setup(6);ops[0].skill.activate('test',{free:true});
  const live=unitStatsEntry(ops[1],ops[1].s).combat;
  close(live.shield,0);close(live.sarkazShieldLayers,1);
  assert.equal(live.shieldGranted,undefined);assert.equal(live.shieldAbsorbed,undefined);
  const e=h.spawn('dummy',{pos:[7,9]});h.b.dealDamage(e,ops[1],{amount:50,type:'phys',canDodge:false});
  close(unitStatsEntry(ops[1],ops[1].s).combat.sarkazShieldLayers,0);
});

test('Shining spent marker is carried on the wire and affects the verification digest', () => {
  const { h, ops } = setup(6, 20, { 0: ['garrison_sarkaz_shining_a'] });
  const before = resultDigest(h.result()).hash;
  ops[0].skill.activate('test', { free: true });
  const result = compactResult(h.result());
  assert.equal(result.perPlayer.p1.sarkazShiningUsed, true);
  assert.notEqual(resultDigest(result).hash, before);
});

test('Sarkaz rider accepts source multipliers, accepts target vulnerability, and cannot recurse', () => {
  const { h, ops } = setup(6, 100, { 0: ['garrison_sarkaz_wisdel_b'] });
  const u = ops[0], e = h.spawn('dummy', { pos: [7, 9] });
  h.b.addBuff(u, { key: 'equipment-shield', shield: 1000 });
  h.b.addBuff(u, { key: SHIELD, shieldHits: 3, shieldType: ['phys', 'arts'] });
  h.b.addBuff(e, { key: 'vulnerable', mods: { dmgTakenMul: 1.5, trueTakenMul: 1.2 } });
  const hp = e.hp;
  h.b.dealDamage(u, e, { amount: 100, type: 'true', isAttack: true, mul: 4 });
  close(hp - e.hp, 100 * 3 * 4 * 1.5 * 1.2 + 300 * 3 * 1.5 * 1.2);
  close(numericShieldTotal(u), 1000);
  for (const tag of ['dot', 'aftershock', 'aphris:relay', 'bond:columbia:rider']) {
    const before = e.hp;
    h.b.dealDamage(u, e, { amount: 100, type: 'true', isSkill: true, tags: [tag] });
    close(before - e.hp, 100 * 3 * 1.5 * 1.2);
  }
  h.b.addBuff(u, { key: 'hp-loss', mods: { hpPct: -.75 } });
  close(numericShieldTotal(u), 1000, 1e-6, 'other sources are not clipped by the Sarkaz cap');
});

test('Typhon independent 28/56 budgets survive redeployment, including mixed qualities', () => {
  for (const [a, b, capA, capB] of [['a', 'a', 28, 28], ['a', 'b', 28, 56], ['b', 'b', 56, 56]]) {
    const { h, ops } = setup(6, 0, { 0: [`garrison_sarkaz_typhon_${a}`], 1: [`garrison_sarkaz_typhon_${b}`] });
    const cast = () => { ops[2].skill.end('test'); ops[2].skill.activate('test', { free: true }); };
    cast(); close(h.b.players[0].bonds.sarkazShip.layers, 4);
    const r = compactResult(h.result());
    assert.deepEqual(r.perPlayer.p1.sarkazTyphonUsed, { [ops[0].uid]: 2, [ops[1].uid]: 2 });
    const copy = structuredClone(r); copy.perPlayer.p1.sarkazTyphonUsed[ops[0].uid] = 4;
    assert.notEqual(resultDigest(r).hash, resultDigest(copy).hash);
    h.b.kill(ops[0]); h.b.kill(ops[1]);
    cast(); close(h.b.players[0].bonds.sarkazShip.layers, 4);
    h.b.redeploy(ops[0], { free: true });
    for (let i = 0; i < 40; i++) cast();
    close(h.b.players[0].bonds.sarkazShip.layers, capA + 2);
    h.b.redeploy(ops[1], { free: true });
    for (let i = 0; i < 40; i++) cast();
    close(h.b.players[0].bonds.sarkazShip.layers, capA + capB);
    assert.deepEqual(compactResult(h.result()).perPlayer.p1.sarkazTyphonUsed, { [ops[0].uid]: capA, [ops[1].uid]: capB });
  }
});

test('Typhon per-piece carried usage prevents new allowances in the next sub-battle', () => {
  const h = makeBattle({ players: [{ playerId: 'p1', bonds: { sarkazShip: bond(3) },
    contentInfo: { sarkazTyphonUsed: { 101: 28, 102: 54 } }, units: [
      { uid: 101, chessId: 'chess_char_5_sarkaz_typhon_a', row: 10, col: 3 },
      { uid: 102, chessId: 'chess_char_5_sarkaz_typhon_b', row: 10, col: 4 },
    ] }], autoFinish: false });
  h.step();
  const u = h.b.allyUnits.find(u => u.uid === 101);
  h.b.emit('skillStart', { unit: u }); h.b.emit('skillStart', { unit: u });
  assert.equal(h.b.players[0].bonds.sarkazShip.layers, 2);
  assert.deepEqual(compactResult(h.result()).perPlayer.p1.sarkazTyphonUsed, { 101: 28, 102: 56 });
  assert.deepEqual(h.b.errors, []);
});
