import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { skillSpecSource } from '../../server/sim/content/index.js';
import { COLUMBIA_ROSTER, RETAINED_CHARACTERS } from '../../tools/columbia-data.mjs';
const ds = getDefaultSource();
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const dummy = enemyRec({ key: 'dummy', hp: 1e8, atk: 0, def: 0, res: 0, speed: 0 });
function setup(L = 0, gs = {}, count = 6) {
  const chess = {}, units = [];
  for (let i = 0; i < 6; i++) {
    const id = `col_test_${i}`;
    chess[id] = { ...chessRec({ id, bonds: i < count ? ['columbiaShip'] : [], skill: null,
      stats: { maxHp: 4000, atk: 1000, def: 0 } }), garrisonIds: gs[i] ?? [] };
    units.push({ chessId: id, row: 10, col: i + 2 });
  }
  const h = makeBattle({ defs: { chess, enemies: { dummy } }, units, autoFinish: false,
    bonds: { columbiaShip: { count, active: count >= 3, tier: count >= 6 ? 2 : 1, layers: L },
      arcaneShip: { count: 2, active: true, tier: 1, layers: 0 } } });
  h.step(); const ops = units.map(u => h.unit(u.chessId));
  const e = h.spawn('dummy', { pos: [7, 9] });
  return { h, ops, e, hit: (tags = [], amount = 1, target = e) => {
    h.b.dealDamage(ops[0], target, { amount, type: 'arts', isAttack: true, canDodge: true, tags });
    if (!tags.length) h.b.emit('attack', { attacker: ops[0], targets: [target], isSkill: false });
  } };
}
test('Columbia has ten identities without Ifrit; 106 regular recruits; retained exceptions stay visible', () => {
  const visible = Object.values(ds.raw.chess).filter(c => !c.isGolden && c.visible);
  assert.equal(visible.length, 106);
  assert.equal(visible.filter(c => c.bonds.includes('columbiaShip')).length, 10);
  for (const c of visible.filter(c => c.bonds.some(b => ['egirShip', 'victoriaShip'].includes(b)))) assert.ok(RETAINED_CHARACTERS.includes(c.charId), c.name);
  for (const id of RETAINED_CHARACTERS) assert.ok(visible.some(c => c.charId === id), id);
  for (const [, charId, tier, , addon, skill] of COLUMBIA_ROSTER) {
    const c = visible.find(c => c.charId === charId);
    assert.equal(c.tier, tier); assert.deepEqual(c.bonds, ['columbiaShip', addon].filter(Boolean));
    assert.equal(ds.getChess(c.chessId).loadout.skillIndex, skill);
    for (const id of [c.chessId, c.goldenId]) for (const sk of ds.rawChess(id).skills) {
      assert.ok(['kit', 'skills'].includes(skillSpecSource(ds.getChess(id, { skillIndex: sk.index }))), `${id}/${sk.skillId}`);
    }
  }
});
test('Ifrit has Sarkaz/Farsight and 30/60 percent ATK and HP, no Columbia or damage multiplier', () => {
  for (const form of ['a', 'b']) {
    const id = `chess_char_4_sarkaz_ifrit_${form}`;
    assert.deepEqual(ds.rawChess(id).bonds, ['sarkazShip', 'visiShip']);
    const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4 }], defs: { enemies: { dummy } },
      bonds: { sarkazShip: { count: 6, tier: 2, active: true, layers: 0 },
        columbiaShip: { count: 6, tier: 2, active: true, layers: 0 } }, autoFinish: false });
    h.step(); const u = h.unit(id), e = h.spawn('dummy', { pos: [7, 9] });
    close(u.s.dmgDealtMul, 1); close(u.s.atk, u.base.atk * (form === 'a' ? 1.5 : 1.8));
    close(u.s.maxHp, u.base.maxHp * (form === 'a' ? 1.3 : 1.6));
    const shield = u.s.maxHp * .25;
    h.b.addBuff(u, { key: 'test:barrier', shield, duration: 20 });
    const hp = e.hp;
    h.b.dealDamage(u, e, { amount: 100, type: 'true', isAttack: true });
    close(hp - e.hp, 100 + shield * .3);
    close(e.elem.apoptosis ?? 0, 0);
    assert.deepEqual(h.b.errors, []);
  }
});

for (const form of ['a', 'b']) for (const [code, , tier, existing] of COLUMBIA_ROSTER) {
  const id = (existing ?? `chess_char_${tier}_columbia_${code}_a`).replace(/_a$/, `_${form}`);
  for (const sk of ds.rawChess(id).skills) test(`${id} ${sk.skillId}: real selected kit runs without errors`, () => {
    const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4, skillIndex: sk.index }],
      defs: { enemies: { dummy } }, autoFinish: false });
    h.step(); const u = h.unit(id);
    assert.equal(u.skill.id, sk.skillId);
    h.spawn('dummy', { pos: [10, 5] }); h.spawn('dummy', { pos: [11, 5] }); h.step();
    if (!u.skill.active && u.skill.kind !== 'passive') u.skill.activate('test', { free: true });
    h.run(35); assert.deepEqual(h.b.errors, []); checkInvariants(h.b);
  });
}
test('Columbia 3: ATK scale and six-person gate', () => {
  for (const n of [2, 3, 5, 6]) {
    const { h, ops, hit } = setup(100, {}, n);
    close(ops[0].s.atk, n >= 3 ? 1900 : 1000);
    const blasts = []; h.b.on('damaged', c => { if (c.dmg.tags?.includes('bond:columbia:burst')) blasts.push(c.amount); });
    hit(); h.step(); assert.equal(blasts.length, n === 6 ? 1 : 0);
  }
});

test('Columbia blast snapshots field ATK without Burn, ticks five times and shares cooldown across operators', () => {
  const { h, ops, e, hit } = setup(20);
  const seen = [];
  h.b.on('damaged', c => { if (c.dmg.tags?.some(t => t.startsWith('bond:columbia:'))) seen.push(c); });
  const total = ops.reduce((n, u) => n + u.s.atk, 0);
  hit(); h.step();
  close(seen.find(c => c.dmg.tags.includes('bond:columbia:burst')).amount, total * 2);
  assert.equal(e.elem.burn || 0, 0); assert.ok(!e.findBuff('burnBurst'));
  h.b.emit('attack', { attacker: ops[1], targets: [e] }); h.step();
  assert.equal(seen.filter(c => c.dmg.tags.includes('bond:columbia:burst')).length, 1);
  h.b.addBuff(ops[1], { key: 'snapshot-test', mods: { atkFlat: 10000 } });
  h.run(5.1);
  const ticks = seen.filter(c => c.dmg.tags.includes('bond:columbia:dot'));
  assert.equal(ticks.length, 5);
  for (const c of ticks) close(c.amount, total * .1);
  h.run(5); hit(); h.step();
  assert.equal(seen.filter(c => c.dmg.tags.includes('bond:columbia:burst')).length, 2);
  assert.deepEqual(h.b.errors, []);
});

test('Columbia radius 2.5 and cooldown floor 1s; own damage cannot recursively trigger', () => {
  const { h, e, hit } = setup(999);
  const far = h.spawn('dummy', { pos: [7, 12] });
  far.x = e.x; far.y = e.y + 4;
  h.b.addBuff(far, { key: 'test:stationary', flags: { stun: true }, duration: 20 });
  const targets = []; h.b.on('damaged', c => { if (c.dmg.tags?.includes('bond:columbia:burst')) targets.push(c.target); });
  h.step(); hit(['bond:columbia:dot']); h.step(); assert.equal(targets.length, 0);
  hit(); h.step(); assert.deepEqual(targets.map(u => u.id), [e.id]); assert.equal(far.hp, far.s.maxHp);
  h.run(.5); hit(); h.step(); assert.equal(targets.length, 1);
  h.run(.6); hit(); h.step(); assert.equal(targets.length, 2);
});

test('Columbia shared cooldown changes only at complete 100-layer boundaries', () => {
  for (const [layers, seconds] of [[0, 10], [99, 10], [100, 9], [899, 2], [900, 1], [999, 1]]) {
    const { h, ops, e, hit } = setup(layers);
    let blasts = 0;
    h.b.on('damaged', c => { if (c.dmg.tags?.includes('bond:columbia:burst')) blasts++; });
    hit(); h.step(); assert.equal(blasts, 1);
    h.run(seconds - .2);
    h.b.emit('attack', { attacker: ops[1], targets: [e] }); h.step();
    assert.equal(blasts, 1, `not ready at ${layers} layers`);
    h.run(.3); hit(); h.step();
    assert.equal(blasts, 2, `ready after ${seconds}s at ${layers} layers`);
  }
});

test('Hoolheyak reads combined stored Columbia/Arcane layers in complete groups of three', () => {
  for (const form of ['a', 'b']) {
    const { h, ops } = setup(7, { 0: [`garrison_columbia_heyak_${form}`] }, 2);
    close(ops[0].s.dmgDealtMul, form === 'b' ? 1.04 : 1.02);
    h.b.players[0].bonds.arcaneShip.layers = 5;
    h.b.emit('layerGain', { playerId: ops[0].ownerId, bondId: 'arcaneShip' }); h.step();
    close(ops[0].s.dmgDealtMul, form === 'b' ? 1.08 : 1.04);
  }
});

test('Columbia DoT follows struck enemies, refreshes one timer and snapshots the newest blast', () => {
  const { h, ops, e, hit } = setup(800);
  for (const u of ops) h.b.addBuff(u, { key: 'manual-attacks-only', flags: { disarm: true }, duration: 30 });
  const late = h.spawn('dummy', { pos: [7, 12] });
  late.x = e.x + 10; late.y = e.y;
  for (const enemy of [e, late]) h.b.addBuff(enemy, { key: 'freeze-test-position', flags: { stun: true }, duration: 30 });
  const damage = [], burns = [];
  h.b.on('damaged', c => { if (c.dmg.tags?.includes('bond:columbia:dot')) damage.push(c); });
  const deal = h.b.dealDamage.bind(h.b);
  h.b.dealDamage = (source, target, dmg) => {
    if (dmg.tags?.includes('bond:columbia:burn')) burns.push(dmg);
    return deal(source, target, dmg);
  };
  const x = e.x, y = e.y;
  hit(); h.step(); assert.equal(burns.length, 0);
  e.x = x + 7; late.x = x; late.y = y;
  h.run(2.1);
  assert.equal(damage.length, 2); assert.ok(damage.every(c => c.target === e));
  h.b.dealDamage(ops[0], late, { amount: 1e10, type: 'true' }); // Refresh only the original target.
  const old = damage[0].amount;
  h.b.addBuff(ops[1], { key: 'new-snapshot', mods: { atkFlat: 10000 } });
  const latest = ops.reduce((n, u) => n + u.s.atk, 0) * 800 * .005;
  hit(); h.step(); assert.equal(burns.length, 0);
  h.run(5.1);
  assert.equal(damage.length, 7, `old remaining ticks cancelled; five replacements: ${JSON.stringify(damage.map(c => [c.target.id, c.amount]))}`);
  for (const c of damage.slice(2)) { assert.equal(c.target, e); close(c.amount, latest); }
  assert.ok(latest > old);
  assert.equal(burns.length, 0, 'neither blast nor DoT applies Burn');
  h.run(1); assert.equal(damage.length, 7);
});

test('Columbia triggers only enemy attacks, not healing, summons or standalone damage', () => {
  const { h, ops, e } = setup();
  let blasts = 0;
  h.b.on('damaged', c => { if (c.dmg.tags?.includes('bond:columbia:burst')) blasts++; });
  h.b.dealDamage(ops[0], e, { amount: 5, type: 'arts', tags: ['dot'] });
  h.b.emit('attack', { attacker: ops[0], targets: [ops[1]] });
  h.b.emit('attack', { attacker: { kind: 'token', ownerId: ops[0].ownerId }, targets: [e] });
  h.step(); assert.equal(blasts, 0);
  h.b.emit('attack', { attacker: ops[0], targets: [e], isSkill: true });
  h.b.emit('attack', { attacker: ops[1], targets: [e] });
  h.step(); assert.equal(blasts, 1, 'all members share the same cooldown');
});

test('Beanstalk summons real crab, fatal becomes tactical point and recovers, S2 temporary crabs leave', () => {
  const id = 'chess_char_1_columbia_bstalk_b';
  const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4 }], defs: { enemies: { dummy } }, autoFinish: false });
  h.step(); const u = h.unit(id), crab = u.trait.reinforcement;
  assert.equal(crab?.defId, 'token_10014_bstalk_crab'); assert.ok(crab.s.atk > 0); assert.equal(crab.s.blockCnt, 1);
  const e = h.spawn('dummy'); e.x = crab.x; e.y = crab.y;
  assert.ok(h.b._checkBlock(e)); assert.equal(e.blockedBy, crab);
  h.b.dealDamage(null, crab, { amount: 1e8, type: 'true' });
  assert.ok(crab.alive && crab.s.flags.noBlock); assert.equal(e.blockedBy, null);
  assert.ok(!h.b._checkBlock(e)); h.run(15.1); close(crab.hp, crab.s.maxHp);
  assert.ok(!crab.s.flags.noBlock);
  e.x = crab.x; e.y = crab.y; assert.ok(h.b._checkBlock(e)); assert.equal(e.blockedBy, crab);
  u.skill.activate('test', { free: true });
  const temps = h.b.allyUnits.filter(t => t.mem.bstalkTemporary && t.alive); assert.ok(temps.length > 0);
  assert.ok(crab.s.def > crab.base.def); u.skill.end('test'); assert.ok(temps.every(t => !t.alive));
  assert.deepEqual(h.b.errors, []);
});

test('Contrail S2 selects two ground targets plus one flying; S1 starts on deployment', () => {
  const id = 'chess_char_2_columbia_ctrail_b';
  const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4 }], defs: { enemies: { dummy,
    flyer: enemyRec({ key: 'flyer', hp: 1e8, speed: 0, motion: 'FLY' }) } }, autoFinish: false });
  h.step(); const u = h.unit(id), groundDef = u.s.def;
  const ground = [0, 1, 2].map(() => h.spawn('dummy', { pos: [10, 5] }));
  const air = h.spawn('flyer', { pos: [10, 5], route: 2 });
  h.step(); // Refresh the spatial index as a real combat tick does.
  u.skill.activate('test', { free: true });
  assert.ok(u.s.flags.liftoff); assert.ok(u.s.def < groundDef);
  const ctx = { attacker: u, targets: ground };
  h.b.emit('beforeAttack', ctx); assert.deepEqual(ctx.targets.map(e => e.id), [ground[0], ground[1], air].map(e => e.id));
  const hp = air.hp; h.b.dealDamage(u, air, { amount: 100, type: 'true', isAttack: true });
  close(hp - air.hp, 112); assert.ok(air.findBuff('sluggish'));
  u.skill.end('test'); close(u.s.def, groundDef); assert.ok(!u.s.flags.liftoff);
  const s1 = makeBattle({ units: [{ chessId: id, row: 10, col: 4, skillIndex: 0 }] });
  s1.step(); assert.ok(s1.unit(id).skill.active && s1.unit(id).s.flags.liftoff);
});

test('Astesia S2 attacks two targets; Astgenne S2 starts two chains and talents ramp', () => {
  for (const [id, key, interval, speed] of [
    ['chess_char_3_columbia_astesi_b', 'astesi:aspd', 20, 5],
    ['chess_char_3_columbia_halo_b', 'halo:aspd', 15, 4],
  ]) {
    const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4 }], defs: { enemies: { dummy } }, autoFinish: false, captureNoisy: true });
    h.step(); const u = h.unit(id); h.run(interval);
    close(u.findBuff(key).mods.aspd, speed);
    u.skill.activate('test', { free: true });
    const es = [h.spawn('dummy', { pos: [10, 4] }), h.spawn('dummy', { pos: [10, 5] })];
    const seen = []; h.b.on('damaged', c => { if (c.source === u) seen.push(c.target.id); });
    h.run(3); assert.ok(es.every(e => seen.includes(e.id)));
    if (id.includes('astesi')) assert.equal(u.s.blockCnt, 2);
    else assert.ok(seen.length >= 4, 'two chains can each visit both enemies');
    assert.deepEqual(h.b.errors, []);
  }
});
