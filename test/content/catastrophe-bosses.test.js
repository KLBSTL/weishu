import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemies from '../../server/sim/content/enemies.js';
import * as bosses from '../../server/sim/content/bosses.js';
import { CAT } from '../../server/sim/content/catastrophe.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function arena({ hp = 1e8, tpl = 'act1autochess_h08_03_s', ...opts } = {}) {
  const sharedBoss = { hp, maxHp: hp, damage(pid, n) { this.hp = Math.max(0, this.hp - n); } };
  const chess = Object.fromEntries([0, 1, 2, 3].map(i => [`probe${i}`, chessRec({ id: `probe${i}`,
    stats: { maxHp: 1e9, atk: 100, def: 0, res: 0, blockCnt: 3 }, skill: null, rangeGrid: [[0, 0], [0, 1]] })]));
  const kits = Object.fromEntries(Object.keys(chess).map(id => [id, () => ({ trait: { noAttack: true } })]));
  const h = makeBattle({ modeId: 'mode_single_catastrophe', round: 15, kind: 'hidden', content: 'generic',
    extraContent: [enemies, bosses], autoFinish: false, timeLimit: 500, sharedBoss, defs: { chess }, kits,
    units: Object.keys(chess).map((id, i) => ({ chessId: id, row: 10, col: 3 + i })),
    setup(b) { b.opts.templateId = tpl; }, ...opts }).step();
  return h;
}
const put = (h, key, { pos = [3, 10], tag = null } = {}) => h.spawn(key, { pos, tag, mods: { speedMul: 0 } });
function quiet(e) { e.profile.noAttack = true; for (const a of e.mem.ab.list) if (a.fire) a.left = 1e6; }
function duet(h) {
  const pipe = put(h, CAT.pipe, { tag: 'boss' }), string = put(h, CAT.string, { pos: [3, 11] });
  quiet(pipe); quiet(string);
  return { pipe, string, st: pipe.mem.catastropheConcord };
}
function arm(h, st) { st.sp = 30; h.step(); assert.equal(st.charging, true); }

test('钢铁洪流: starts at 0; shielded hits and HP loss give no SP, 50 independent HP hits trigger a 1 s exclusive cast', () => {
  const h = arena({ tpl: 'act1autochess_h08_01_s' }), e = put(h, CAT.helm, { tag: 'boss' }), src = h.unit('probe0');
  quiet(e);
  const st = e.mem.catastropheSteel;
  assert.equal(st.sp, 0);
  h.b.addBuff(e, { key: 'other', shield: 100 });
  h.b.dealDamage(src, e, { type: 'true', amount: 1 });
  h.b.loseHp(e, 1, { source: src });
  assert.equal(st.sp, 0);
  h.b.removeBuff(e, 'other');
  for (let i = 0; i < 50; i++) h.b.dealDamage(src, e, { type: 'true', amount: 1 });
  assert.equal(st.sp, 50);
  h.step();
  assert.equal(st.charging, true); assert.equal(e.s.flags.disarm, true);
  h.b.dealDamage(src, e, { type: 'true', amount: 1 });
  assert.equal(st.sp, 0);
  h.run(.8); assert.equal(h.enemies().some(u => u.defId === CAT.armour), false);
  h.run(.3); assert.equal(st.charging, false);
  assert.equal(h.enemies().filter(u => u.defId === CAT.armour).length, 1);
  assert.equal(h.b.errors.length, 0);
});

test('钢铁洪流: pair routes, independent shield cap, armour status immunity and kill-only once-per-armour recoil', () => {
  const h = arena({ hp: 1e6, tpl: 'act1autochess_h08_01', players: [{ playerId: 'p1' }, { playerId: 'p2' }] });
  const e = put(h, CAT.helm, { tag: 'boss' }); quiet(e);
  h.b.addBuff(e, { key: 'other', shield: 77777 });
  const reinforcement = put(h, 'enemy_1422_lrsldr', { pos: [3, 12] }); quiet(reinforcement);
  const st = e.mem.catastropheSteel;
  for (const sp of [50, 100, 150, 150]) {
    const previous = new Map(h.enemies().map(u => [u, u.findBuff(CAT.shieldKey)?.shield ?? 0]));
    st.sp = sp; h.step(); h.run(1.1);
    for (const u of h.enemies()) near(u.findBuff(CAT.shieldKey).shield,
      Math.min(e.s.maxHp * .04, (previous.get(u) ?? 0) + e.s.maxHp * (sp === 150 ? .02 : .01)));
    if (sp === 50) {
      h.b.dealDamage(null, reinforcement, { type: 'true', amount: 2500 });
      near(reinforcement.findBuff(CAT.shieldKey).shield, 7500);
    }
    h.run(5);
  }
  const army = h.enemies().filter(u => u.defId === CAT.armour);
  assert.equal(army.length, 14);
  assert.equal(new Set(army.map(u => u.route.legs.at(-1).c)).size, 2);
  near(e.findBuff(CAT.shieldKey).shield, 40000);
  near(e.findBuff('other').shield, 77777);
  const a = army[0];
  for (const status of ['stun', 'freeze', 'sleep', 'bind', 'silence', 'fear', 'levitate']) {
    assert.equal(h.b.applyStatus(a, status, { duration: 3, source: h.unit('probe0'), force: true }), false, status);
  }
  assert.equal(h.b.applyStatus(a, 'cold', { duration: 3, source: h.unit('probe0') }), true);
  assert.equal(h.b.applyStatus(a, 'cold', { duration: 3, source: h.unit('probe0') }), true);
  assert.equal(!!a.s.flags.freeze, false);
  assert.equal(h.b.push(a, 5, { dir: [1, 0] }), 0);
  const atk = a.s.atk; h.b.addBuff(a, { key: 'debuff', mods: { atkPct: -.2 } }); near(a.s.atk, atk * .8);
  assert.ok(h.b.dealDamage(h.unit('probe0'), a, { type: 'element', element: 'apoptosis', amount: 100 }) > 0);
  // A scripted leak is not a kill. Each armour death is counted only once.
  const before = h.b.sharedBoss.hp;
  h.b._remove(army[1], 'leak'); near(h.b.sharedBoss.hp, before);
  h.b.kill(a); h.run(1.1); h.b.kill(a);
  near(before - h.b.sharedBoss.hp, e.s.maxHp * .01);
  h.b.kill(a); near(before - h.b.sharedBoss.hp, e.s.maxHp * .01);
  assert.equal(h.b.errors.length, 0);
});

test('skill priority: Steel waits for ready original skills; Concord prevents ready original skills', () => {
  const h = arena({ tpl: 'act1autochess_h08_01_s' }), helm = put(h, CAT.helm, { tag: 'boss' }); quiet(helm);
  const original = helm.mem.ab.list.find(a => a.fire);
  let casts = 0;
  original.left = 0; original.cond = () => true; original.fire = () => casts++;
  helm.mem.catastropheSteel.sp = 50;
  h.step(); assert.equal(casts, 1); assert.equal(helm.mem.catastropheSteel.charging, false);
  h.step(); assert.equal(helm.mem.catastropheSteel.charging, true);
  original.left = 0; h.run(.8); assert.equal(casts, 1);
  const d = arena(), { pipe, string, st } = duet(d);
  let other = 0;
  for (const u of [pipe, string]) for (const a of u.mem.ab.list) if (a.fire) {
    a.left = 0; a.cond = () => true; a.fire = () => other++;
  }
  arm(d, st); d.run(7);
  assert.equal(other, 0);
  assert.deepEqual(h.b.errors, []); assert.deepEqual(d.b.errors, []);
});

test('new skills respect the original unbalanced action gate and keep full SP while waiting', () => {
  const h = arena({ tpl: 'act1autochess_h08_01_s' }), helm = put(h, CAT.helm, { tag: 'boss' }); quiet(helm);
  helm.unbalanceUntil = h.b.time + 1;
  helm.mem.catastropheSteel.sp = 50;
  h.step(); assert.equal(helm.mem.catastropheSteel.charging, false); near(helm.mem.catastropheSteel.sp, 50);
  h.run(1.1); assert.equal(helm.mem.catastropheSteel.charging, true);
  const d = arena(), { string, st } = duet(d);
  string.unbalanceUntil = d.b.time + 1; st.sp = 30;
  d.step(); assert.equal(st.charging, false); near(st.sp, 30);
  d.run(1.1); assert.equal(st.charging, true);
});

test('天灾胄 low HP replaces the old guard for physical/Arts/true/elemental HP damage but leaves HP loss alone', () => {
  const h = arena(), e = put(h, CAT.helm, { tag: 'boss' }); quiet(e);
  h.b.sharedBoss.hp = h.b.sharedBoss.maxHp * .19; h.run(.3);
  for (const [type, expected] of [['phys', 880], ['arts', 700], ['true', 2000], ['elemental', 2000]]) {
    near(h.b.dealDamage(null, e, { type, amount: 10000 }), expected);
  }
  const hp = e.hp; h.b.loseHp(e, 10000); near(hp - e.hp, 10000);
});

function gunArena() {
  const h = arena(), gun = put(h, CAT.gun, { tag: 'boss' }); quiet(gun);
  const springs = ['enemy_9018_actrpa', 'enemy_9019_actrpb', 'enemy_9020_actrpc'].map((key, i) => {
    const u = put(h, key, { pos: [1 + i, 14] }); quiet(u); return u;
  });
  return { h, gun, springs, src: h.unit('probe0') };
}

test('代赎之罚: actual shield state gates all three independent punishments, even when the gun barrier absorbs the hit', () => {
  const { h, gun, src } = gunArena();
  near(gun.s.taunt, -1);
  h.b.addBuff(gun, { key: 'barrier', shield: 1e6 });
  h.b.addBuff(src, { key: 'fast', mods: { aspd: 1000 } }); near(src.s.aspd, 600);
  const hp = gun.hp;
  h.b.dealDamage(src, gun, { type: 'true', amount: 10 });
  near(gun.hp, hp); near(src.elem.erosion, 100); near(src.s.aspd, 300);
  const start = src.hp;
  h.run(.5); h.b.dealDamage(src, gun, { type: 'true', amount: 10 });
  h.run(.6); near(start - src.hp, 100); // refresh must preserve the DoT tick, not restart it forever
  h.b.dealDamage(src, gun, { type: 'true', amount: 10 }); near(src.s.aspd, 300);
  assert.equal(src.buffs.filter(b => b.key === 'catastrophe:penanceDot').length, 1);
  assert.equal(src.buffs.filter(b => b.key === 'catastrophe:penanceSlow').length, 1);
  const expiry = h.b.time + 10;
  h.run(10.1); assert.ok(h.b.time > expiry); near(src.s.aspd, 600);
  assert.equal(h.b.errors.length, 0);
});

test('代赎之罚: live springs with broken shields cause 2000 extra HP loss; transmitted HP loss never retriggers it', () => {
  const { h, gun, springs, src } = gunArena();
  for (const sp of springs) sp.mem.ab.springShield.up = false;
  h.b.addBuff(gun, { key: 'barrier', shield: 1e6 });
  const hp = gun.hp;
  h.b.dealDamage(src, gun, { type: 'true', amount: 10 }); near(hp - gun.hp, 2000);
  near(src.elem.erosion, 0); assert.equal(src.findBuff('catastrophe:penanceDot'), null);
  h.b.loseHp(gun, 10, { source: src }); near(hp - gun.hp, 2010);
  assert.ok(springs.every(u => u.alive));
});

test('代赎之罚 damage carries the standard counter tag, preventing ally reflection loops', () => {
  const { h, gun, src } = gunArena(); let reflected = 0;
  h.b.on('damaged', c => {
    if (c.target === src && c.type !== 'element' && !c.dmg.tags.includes('counter')) reflected++;
  });
  h.b.dealDamage(src, gun, { type: 'true', amount: 10 }); h.run(2.1);
  assert.equal(reflected, 0); assert.equal(h.b.errors.length, 0);
});

test('管弦合鸣: zero initial SP, one per ordinary attack, +3 only for a boss-caused form change', () => {
  const h = arena(), { pipe, string, st } = duet(h);
  assert.equal(st.sp, 0);
  const echo = put(h, CAT.echo, { pos: [1, 16] });
  echo.mem.ab.strikes = 9;
  h.step(); near(st.sp, 5); // pipe: 1 + form change 3; string: 1
  st.sp = 0;
  echo.mem.ab.strikes = 9;
  h.b.dealDamage(h.unit('probe0'), echo, { type: 'true', amount: 1 }); near(st.sp, 0);
  bosses.setEchoForm(h.b, echo, 'gold');
  string.mem.ab.list.find(a => a.fire).left = 0;
  h.step(); near(st.sp, 3);
  assert.equal(pipe.mem.catastropheConcord, string.mem.catastropheConcord);
});

test('管弦和鸣: an echo death during performance cancels remaining ticks and removes exactly 5% despite guard/barrier/hit limit', () => {
  const h = arena(), { pipe, string, st } = duet(h), echo = put(h, CAT.echo, { pos: [1, 16] });
  arm(h, st); h.run(4);
  assert.equal(pipe.s.flags.disarm, true); assert.equal(string.s.flags.disarm, true); near(st.sp, 0);
  h.b.addBuff(pipe, { key: 'allGuard', shield: 1e9, mods: { dmgTakenMul: .01 } });
  const before = h.b.sharedBoss.hp;
  h.b.kill(echo, h.unit('probe0'));
  near(before - h.b.sharedBoss.hp, h.b.sharedBoss.maxHp * .05);
  near(pipe.findBuff('allGuard').shield, 1e9);
  assert.equal(st.charging, false); near(st.sp, 0);
  assert.equal(!!pipe.s.flags.disarm, false); assert.equal(!!string.s.flags.disarm, false);
  const gauge = h.unit('probe0').elem.apoptosis;
  h.run(7); near(h.unit('probe0').elem.apoptosis, gauge);
  const u = h.unit('probe0'); u.elem.apoptosis = 999;
  h.b.dealDamage(pipe, u, { type: 'element', element: 'apoptosis', amount: 1 });
  assert.ok(u.alive && u.findBuff('apoptosisBurst'), 'interruption also disables the synchronous expulsion monitor');
  assert.equal(h.b.errors.length, 0);
});

test('管弦和鸣: immediate old burst exit; 10 × 100 global ticks, no fatal/kill/death/redeploy; device exemption', () => {
  const h = arena(), { st } = duet(h);
  const [safe, seeded, bursting, hidden] = [0, 1, 2, 3].map(i => h.unit(`probe${i}`));
  seeded.elem.apoptosis = 900;
  h.b.addBuff(bursting, { key: 'apoptosisBurst', duration: 30, flags: { burstLock: true } });
  h.b.addBuff(hidden, { key: 'hidden', flags: { stealth: true, camou: true } }); hidden.elem.apoptosis = 900;
  const device = h.b.spawnDevice('test', 4, 6, { hp: 10000 });
  h.b.addBuff(device, { key: 'apoptosisBurst', duration: 30, flags: { burstLock: true } });
  let fatal = 0, killed = 0, deaths = 0;
  h.b.on('fatal', () => fatal++); h.b.on('kill', () => killed++); h.b.on('death', () => deaths++);
  const ticks = [];
  h.b.on('damaged', c => { if (c.target === safe && c.type === 'element') ticks.push([h.b.time, c.amount]); });
  arm(h, st); assert.equal(bursting.alive, false); assert.equal(seeded.alive, true);
  h.run(.8); near(safe.elem.apoptosis, 0);
  h.run(.3); near(safe.elem.apoptosis, 100); assert.equal(seeded.alive, false); assert.equal(hidden.alive, false);
  h.run(9); assert.equal(safe.alive, false);
  assert.equal(ticks.length, 10); assert.ok(ticks.every(t => t[1] === 100));
  ticks.slice(1).forEach((t, i) => near(t[0] - ticks[i][0], 1));
  for (const u of [seeded, bursting, hidden]) { assert.equal(u.alive, false); assert.equal(u.removed, true); assert.equal(u.respawnAt, Infinity); }
  assert.equal(device.alive, true); assert.deepEqual([fatal, killed, deaths], [0, 0, 0]);
  near(st.sp, 0); assert.equal(st.charging, false); assert.equal(h.b.errors.length, 0);
});

test('new hidden mechanics do not attach in ABYSS or the final assault', () => {
  for (const opts of [{ modeId: 'mode_single_abyss' }, { round: 14, kind: 'boss' }]) {
    const h = arena(opts), e = put(h, CAT.helm, { tag: 'boss' });
    assert.equal(e.mem.catastropheSteel, undefined);
    const pipe = put(h, CAT.pipe, { tag: 'boss' }); assert.equal(pipe.mem.catastropheConcord, undefined);
  }
});

test('钢铁洪流: killed preset/unreinforced/enhanced armour removes 1% through guard, barrier and the ordinary leader single-hit limit', () => {
  const h = arena({ tpl: 'act1autochess_h08_01_s' }), helm = put(h, CAT.helm, { tag: 'boss' }); quiet(helm);
  const old = put(h, CAT.armour, { pos: [5, 12] });
  const preset = put(h, CAT.armour, { pos: [5, 13] });
  h.b.sharedBoss.hp = h.b.sharedBoss.maxHp * .19; h.run(.3);
  h.b.addBuff(helm, { key: 'guard', shield: 1e9, mods: { dmgTakenMul: .01 } });
  const start = h.b.sharedBoss.hp; h.b.kill(preset);
  near(start - h.b.sharedBoss.hp, h.b.sharedBoss.maxHp * .01);
  helm.mem.catastropheSteel.sp = 50; h.step(); h.run(1.1);
  assert.equal(old.mem.catastropheArmourBoss, helm, 'existing reinforcements are enhanced too');
  const hp = h.b.sharedBoss.hp;
  h.b.kill(old);
  near(hp - h.b.sharedBoss.hp, h.b.sharedBoss.maxHp * .01);
  h.b.kill(old);
  near(hp - h.b.sharedBoss.hp, h.b.sharedBoss.maxHp * .01);
  near(helm.findBuff('guard').shield, 1e9);
});

test('管弦合鸣: real crab, wolf point and owned Manifold recover on their own timers without global death triggers', () => {
  const ids = ['chess_char_1_columbia_bstalk_b', 'chess_char_3_19_a', 'chess_char_6_11_a'];
  const h = arena({ content: 'full', units: ids.map((chessId, i) => ({ chessId, row: 10, col: 3 + i * 3 })) });
  const { st } = duet(h);
  const [crab, wolf, flow] = ids.map(id => h.unit(id).trait.reinforcement);
  assert.ok(crab && wolf && flow);
  h.b.on('damaged', c => { if (c.type === 'element' && ids.includes(c.target.defId)) c.target.elem.apoptosis = 0; });
  let deaths = 0, fatal = 0, kills = 0;
  h.b.on('death', () => deaths++); h.b.on('fatal', () => fatal++); h.b.on('kill', () => kills++);
  for (const u of [crab, wolf, flow]) u.elem.apoptosis = 900;
  arm(h, st); h.run(1.1);
  assert.ok(crab.alive && crab.s.flags.noBlock, 'crab enters its rest state');
  assert.ok(!wolf.alive && !wolf.removed, 'wolf point reserves its tile');
  assert.ok(!flow.alive, 'old Manifold exits');
  assert.deepEqual([deaths, fatal, kills], [0, 0, 0]);
  h.run(15.1); assert.ok(crab.alive && !crab.s.flags.noBlock);
  assert.equal(wolf.alive, false);
  h.run(10.1); assert.ok(wolf.alive);
  const replacement = h.b.allyUnits.find(u => u.alive && u.defId === flow.defId && u.ownerUnit === flow.ownerUnit);
  assert.ok(replacement && replacement !== flow, 'a new Manifold can be summoned');
  assert.deepEqual([deaths, fatal, kills], [0, 0, 0]);
  assert.deepEqual(h.b.errors, []);
});

for (const pair of [false, true]) for (const sp of [49, 50, 99, 100, 149, 150]) {
  test(`钢铁洪流 snapshot ${sp}, ${pair ? 'pair' : 'solo'}: storage, tier and completion cooldown`, () => {
    const h = arena({ tpl: pair ? 'act1autochess_h08_01' : 'act1autochess_h08_01_s',
      ...(pair ? { players: [{ playerId: 'p1' }, { playerId: 'p2' }] } : {}) });
    const helm = put(h, CAT.helm, { tag: 'boss' }); quiet(helm);
    const st = helm.mem.catastropheSteel; st.sp = sp; h.step();
    if (sp < 50) { assert.equal(st.charging, false); near(st.sp, sp); return; }
    assert.equal(st.snapshot, sp); near(st.sp, 0);
    h.b.dealDamage(null, helm, { type: 'true', amount: 1 }); near(st.sp, 0);
    h.run(.8); assert.equal(st.charging, true);
    h.run(.3); assert.equal(st.charging, false);
    const army = h.enemies().filter(e => e.defId === CAT.armour);
    assert.equal(army.length, (pair ? 2 : 1) * (sp >= 100 ? 2 : 1));
    if (pair) for (const col of [3, 17]) assert.equal(army.filter(e => e.route.legs.at(-1).c === col).length, sp >= 100 ? 2 : 1);
    near(helm.findBuff(CAT.shieldKey).shield, helm.s.maxHp * (sp === 150 ? .02 : .01));
    const readyAt = st.readyAt;
    assert.ok(readyAt > h.b.time + 4.8);
    h.b.removeBuff(helm, CAT.shieldKey);
    for (let i = 0; i < 200; i++) h.b.dealDamage(null, helm, { type: 'true', amount: 1 });
    near(st.sp, 150); h.run(4.8); assert.equal(st.casts, 1);
    h.run(.3); assert.equal(st.casts, 2); assert.ok(h.b.time >= readyAt);
    near(st.sp, 0);
    h.run(6.2); assert.equal(st.casts, 2); near(st.sp, 0);
    assert.deepEqual(h.b.errors, []);
  });
}

test('管弦和鸣: another attack causing a burst expels immediately between performance ticks', () => {
  const h = arena(), { pipe, st } = duet(h), u = h.unit('probe0');
  let deaths = 0; h.b.on('death', () => deaths++);
  arm(h, st); h.run(.4); u.elem.apoptosis = 999;
  h.b.dealDamage(pipe, u, { type: 'element', element: 'apoptosis', amount: 1 });
  assert.equal(u.alive, false); assert.equal(u.removed, true); assert.equal(deaths, 0);
  assert.ok(st.charging);
});

test('管 half HP: strict threshold, once only, permanent cost 20, free preserves stored SP at natural end', () => {
  const h = arena(), { pipe, st } = duet(h);
  st.sp = 17; h.b.sharedBoss.hp = h.b.sharedBoss.maxHp * .5; h.run(.1);
  assert.equal(st.halfTriggered, false);
  h.b.loseHp(pipe, 1); assert.equal(st.cost, 20); assert.equal(st.freeQueued, true);
  h.step(); assert.equal(st.free, true); near(st.sp, 17);
  near(pipe.s.dodgePhys, 0); near(pipe.s.dodgeArts, 0);
  h.run(10.1); assert.equal(st.charging, false); near(st.sp, 17); assert.equal(st.casts, 1);
  h.b.sharedBoss.hp = h.b.sharedBoss.maxHp; h.run(.1); h.b.loseHp(pipe, h.b.sharedBoss.maxHp * .6, { noHitLimit: true });
  h.step(); assert.equal(st.casts, 1); assert.equal(st.freeQueued, false);
  st.sp = 20; h.step(); assert.equal(st.free, false); near(st.sp, 0); assert.equal(st.casts, 2);
});

test('管 half HP during performance appends a separate free 10s; interruption keeps that queue', () => {
  for (const interrupt of [false, true]) {
    const h = arena(), { pipe, st } = duet(h), echo = put(h, CAT.echo, { pos: [1, 16] });
    arm(h, st); h.run(3);
    h.b.loseHp(pipe, pipe.hp - pipe.s.maxHp * .49, { noHitLimit: true }); h.step();
    assert.equal(st.cost, 20); assert.equal(st.freeQueued, true); assert.equal(st.casts, 1);
    if (interrupt) {
      const hp = pipe.hp; h.b.kill(echo); near(hp - pipe.hp, pipe.s.maxHp * .05);
      assert.equal(st.charging, false); assert.equal(st.freeQueued, true); near(st.sp, 0);
      h.step(); assert.equal(st.casts, 2); assert.equal(st.free, true);
    } else {
      h.run(6.8); assert.equal(st.casts, 1); h.run(.3);
      assert.equal(st.casts, 2); assert.equal(st.free, true); assert.equal(st.freeQueued, false);
    }
    const again = put(h, CAT.echo, { pos: [1, 16] }); st.sp = 13;
    const hp = pipe.hp; h.b.kill(again); near(hp - pipe.hp, pipe.s.maxHp * .05);
    near(st.sp, 0); assert.equal(st.freeQueued, false); assert.equal(st.cost, 20);
    h.run(10.1); assert.equal(st.charging, false); assert.deepEqual(h.b.errors, []);
  }
});

test('管 half HP free performance retains even SP surplus above its new 20 cost/cap', () => {
  const h = arena(), { pipe, string, st } = duet(h);
  h.b.loseHp(pipe, pipe.s.maxHp * .51, { noHitLimit: true }); st.sp = 30;
  h.step(); assert.equal(st.free, true); near(st.sp, 30);
  string.unbalanceUntil = h.b.time + 10.2; // hold the NEXT cast, without interrupting this running performance
  h.run(10.1); assert.equal(st.charging, false); near(st.sp, 30);
  h.run(.3); assert.equal(st.casts, 2); assert.equal(st.free, false); near(st.sp, 10);
});

test('管 half HP waits until the authored triple strike completes, without cancelling its last two hits', () => {
  const h = arena(), { pipe, st } = duet(h), echo = put(h, CAT.echo, { pos: [1, 16] });
  pipe.mem.ab.list[0].tick = () => {}; // isolate the three skill hits from ordinary attacks
  const skill = pipe.mem.ab.list.find(a => a.fire); skill.left = 0;
  h.step(); assert.ok(pipe.mem.catastropheOriginalUntil > h.b.time);
  h.b.loseHp(pipe, pipe.s.maxHp * .51, { noHitLimit: true }); st.sp = 13;
  h.run(.5); assert.equal(st.charging, false); assert.equal(st.freeQueued, true);
  h.run(.4); assert.equal(st.charging, true); assert.equal(st.free, true);
  assert.equal(echo.mem.ab.strikes, 3, 'all three authored hits finish before Concord');
  near(st.sp, 13); assert.deepEqual(h.b.errors, []);
});
