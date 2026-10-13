import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, giveItem, legalTileFor, DATA } from './harness.js';
import { botPickBand, botPrepEnd, createRehearsal, equipItemsSteps, runSteps, LayoutPlan, bossRehearsalScore } from '../../server/match/bot.js';
import { botIncomeBonus, growthValue, growthReserve, estimateCombat, equipmentGain } from '../../server/match/botStrategy.js';
import { parseKey } from '../../server/match/board.js';

const chess = (name, golden = false) => Object.values(DATA.chess).find(c => c.name === name && c.isGolden === golden);
const item = name => Object.values(DATA.items).find(i => i.name === name && !i.isGolden);
const setup = (isBot = true, fake = true) => makeMatch({ mode: 'solo', difficulty: 'NORMAL', fake,
  seats: [{ seat: 0, playerId: 'p', name: 'P', isBot, connected: true }], seed: 91 }).start().toPrep(1);

test('AI income: exact R2/3/5/6/8/9/14 boundaries; no subsidy for human autoplay', () => {
  for (const isBot of [true, false]) {
    const h = setup(isBot), ps = h.m.order[0];
    ps.bandId = 'band_bldsk'; ps.autoplay = !isBot;
    for (const [round, bonus] of [[2, 0], [3, 1], [5, 1], [6, 2], [8, 2], [9, 4], [14, 4]]) {
      h.m.round = round; ps.funds = 0; ps.pendingFunds = 0;
      const before = ps.stats.fundsGained;
      ps.startRound(round);
      assert.equal(ps.funds, h.m.gd.income(round) + (isBot ? bonus : 0));
      assert.equal(ps.stats.fundsGained - before, ps.funds);
      assert.equal(botIncomeBonus(round), bonus);
    }
    h.m.dispose();
  }
});

test('specialty bands are preferred, available and compatible with disabled bonds', () => {
  for (const difficulty of ['NORMAL', 'FUNNY']) {
    const h = makeMatch({ mode: 'coop', difficulty, humans: 0, bots: 2, fake: true });
    const m = h.m, ps = m.order[0];
    const valid = m.gd.bandIds().filter(id => m.gd.bandBondIds(id).some(b => m.gd.bond(b)?.isCore)
      && !m.gd.bandBondIds(id).some(b => m.gd.modeInactiveBonds.has(b)));
    assert.ok(valid.length);
    m.bandTaken = id => id === valid[0];
    for (let i = 0; i < 30; i++) {
      const id = botPickBand(m, ps);
      assert.ok(valid.includes(id)); assert.notEqual(id, valid[0]);
    }
    m.dispose();
  }
});

test('new trait forecast respects activation, caps and remaining rounds', () => {
  const h = setup(), gd = h.m.gd, ps = h.m.order[0];
  const silent = chess('赫默'), meteor = chess('陨星');
  ps.funds = 16; ps.layers = {}; ps.bonds = {};
  assert.equal(growthValue(gd, ps, silent, 6), 0);
  ps.bonds = { visiShip: { active: true }, columbiaShip: { active: true } };
  assert.ok(growthValue(gd, ps, silent, 6) > 0);
  assert.equal(growthValue(gd, ps, silent, gd.bossRound), 0);
  ps.layers = { visiShip: 999, columbiaShip: 999 };
  assert.equal(growthValue(gd, ps, silent, 6), 0);
  ps.layers = {};
  assert.ok(growthValue(gd, ps, meteor, 6) > 0, 'acquisition growth does not require activation');
  assert.equal(growthValue(gd, ps, meteor, 6, { acquisition: false }), 0, 'already-cashed acquisition layers are not a reason to keep weak pieces');
  assert.ok(growthValue(gd, ps, chess('陨星', true), 6) > growthValue(gd, ps, meteor, 6));
  h.m.dispose();
});

test('useful end-prep growth reserves money; inactive/capped bonds reserve none', () => {
  const h = setup(), m = h.m, ps = m.order[0], c = chess('星极');
  give(m, ps, c.chessId, 'board', parseKey(legalTileFor(m, ps, c.chessId)));
  ps.bonds = {}; assert.equal(growthReserve(m.gd, ps), 0);
  ps.bonds = { columbiaShip: { active: true } }; ps.layers = {};
  assert.ok(growthReserve(m.gd, ps) > 0);
  ps.layers = { columbiaShip: 999 }; assert.equal(growthReserve(m.gd, ps), 0);
  m.dispose();
});

test('combat shortlist counts harmony/cold, skill ramp and cancelled leader hits', () => {
  const h = setup(), gd = h.m.gd, ps = h.m.order[0], mu = chess('缪尔赛思'), kr = chess('寒芒克洛丝', true);
  ps.bonds = {}; ps.layers = {};
  const base = estimateCombat(gd, ps, mu).dps;
  ps.bonds = { maniShip: { active: true }, kjeragShip: { active: true, tier: 1 } }; ps.layers.kjeragShip = 302;
  ps.board = new Map([['9,7', { uid: 1, kind: 'chess', id: mu.chessId, items: [] }],
    ['9,8', { uid: 2, kind: 'chess', id: kr.chessId, items: [{ id: item('谢拉格不融冰').id }] }]]);
  assert.ok(estimateCombat(gd, ps, mu).dps > base * 2);
  const ready = { ...kr, skill: { ...kr.skill, initSp: kr.skill.spCost }, stats: { ...kr.stats, aspd: 600 } };
  ps.bonds = {};
  const short = estimateCombat(gd, ps, ready, { id: kr.chessId }, { horizon: 1 }).dps;
  const long = estimateCombat(gd, ps, ready, { id: kr.chessId }, { horizon: 10 }).dps;
  assert.ok(long > short, 'quadruple shots require skill hits, not all earlier attacks');
  const huge = { ...mu, stats: { ...mu.stats, atk: 1e6 } };
  assert.equal(estimateCombat(gd, ps, huge, { id: mu.chessId }, { boss: true }).dps, 0);
  assert.ok(estimateCombat(gd, ps, huge).dps > 0);
  h.m.dispose();
});

test('equipment shortlist understands morph plus conversion without moving already equipped items', () => {
  const h = setup(), ps = h.m.order[0], gd = h.m.gd, rec = chess('寒芒克洛丝', true);
  const p = { kind: 'chess', id: rec.chessId, uid: 1, items: [] }, morph = { kind: 'item', id: item('变形同构体').id }, ice = { kind: 'item', id: item('谢拉格不融冰').id };
  ps.bonds = { kjeragShip: { active: true, tier: 1 } }; ps.layers = { kjeragShip: 302 }; ps.board = new Map([['9,7', p]]);
  ps.hand = []; ps.temp = [];
  const alone = equipmentGain(gd, ps, p, morph, rec);
  ps.hand = [ice];
  assert.ok(equipmentGain(gd, ps, p, morph, rec) > alone);
  assert.deepEqual(p.items, []); assert.deepEqual(ps.hand, [ice]);
  h.m.dispose();
});

for (const [hidden, right] of [[false, false], [true, false], [false, true]]) test(`${hidden ? 'hidden' : 'boss'} ${right ? 'R' : 'L'} rehearsal uses real pool/side and preserves official state and RNG`, () => {
  const h = right ? makeMatch({ mode: 'coop', humans: 0, bots: 2, difficulty: 'NORMAL', seed: 91 }).start().toPrep(1) : setup(true, false);
  const m = h.m, ps = m.order[right ? 1 : 0];
  m.round = hidden ? m.gd.hiddenRound : m.gd.bossRound; m.bossId = m.hiddenBossId = 'boss_8'; ps.lp = 100;
  m.wave = null; m._planBossWaves(); ps.invalidateDeployMap(); ps.recompute();
  const pieces = ['寒芒克洛丝', '缪尔赛思'].map(name => {
    const id = chess(name, name === '寒芒克洛丝').chessId;
    return give(m, ps, id, 'board', parseKey(legalTileFor(m, ps, id)));
  });
  const keys = [...ps.board].filter(([, p]) => p.kind === 'chess').map(([key]) => key);
  const plans = [new LayoutPlan(pieces.map((p, i) => [p.uid, keys[i]])), new LayoutPlan(pieces.map((p, i) => [p.uid, keys[1 - i]]))];
  const snap = () => JSON.stringify({ board: [...ps.board], hand: ps.hand, temp: ps.temp, funds: ps.funds, layers: ps.layers,
    pool: m.pool.snapshot(), uid: m.uidSeq, rng: [m.rngBots.state(), m.rngShop.state(), m.rngWaves.state()] });
  const before = snap(), opts = [], construct = m.newBattle.bind(m);
  m.botRehearsal = 3; m.newBattle = o => { opts.push(o); return construct(o); };
  const job = createRehearsal(m, ps, pieces, plans);
  assert.ok(job, JSON.stringify(h.logs)); assert.equal(snap(), before);
  while (!job.run(1)) { /* bounded slices */ }
  assert.equal(snap(), before); assert.equal(job.done, true); assert.equal(opts.length, 2);
  assert.ok(opts.every(o => o.kind === (hidden ? 'hidden' : 'boss') && o.sharedBoss && o.flags.enemyScale));
  assert.ok(opts.every(o => o.players[0].side === (right ? 'R' : 'L')));
  assert.notEqual(opts[0].sharedBoss, opts[1].sharedBoss);
  assert.equal(m.bossPool, null); assert.equal(m.errorCount, 0);
  assert.equal(job.metrics.length, 2); assert.ok(job.metrics.every(x => Number.isFinite(x.bossDamage)));
  m.dispose();
});

for (const deadline of [false, true]) test(`equipment trial ${deadline ? 'deadline fallback' : 'selection'} consumes only the committed pack`, () => {
  const h = setup(true, false), m = h.m, ps = m.order[0];
  m.round = m.gd.bossRound; m.bossId = 'boss_8'; ps.lp = 100; m.wave = null; m._planBossWaves(); ps.invalidateDeployMap();
  for (const [name, gold] of [['寒芒克洛丝', true], ['异客', false], ['缪尔赛思', false]]) {
    const id = chess(name, gold).chessId; give(m, ps, id, 'board', parseKey(legalTileFor(m, ps, id)));
  }
  const pack = ['变形同构体', '谢拉格不融冰'].map(name => giveItem(m, ps, item(name).id));
  m.botRehearsal = 3;
  const before = JSON.stringify({ board: [...ps.board], hand: ps.hand, funds: ps.funds, uid: m.uidSeq, rng: m.rngShop.state() });
  const gen = equipItemsSteps(m, ps); let step;
  do step = gen.next(); while (!step.done && !step.value?.rehearsal);
  assert.ok(step.value?.rehearsal, JSON.stringify(h.logs));
  assert.equal(JSON.stringify({ board: [...ps.board], hand: ps.hand, funds: ps.funds, uid: m.uidSeq, rng: m.rngShop.state() }), before);
  let kept = false;
  if (deadline) {
    m.startFinalAssault = () => {}; m.prepDeadline(); assert.equal(ps._botPendingEquipment, null);
  } else {
    step.value.rehearsal.run();
    kept = step.value.rehearsal.best.equipmentHolder == null;
    assert.ok(pack.every(p => ps.find(p.uid)?.area === 'hand'));
    runSteps(gen); assert.equal(ps._botPendingEquipment, null);
  }
  assert.ok(pack.every(p => ps.find(p.uid)?.area === (kept ? 'hand' : 'equipped')));
  if (!kept) {
    const holder = [...ps.board.values()].find(p => p.items?.some(it => it.uid === pack[0].uid));
    assert.ok(holder.items.some(it => it.uid === pack[1].uid));
  }
  assert.equal(m.errorCount, 0);
  m.dispose();
});

test('selected alternate roster actually deploys with both board and hand full', () => {
  const h = setup(), m = h.m, ps = m.order[0], id = chess('寒芒克洛丝').chessId;
  const pieces = Array.from({ length: ps.deployCap }, () => give(m, ps, id, 'board', parseKey(legalTileFor(m, ps, id))));
  const incoming = give(m, ps, chess('寒芒克洛丝', true).chessId);
  while (ps.hand.some(p => !p)) giveItem(m, ps, item('盟约之币').id);
  const original = new LayoutPlan([...ps.board].map(([key, p]) => [p.uid, key]));
  const alternate = new LayoutPlan(original); alternate.delete(pieces[0].uid);
  alternate.set(incoming.uid, legalTileFor(m, ps, incoming.id));
  alternate.chosen = [incoming, ...pieces.slice(1)];
  botPrepEnd(m, ps, { done: true, chosen: pieces, plans: [original], best: alternate });
  assert.equal(ps.find(incoming.uid)?.area, 'board');
  assert.equal(ps.find(pieces[0].uid)?.area, 'hand');
  assert.equal(ps.deployCount, ps.deployCap);
  assert.ok(alternate.chosen.every(p => ps.find(p.uid)?.area === 'board'));
  m.dispose();
});

test('boss scoring prefers clears then clear time, actual boss damage and surviving LP', () => {
  const fake = (hp, time, damage, kills = 0, lp = 20) => ({ time, _botTeamLp: lp, sharedBoss: { hp, maxHp: 100 },
    result: () => ({ perPlayer: { p: { bossDamage: damage, killed: kills, unitsEnd: [{ alive: true }], leaked: [] } } }) });
  assert.ok(bossRehearsalScore(fake(0, 10, 100), 'p') > bossRehearsalScore(fake(0, 20, 100), 'p'));
  assert.ok(bossRehearsalScore(fake(0, 20, 100), 'p') > bossRehearsalScore(fake(1, 2, 99, 9999), 'p'));
  assert.ok(bossRehearsalScore(fake(20, 60, 80), 'p') > bossRehearsalScore(fake(80, 60, 20, 9999), 'p'));
  assert.equal(bossRehearsalScore(fake(0, 10, 100, 0, 0), 'p'), -Infinity);
});
