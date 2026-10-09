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
  return { h, ops, e, hit: (tags = [], amount = 1, target = e) => h.b.dealDamage(ops[0], target,
    { amount, type: 'arts', isAttack: true, canDodge: true, tags }) };
}
test('Columbia has ten identities including shared Ifrit; 108 regular recruits; retained exceptions stay visible', () => {
  const visible = Object.values(ds.raw.chess).filter(c => !c.isGolden && c.visible);
  assert.equal(visible.length, 108);
  assert.equal(visible.filter(c => c.bonds.includes('columbiaShip')).length, 10);
  for (const c of visible.filter(c => c.bonds.some(b => ['egirShip', 'victoriaShip'].includes(b)))) assert.ok(RETAINED_CHARACTERS.includes(c.charId), c.name);
  for (const id of RETAINED_CHARACTERS) assert.ok(visible.some(c => c.charId === id), id);
  for (const [, charId, tier, , addon, skill] of COLUMBIA_ROSTER) {
    const c = visible.find(c => c.charId === charId);
    assert.equal(c.tier, tier); assert.deepEqual(c.bonds, ['columbiaShip', addon]);
    assert.equal(ds.getChess(c.chessId).loadout.skillIndex, skill);
    for (const id of [c.chessId, c.goldenId]) for (const sk of ds.rawChess(id).skills) {
      assert.ok(['kit', 'skills'].includes(skillSpecSource(ds.getChess(id, { skillIndex: sk.index }))), `${id}/${sk.skillId}`);
    }
  }
});
test('Ifrit keeps both covenants and Farsight; fixed damage bonus does not amplify shield true damage', () => {
  for (const form of ['a', 'b']) {
    const id = `chess_char_4_sarkaz_ifrit_${form}`;
    assert.deepEqual(ds.rawChess(id).bonds, ['sarkazShip', 'columbiaShip', 'visiShip']);
    const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4 }], defs: { enemies: { dummy } },
      bonds: { sarkazShip: { count: 6, tier: 2, active: true, layers: 0 },
        columbiaShip: { count: 6, tier: 2, active: true, layers: 0 } }, autoFinish: false });
    h.step(); const u = h.unit(id), e = h.spawn('dummy', { pos: [7, 9] });
    close(u.s.dmgDealtMul, 1.3); close(u.s.atk, u.base.atk * 1.35);
    const shield = u.s.maxHp * .25;
    h.b.addBuff(u, { key: 'test:barrier', shield, duration: 20 });
    const hp = e.hp;
    h.b.dealDamage(u, e, { amount: 100, type: 'true', isAttack: true });
    close(hp - e.hp, 130 + shield * .3);
    close(e.elem.apoptosis, u.s.atk * .2);
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
    const { ops, hit, e } = setup(100, {}, n);
    close(ops[0].s.atk, n >= 3 ? 1650 : 1000); hit();
    close(e.elem.apoptosis ?? 0, n === 6 ? 330 : 0);
  }
});
test('Columbia buildup is ATK-based; triggering hit gets no rider; later hits get one elemental rider', () => {
  const { h, ops, e, hit } = setup(100, { 0: ['garrison_columbia_heyak_b'] });
  e.s.res = 99; e.s.def = 99999;
  hit(); close(e.elem.apoptosis, 330);
  hit(); hit(); const before = e.hp; hit();
  assert.ok(e.findBuff('apoptosisBurst')); close(before - e.hp, .15); // arts minimum damage then source x3
  // Burst application recomputes enemy stats; use true damage to isolate the fixed elemental rider.
  const next = e.hp; h.b.dealDamage(ops[0], e, { amount: 1, type: 'true', isAttack: true });
  close(next - e.hp, 3 + 1650 * 1.4 * 3);
  assert.deepEqual(h.b.errors, []); assert.equal(ops[0].s.dmgDealtMul, 3);
});
test('Columbia only apoptosis burst, no recursive riders or dot/aftershock; dodge has no buildup', () => {
  const { h, e, hit } = setup();
  for (const tag of ['dot', 'aftershock', 'aphris:relay', 'bond:columbia:rider', 'bond:sarkaz:rider']) hit([tag]);
  close(e.elem.apoptosis ?? 0, 0);
  e.s.dodgeArts = 1; hit(); close(e.elem.apoptosis ?? 0, 0); e.s.dodgeArts = 0;
  h.b.addBuff(e, { key: 'burnBurst', flags: { burstLock: true }, duration: 10 });
  const hp = e.hp; hit(); close(hp - e.hp, 1);
});
test('Mew elite grants all own operators once; Astgenne no longer grants kill growth', () => {
  const { h, ops, e } = setup(0, { 0: ['garrison_columbia_aphris_b'], 1: ['garrison_columbia_aphris_b'],
    2: ['garrison_columbia_halo_b'] }, 3);
  h.b.dealDamage(ops[5], e, { amount: 1e9, type: 'true' }); close(h.b.players[0].bonds.columbiaShip.layers, 2);
  h.b.dealDamage(ops[2], h.spawn('dummy'), { amount: 1e9, type: 'true' });
  close(h.b.players[0].bonds.columbiaShip.layers, 4); close(h.b.players[0].bonds.arcaneShip.layers, 0);
});
test('Astesia garrison reads its own current blocking targets', () => {
  const { h, ops, e } = setup(0, { 0: ['garrison_columbia_astesi_b'] });
  ops[0].blocking = [e]; close(h.b.dealDamage(ops[0], e, { amount: 100, type: 'true' }), 140);
  ops[0].blocking = []; close(h.b.dealDamage(ops[0], e, { amount: 100, type: 'true' }), 100);
});
test('Beanstalk summons real crab, fatal becomes tactical point and recovers, S2 temporary crabs leave', () => {
  const id = 'chess_char_1_columbia_bstalk_b';
  const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4 }], autoFinish: false });
  h.step(); const u = h.unit(id), crab = u.trait.reinforcement;
  assert.equal(crab?.defId, 'token_10014_bstalk_crab'); assert.ok(crab.s.atk > 0);
  h.b.dealDamage(null, crab, { amount: 1e8, type: 'true' });
  assert.ok(crab.alive && crab.s.flags.noBlock); h.run(15.1); close(crab.hp, crab.s.maxHp);
  assert.ok(!crab.s.flags.noBlock);
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
