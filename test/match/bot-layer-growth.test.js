import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA, give } from './harness.js';
import { computeBonds } from '../../server/match/bondsMeta.js';
import { lineupScoreOf, levelUp } from '../../server/match/bot.js';
import { bondStackValue, growthProjection, growthPlanValue, refreshGrowthValue } from '../../server/match/botStrategy.js';

const chess = (name, golden = false) => Object.values(DATA.chess).find(c => c.name === name && c.isGolden === golden);
function setup() {
  const h = makeMatch({ humans: 1, mode: 'solo', difficulty: 'ABYSS', fake: true, seed: 91 }).start().toPrep(1);
  const m = h.m, ps = h.ps('p_0');
  for (const p of ps.allChess()) ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.layers = {}; ps.funds = 30;
  m.disabledBonds = []; m.bannedChess = []; ps.bandId = 'band_bldsk'; m.round = 6;
  ps.recompute(); return { h, m, ps, gd: ps.gd };
}
const activate = (ps, ...ids) => { ps.bonds = Object.fromEntries(ids.map(id => [id, { active: true, tier: 1, count: 3, layers: ps.layers[id] || 0 }])); };
const formal = (m, ps) => JSON.stringify({ funds: ps.funds, layers: ps.layers, board: [...ps.board], hand: ps.hand,
  meta: m.rngMeta.state(), shops: m.rngShop.state(), bots: m.rngBots.state() });

test('stored layers retain value above 120, respect inactive bonds, probability/ASPD saturation and price thresholds', () => {
  const { m, ps, gd } = setup(); activate(ps, 'arcaneShip', 'swiftShip', 'skillfulShip', 'visiShip');
  assert.ok(bondStackValue(gd, ps, 'arcaneShip', 500) > bondStackValue(gd, ps, 'arcaneShip', 120));
  assert.equal(bondStackValue(gd, ps, 'swiftShip', 300), bondStackValue(gd, ps, 'swiftShip', 900));
  assert.equal(bondStackValue(gd, ps, 'skillfulShip', 600), bondStackValue(gd, ps, 'skillfulShip', 900));
  assert.ok(bondStackValue(gd, ps, 'visiShip', 80) - bondStackValue(gd, ps, 'visiShip', 79)
    > bondStackValue(gd, ps, 'visiShip', 81) - bondStackValue(gd, ps, 'visiShip', 80));
  ps.bonds = {}; assert.equal(bondStackValue(gd, ps, 'arcaneShip', 900), 0); m.dispose();
});

test('acquisition forecast uses Investor x2/x3, while owned pieces never repeat their cashed gain', () => {
  const { m, ps, gd } = setup(), c = chess('豆苗');
  assert.equal(growthProjection(gd, ps, c, 6).gains.columbiaShip, 2);
  activate(ps, 'investShip'); ps.layers.investShip = 99;
  assert.equal(growthProjection(gd, ps, c, 6).gains.columbiaShip, 4);
  ps.layers.investShip = 100; assert.equal(growthProjection(gd, ps, c, 6).gains.columbiaShip, 6);
  assert.deepEqual(growthProjection(gd, ps, c, 6, { acquisition: false }).gains, {}); m.dispose();
});

test('candidate activation unlocks the existing grower; scoring preserves formal state and future benefit declines at boss', () => {
  const { m, ps } = setup();
  const star = give(m, ps, chess('星极').chessId, 'board', [10, 4]);
  const bean = give(m, ps, chess('豆苗').chessId, 'board', [9, 4]);
  const tin = give(m, ps, 'chess_char_2_19_a', 'hand'); // current Columbia variant, not the legacy Investor/Swift record
  const other = give(m, ps, 'chess_char_2_01_a', 'hand');
  ps.bonds = computeBonds(ps.gd, ps); const before = formal(m, ps);
  assert.equal(ps.bonds.columbiaShip.active, false);
  const early = lineupScoreOf(m, ps, [star, bean, tin]) - lineupScoreOf(m, ps, [star, bean, other]);
  const earlyGrowth = growthPlanValue(ps.gd, Object.assign(Object.create(ps), { bonds: computeBonds(ps.gd, { ...ps, board: new Map([['10,4', star], ['9,4', bean], ['10,5', tin]]) }) }), [star, bean, tin], m.round);
  assert.equal(formal(m, ps), before); assert.equal(ps.bonds.columbiaShip.active, false);
  m.round = m.gd.bossRound;
  const late = lineupScoreOf(m, ps, [star, bean, tin]) - lineupScoreOf(m, ps, [star, bean, other]);
  const lateGrowth = growthPlanValue(ps.gd, Object.assign(Object.create(ps), { bonds: computeBonds(ps.gd, { ...ps, board: new Map([['10,4', star], ['9,4', bean], ['10,5', tin]]) }) }), [star, bean, tin], m.round);
  assert.ok(early > 0 && late > 0, 'activation has immediate value at both stages');
  assert.ok(earlyGrowth > lateGrowth, 'only growth utility is compared: route and combat weights can change by stage'); m.dispose();
});

test('party growth shares the last layer of capacity instead of valuing every grower against the same room', () => {
  const { m, ps, gd } = setup();
  const a = give(m, ps, chess('星极').chessId, 'board', [10, 4]);
  const b = give(m, ps, chess('星极').chessId, 'board', [10, 5]);
  activate(ps, 'columbiaShip'); ps.layers.columbiaShip = 998;
  const before = formal(m, ps);
  assert.equal(growthPlanValue(gd, ps, [a, b], 6), growthPlanValue(gd, ps, [a], 6));
  ps.layers.columbiaShip = 999; assert.equal(growthPlanValue(gd, ps, [a, b], 6), 0);
  ps.layers.columbiaShip = 998; assert.equal(formal(m, ps), before); m.dispose();
});

test('a copied investment shares actual end-prep funds with the source', () => {
  const { m, ps, gd } = setup();
  const copy = give(m, ps, chess('塞雷娅').chessId, 'board', [10, 4]); copy.dir = 'RIGHT';
  const star = give(m, ps, chess('星极').chessId, 'board', [10, 5]);
  activate(ps, 'columbiaShip'); ps.funds = 5;
  const before = formal(m, ps);
  const p = growthProjection(gd, ps, gd.chess(copy.id), gd.bossRound, { acquisition: false, piece: copy });
  assert.equal(p.prepPayment, 5); assert.equal(p.gains.columbiaShip, 5);
  assert.equal(growthPlanValue(gd, ps, [copy, star], gd.bossRound), growthPlanValue(gd, ps, [copy], gd.bossRound));
  assert.equal(formal(m, ps), before); m.dispose();
});

test('next refresh values Lappland only until her own first trigger, including a fresh copy obtained later', () => {
  const { m, ps, gd } = setup();
  give(m, ps, chess('拉普兰德').chessId, 'board', [10, 4]);
  ps.bondCountBonus.siracusaShip = 20; ps.recompute();
  const before = formal(m, ps); assert.ok(refreshGrowthValue(gd, ps) > 0); assert.equal(formal(m, ps), before);
  assert.equal(ps.refresh().ok, true); assert.equal(refreshGrowthValue(gd, ps), 0);
  give(m, ps, chess('拉普兰德', true).chessId, 'hand'); assert.ok(refreshGrowthValue(gd, ps) > 0); m.dispose();
});

test('spending growth uses actually spent funds at the last prep, rather than counting an unused balance', () => {
  const { m, ps, gd } = setup(); activate(ps, 'columbiaShip', 'investShip');
  ps.funds = 80; ps.round.spent = 0;
  assert.equal(growthProjection(gd, ps, chess('山'), gd.bossRound, { acquisition: false }).gains.investShip, undefined);
  ps.round.spent = 11;
  assert.equal(growthProjection(gd, ps, chess('山'), gd.bossRound, { acquisition: false }).gains.investShip, 3);
  assert.equal(growthProjection(gd, ps, chess('山', true), gd.bossRound, { acquisition: false }).gains.investShip, 6); m.dispose();
});

test('a normal paid upgrade keeps a useful end-prep investment; free upgrades stay legal', () => {
  const { m, ps } = setup();
  give(m, ps, chess('星极').chessId, 'board', [10, 4]);
  ps.bondCountBonus.columbiaShip = 20; ps.recompute();
  ps.shop.level = 3; ps.shop.upgradePrice = 6; ps.funds = 10;
  const cap = ps.deployCap;
  for (let i = 0; i < cap; i++) give(m, ps, 'chess_char_1_01_a', 'hand');
  levelUp(m, ps); assert.equal(ps.shop.level, 3); assert.equal(ps.funds, 10);
  ps.shop.upgradePrice = 0; levelUp(m, ps); assert.ok(ps.shop.level > 3); m.dispose();
});
