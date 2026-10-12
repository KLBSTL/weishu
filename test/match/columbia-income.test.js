import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA, give } from './harness.js';
import { SharedPool } from '../../server/match/pool.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
const registry = createRegistry({ log: { warn() {}, error() {}, info() {} } });
function setup(level = 1, seed = 41) {
  const h = makeMatch({ humans: 2, seed, fake: true, registry }).start(); h.toPrep(1);
  const m = h.m, ps = h.ps('p_0');
  for (const p of ps.allChess()) ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
  m.pool = new SharedPool(m.gd); m.bannedChess = []; m.disabledBonds = [];
  ps.bandId = 'band_recruit_columbia'; ps.shop.level = level; ps.funds = 10;
  ps.recruitment.granted = []; ps.recruitment.charges = 0; ps.round.spent = 0; ps.recompute();
  return { h, m, ps };
}
test('Columbia income: 9/10 funds gate, ordinary gain, one payment per formal round and no orders', () => {
  const { m, ps } = setup();
  ps.funds = 9; ps.startRecruitmentRound(2);
  assert.equal(ps.funds, 9); assert.equal(ps.allChess().length, 0);
  ps.funds = 10; ps.startRecruitmentRound(2);
  assert.equal(ps.allChess().length, 0, 'no late retry after a failed round-start gate');
  ps.startRecruitmentRound(3);
  assert.equal(ps.funds, 9); assert.equal(ps.round.spent, 1);
  assert.equal(ps.allChess()[0].id, 'chess_char_1_columbia_bstalk_a');
  assert.equal(ps.layers.columbiaShip, 2, 'ordinary acquisition trait executes');
  ps.funds = 10; ps.startRecruitmentRound(3);
  assert.equal(ps.funds, 10); assert.equal(ps.allChess().length, 1);
  ps.startRecruitmentRound(4); assert.equal(ps.funds, 9); assert.equal(ps.allChess().length, 2);
  assert.equal(ps.recruitment.charges, 0); assert.equal(ps.recruitmentView(), null);
  assert.equal(ps.recruitmentSpec().initialChess, null);
  m.dispose();
});
test('Columbia income: current shop tier and depleted shared stock prevent out-of-tier gifts or spending', () => {
  for (const level of [2, 3]) {
    const { m, ps } = setup(level);
    const star = 'chess_char_3_columbia_astesi_a';
    for (const [id, entry] of m.pool.entries) if (id !== star) m.pool.take(id, entry.left);
    ps.startRecruitmentRound(2);
    assert.equal(ps.funds, level === 2 ? 10 : 9);
    assert.deepEqual(ps.allChess().map(p => p.id), level === 2 ? [] : [star]);
    assert.equal(m.pool.left(star), m.pool.cap(star) - (level === 3 ? 1 : 0));
    m.dispose();
  }
});
test('Columbia income: each granted identity is normal Columbia and no higher than the current shop level', () => {
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const { m, ps } = setup(level, 40 + level); ps.startRecruitmentRound(2);
    const c = DATA.chess[ps.allChess()[0].id];
    assert.ok(c.visible && !c.isGolden && !c.isDiy && c.bonds.includes('columbiaShip'));
    assert.ok(c.tier <= level); assert.equal(ps.funds, 9); m.dispose();
  }
});
test('Columbia income: unavailable stock and full hand/temp never consume funds or draw RNG', () => {
  for (const full of [false, true]) {
    const { m, ps } = setup();
    if (full) {
      ps.hand = ps.hand.map(() => ps.newPiece('item', 'chess_item_1_03_e_a'));
      ps.temp = ps.temp.map(() => ps.newPiece('item', 'chess_item_1_03_e_a'));
    } else {
      const id = 'chess_char_1_columbia_bstalk_a'; m.pool.take(id, m.pool.cap(id));
    }
    const rng = m.rngShop.state(); ps.startRecruitmentRound(2);
    assert.equal(ps.funds, 10); assert.equal(ps.round.spent, 0); assert.equal(m.rngShop.state(), rng);
    m.dispose();
  }
});
test('Columbia income: after-income payment precedes Aphris and contributes to the same round spending', () => {
  const { m, ps } = setup();
  give(m, ps, 'chess_char_6_columbia_aphris_a', 'board', [10, 5]);
  ps.bondCountBonus.columbiaShip = 20; ps.bondCountBonus.preciShip = 20; ps.recompute();
  m.round = 2; ps.funds = 9; ps.pendingFunds = 0;
  const total = 9 + ps.gd.income(2); ps.startRound(2);
  assert.equal(ps.funds, total - 1); assert.equal(ps.round.spent, 1);
  const before = ps.layers.preciShip || 0;
  m.dispatch(ps, 'onRoundStart', { round: 2 });
  const triggers = Math.floor((total - 1) / 4);
  assert.equal(ps.funds, total - 1 - triggers); assert.equal(ps.round.spent, 1 + triggers);
  assert.equal(ps.layers.preciShip - before, 4 * triggers); m.dispose();
});
