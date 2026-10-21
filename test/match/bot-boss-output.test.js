import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, legalTileFor, DATA } from './harness.js';
import { parseKey } from '../../server/match/board.js';
import { routeValue, bossArmor, bossLineupAlternative, createRehearsal, LayoutPlan } from '../../server/match/bot.js';
import { computeBonds } from '../../server/match/bondsMeta.js';
import { estimateCombat } from '../../server/match/botStrategy.js';
import { bountySpawns } from '../../server/match/waves.js';

const chess = name => Object.values(DATA.chess).find(c => c.name === name && !c.isGolden);
function setup(real = false, right = false) {
  const seats = Array.from({ length: right ? 2 : 1 }, (_, seat) => ({ seat, playerId: `ai_${seat}`, name: `AI${seat}`, isBot: true, connected: true }));
  const h = makeMatch({ mode: right ? 'coop' : 'solo', difficulty: 'ABYSS', seats, fake: !real, seed: 91 }).start().toPrep(1);
  const m = h.m, ps = m.order[right ? 1 : 0];
  for (const p of ps.allChess()) ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.layers = {}; ps.funds = 30;
  m.disabledBonds = []; m.bannedChess = []; m.round = m.gd.bossRound; m.bossId = 'boss_1';
  ps.lp = 100; ps.bandId = 'band_bldsk'; m.wave = null; m._planBossWaves(); ps.invalidateDeployMap(); ps.recompute();
  return { h, m, ps };
}
const snap = (m, ps) => JSON.stringify({ board: [...ps.board], hand: ps.hand, temp: ps.temp, layers: ps.layers, funds: ps.funds,
  uid: m.uidSeq, bots: m.rngBots.state(), meta: m.rngMeta.state(), shops: m.rngShop.state(), waves: m.rngWaves.state() });
const board = (m, ps, id) => give(m, ps, id, 'board', parseKey(legalTileFor(m, ps, id)));

test('boss damage retains a useful marginal value after ordinary kill probability saturates', () => {
  const route = { n: 10, hp: 40000 };
  assert.ok(routeValue(route, 2400000) - routeValue(route, 1200000) < 1e-6);
  assert.ok(routeValue({ ...route, boss: true }, 2400000) > routeValue({ ...route, boss: true }, 1200000) + 5);
  assert.equal(routeValue({ ...route, boss: true }, 0), 0);
});

test('public boss armor respects template overrides and legal multipliers, changing dealer comparison', () => {
  const { m, ps } = setup();
  const wave = { spawns: [{ tag: 'boss', enemyKey: 'enemy_9013_acstmk', mods: { defMul: .5, resMul: .75 } }],
    overrides: { enemy_9013_acstmk: { stats: { def: 2050, res: 40 } } } };
  m.bossGroupOf = () => ({ wave, side: 'L' });
  assert.deepEqual(bossArmor(m, ps), { def: 1025, res: 30 });
  const c = { ...chess('隐现'), stats: { ...chess('隐现').stats, atk: 1000, bat: 1 }, skill: { spCost: 999, initSp: 0 } };
  ps.bonds = {};
  assert.ok(estimateCombat(ps.gd, ps, { ...c, dmgType: 'arts' }, undefined, { boss: true, ...bossArmor(m, ps) }).dps
    > estimateCombat(ps.gd, ps, c, undefined, { boss: true, ...bossArmor(m, ps) }).dps);
  wave.spawns[0].mods = { defMul: NaN, resMul: -1 };
  assert.deepEqual(bossArmor(m, ps), { def: 2050, res: 40 }); m.dispose();
});

test('boss alternate keeps the activated high-layer core instead of dropping a low-tier member first', () => {
  const { m, ps } = setup();
  const core = [chess('星极').chessId, chess('豆苗').chessId, 'chess_char_2_19_a'].map(id => board(m, ps, id));
  const weak = board(m, ps, chess('隐现').chessId);
  const incoming = give(m, ps, chess('异客').chessId, 'hand');
  ps.layers.columbiaShip = 999; ps.bonds = computeBonds(ps.gd, ps);
  const before = snap(m, ps), alternate = bossLineupAlternative(m, ps, [...core, weak]);
  assert.ok(alternate.includes(incoming)); assert.ok(core.every(p => alternate.includes(p)));
  assert.ok(!alternate.includes(weak)); assert.equal(snap(m, ps), before); m.dispose();
});

test('boss alternate protects the sole healer and blocker when a ranged dealer waits on the bench', () => {
  const { m, ps } = setup();
  const star = board(m, ps, chess('星极').chessId), medic = board(m, ps, chess('莎草').chessId);
  const weak = board(m, ps, chess('隐现').chessId), incoming = give(m, ps, chess('异客').chessId, 'hand');
  const alternate = bossLineupAlternative(m, ps, [star, medic, weak]);
  assert.ok(alternate.includes(star)); assert.ok(alternate.includes(medic)); assert.ok(alternate.includes(incoming)); m.dispose();
});

for (const right of [false, true]) test(`boss trial includes owned bounty enemies on ${right ? 'right' : 'left'} half without formal changes`, () => {
  const { m, ps } = setup(true, right);
  const p = board(m, ps, chess('寒芒克洛丝').chessId);
  const card = Object.values(DATA.choices.cards.bounty).find(c => c.enemyKey && ps.gd.enemy(c.enemyKey));
  ps.bounties = [{ card, battlesLeft: 2 }]; m.botRehearsal = 3;
  const group = m.bossGroupOf(ps), expected = bountySpawns(m.gd, m.round, group.wave, ps.bounties, ps.playerId,
    { solo: m.isSolo, side: right ? 'R' : 'L' });
  assert.ok(expected.length > 0);
  const first = new LayoutPlan([[p.uid, [...ps.board.keys()][0]]]);
  const second = new LayoutPlan(first); second.dirs.set(p.uid, 'LEFT');
  const captured = [], construct = m.newBattle.bind(m); m.newBattle = o => { captured.push(o); return construct(o); };
  const before = snap(m, ps), job = createRehearsal(m, ps, [p], [first, second]);
  assert.ok(job); assert.equal(captured.length, 2);
  for (const o of captured) {
    assert.equal(o.flags.layerGainsEnabled, false);
    assert.deepEqual(o.spawns.filter(s => s.tag === 'bounty').map(s => [s.enemyKey, s.routeIndex, s.time]), expected.map(s => [s.enemyKey, s.routeIndex, s.time]));
  }
  job.run(); assert.equal(snap(m, ps), before); assert.equal(m.errorCount, 0); m.dispose();
});
