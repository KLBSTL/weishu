import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './harness.js';
import { SharedPool } from '../../server/match/pool.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { takeRecruitment } from '../../server/match/bot.js';
import { validateC2S } from '../../shared/protocol.js';

const OK = { ok: true };
const normal = (name) => Object.values(DATA.chess).find(c => !c.isGolden && c.name === name).chessId;
const reg = createRegistry({ log: { warn() {}, error() {}, info() {} } });
function setup(kind = 'columbia', level = 6) {
  const h = makeMatch({ humans: 2, seed: 41, fake: true, registry: reg }).start();
  h.toPrep(1);
  const m = h.m, ps = h.ps('p_0');
  m.pool = new SharedPool(m.gd);
  m.bannedChess = []; m.disabledBonds = [];
  ps.bandId = `band_recruit_${kind}`;
  ps.shop.level = level;
  // Retained legacy order transactions are tested independently of the new automatic squad effect.
  if (kind === 'columbia') ps.recruitmentSpec = () => ({ kind, bond: 'columbiaShip', rounds: [3, 6, 9], count: 2,
    initialChess: normal('豆苗') });
  return { h, m, ps, other: h.ps('p_1') };
}
function order(ps, r = 3) { ps.startRecruitmentRound(r); }
function choose(ps, idx = 0) { return ps.pickRecruitment(ps.recruitment.pending.id, idx); }

test('44 squads: metadata, LP, fixed schedules and shared-faction identity', () => {
  assert.equal(Object.keys(DATA.bands).length, 44);
  assert.equal(DATA.bands.band_recruit_sarkaz.totalHp, 22);
  assert.equal(DATA.bands.band_recruit_columbia.totalHp, 26);
  assert.deepEqual(DATA.bands.band_recruit_sarkaz.bondIds, ['sarkazShip']);
  assert.deepEqual(DATA.bands.band_recruit_columbia.bondIds, ['columbiaShip']);
  assert.equal(DATA.bands.band_recruit_columbia.recruitment.kind, 'columbia-income');
  assert.equal(DATA.bands.band_recruit_columbia.recruitment.initialChess, null);
  assert.equal(DATA.bands.band_recruit_columbia.recruitment.minFunds, 10);
  assert.equal(DATA.bands.band_recruit_columbia.recruitment.cost, 1);
});

test('Columbia rounds 3/6/9 only, idempotent grants, no shop-upgrade charge; owner only', () => {
  const { ps, other } = setup();
  for (let r = 1; r <= 15; r++) { ps.startRecruitmentRound(r); ps.startRecruitmentRound(r); }
  assert.equal(ps.recruitment.charges, 3);
  assert.deepEqual(ps.recruitment.granted, [3, 6, 9]);
  assert.equal(other.recruitment.charges, 0);
  assert.equal(ps.allChess().filter(p => p.id === normal('豆苗')).length, 1);
  assert.equal(ps.layers.columbiaShip, 2);
  const before = JSON.stringify(ps.recruitment);
  ps.shop.level = 1; ps.funds = 100; ps.levelUp();
  assert.equal(JSON.stringify(ps.recruitment), before);
});

test('Sarkaz first manual refresh: two distinct eligible operators, no beacon or free purchase', () => {
  const { ps, h, other } = setup('sarkaz', 4);
  for (let r = 1; r <= 15; r++) ps.startRecruitmentRound(r);
  assert.equal(ps.recruitment.charges, 0); assert.equal(ps.recruitmentView(), null);
  ps.funds = 20; ps.round.refreshes = 0; ps.shop.freeRefreshes = 0;
  assert.deepEqual(ps.refresh(), OK);
  const first = ps.shop.slots.slice(0, 2).map(s => DATA.chess[s.id]);
  assert.equal(new Set(first.map(c => c.charId)).size, 2);
  assert.ok(first.every(c => c.bonds.includes('sarkazShip') && c.tier <= 4 && !c.isGolden));
  assert.equal(ps.allChess().length, 0); assert.equal(other.allChess().length, 0);
  assert.equal(ps.funds, 20 - ps.gd.refreshPrice);
  const view = ps.privateView(); assert.equal(view.recruitment, null);
  const calls = [], roll = ps.rollShop.bind(ps);
  ps.rollShop = opts => { calls.push(opts.priority); return roll(opts); };
  ps.refresh(); assert.equal(calls.at(-1), null, 'second refresh has no priority');
  ps.round.refreshes = 0; ps.shop.freeRefreshes = 1;
  ps.rollShop({ keepFrozen: true }); assert.equal(ps.round.refreshes, 0, 'automatic roll does not consume');
  ps.refresh(); assert.deepEqual(calls.at(-1), { bond: 'sarkazShip', count: 2 });
  h.invariants();
});

test('Sarkaz priority respects missing stock, bans, tier and failed refresh', () => {
  const { ps, m } = setup('sarkaz', 1);
  ps.funds = 0; ps.shop.freeRefreshes = 0; ps.round.refreshes = 0;
  assert.equal(ps.refresh().ok, undefined); assert.equal(ps.round.refreshes, 0);
  ps.funds = 10; ps.refresh(); assert.equal(ps.shop.slots[0].id, normal('红豆'));
  assert.equal(ps.priceOf(ps.shop.slots[0]), 1);
  m.pool.entries.delete(normal('红豆'));
  ps.round.refreshes = 0; ps.refresh();
  assert.ok(ps.shop.slots.filter(s => s?.kind === 'chess').every(s => s.id !== normal('红豆') && DATA.chess[s.id].tier === 1));
});

test('cancel/reopen, reconnect views and shop upgrades cannot reroll a Columbia order', () => {
  const { ps, m, h } = setup('columbia', 5); order(ps);
  const sample = ps.acquireChess(normal('白面鸮'));
  ps.openRecruitment(sample.uid);
  const first = structuredClone(ps.recruitment.pending);
  const before = ps.privateView().recruitment;
  assert.deepEqual(ps.privateView().recruitment, before);
  const remaining = m.pool.left(first.ids[0]);
  assert.deepEqual(ps.cancelRecruitment(first.id), OK);
  assert.equal(m.pool.left(first.ids[0]), remaining + 1);
  ps.shop.level = 6; ps.openRecruitment(sample.uid);
  assert.deepEqual(ps.recruitment.pending.ids, first.ids);
  assert.notEqual(ps.recruitment.pending.id, first.id);
  assert.equal(ps.pickRecruitment(first.id, 0).ok, undefined);
  h.invariants();
});

test('Astesia: unique tier-3 identity, shared stock and shop eligibility use the new tier', () => {
  const { m } = setup();
  const records = Object.values(DATA.chess).filter(c => c.charId === 'char_274_astesi');
  assert.equal(records.length, 2);
  assert.equal(normal('星极'), 'chess_char_3_columbia_astesi_a', 'existing ids retained');
  for (const c of records) {
    assert.equal(c.tier, 3);
    assert.equal(c.price, DATA.chess[normal('松果').replace(/_a$/, c.isGolden ? '_b' : '_a')].price);
  }
  const id = normal('星极');
  assert.equal(m.pool.cap(id), m.pool.cap(normal('松果')));
  assert.equal(m.pool.cap(id), 18);
  const filter = candidate => candidate === id;
  assert.equal(m.pool.roll(() => 0, { maxTier: 2, filter }), null);
  assert.equal(m.pool.roll(() => 0, { maxTier: 3, filter }), id);
  m.dispose();
});

test('Columbia exact +1 tier excludes Ifrit; equipment returned without sell or refund', () => {
  const { ps, h } = setup();
  order(ps);
  const sample = ps.acquireChess(normal('白面鸮'));
  const itemId = Object.values(DATA.items).find(i => i.itemType === 'EQUIP' && !i.isGolden).id;
  const item = ps.acquireItem(itemId); ps._detach(ps.find(item.uid)); sample.items.push(item);
  const gain = ps.round.gainedChess, sells = ps.round.sells, funds = ps.funds;
  assert.deepEqual(ps.openRecruitment(sample.uid), OK);
  assert.deepEqual(ps.recruitment.pending.ids.map(id => DATA.chess[id].name).sort(), ['山', '塞雷娅'].sort());
  const index = 0;
  assert.deepEqual(choose(ps, index), OK);
  assert.equal(ps.find(sample.uid), null);
  assert.ok(['hand', 'temp'].includes(ps.find(item.uid)?.area));
  assert.equal(ps.round.sells, sells); assert.equal(ps.funds, funds);
  assert.equal(ps.round.gainedChess, gain + 1);
  const plosis = ps.acquireChess(normal('白面鸮'));
  const ifrit = ps.acquireChess(normal('伊芙利特'));
  order(ps, 6); assert.equal(ps.openRecruitment(ifrit.uid).ok, undefined);
  assert.deepEqual(ps.openRecruitment(plosis.uid), OK);
  assert.deepEqual(ps.recruitment.pending.ids.map(id => DATA.chess[id].name).sort(), ['山', '塞雷娅'].sort());
  h.invariants();
});

test('orders can chain, each exactly one tier, and stop when shop is too low', () => {
  const { ps } = setup('columbia', 4);
  for (const r of [3, 6, 9]) order(ps, r);
  let sample = ps.acquireChess(normal('豆苗'));
  for (const tier of [2, 3, 4]) {
    assert.deepEqual(ps.openRecruitment(sample.uid), OK);
    const id = ps.recruitment.pending.ids[0]; assert.equal(DATA.chess[id].tier, tier);
    choose(ps); sample = ps.allChess().find(p => p.id === id);
  }
  assert.equal(ps.recruitment.charges, 0);
  assert.equal(ps.recruitmentSample(sample.uid), null);
});

test('invalid samples: other player, elite, tier6, summon and wrong faction', () => {
  const { ps, other } = setup(); order(ps);
  const foreign = other.acquireChess(normal('星极'));
  assert.equal(ps.openRecruitment(foreign.uid).ok, undefined);
  for (const name of ['维什戴尔', '霍尔海雅', '红豆']) assert.equal(ps.openRecruitment(ps.acquireChess(normal(name)).uid).ok, undefined);
  const elite = ps.acquireChess(normal('星极')); ps.promote(elite);
  assert.equal(ps.openRecruitment(elite.uid).ok, undefined);
  const token = ps.newPiece('token', 'fake'); ps.stow(token);
  assert.equal(ps.openRecruitment(token.uid).ok, undefined);
  assert.equal(ps.recruitment.charges, 1);
});

test('stale or promoted sample refuses atomically, cancel keeps charge', () => {
  const { ps, h } = setup(); order(ps);
  const sample = ps.acquireChess(normal('山'));
  ps.openRecruitment(sample.uid); ps.promote(sample);
  assert.equal(choose(ps).ok, undefined);
  assert.equal(ps.recruitment.charges, 1);
  ps.cancelRecruitment(ps.recruitment.pending.id);
  assert.ok(ps.find(sample.uid)); h.invariants();
});

test('full bench refuses before consuming sample/order/equipment', () => {
  for (const kind of ['columbia']) {
    const { ps, m } = setup(kind); order(ps, kind === 'sarkaz' ? 4 : 3);
    const sample = ps.acquireChess(normal('星极'));
    const itemId = Object.values(DATA.items).find(i => i.itemType === 'EQUIP' && !i.isGolden).id;
    sample.items.push(ps.newPiece('item', itemId));
    while (ps.hand.some(p => !p) || ps.temp.some(p => !p)) ps.stow(ps.newPiece('item', itemId));
    ps.openRecruitment(kind === 'columbia' ? sample.uid : null);
    const before = JSON.stringify([ps.recruitment, ps.hand, ps.temp, [...m.pool.entries]]);
    assert.equal(choose(ps).ok, undefined);
    assert.equal(JSON.stringify([ps.recruitment, ps.hand, ps.temp, [...m.pool.entries]]), before);
  }
});

test('reserved candidates block competing stock; cancel and elimination release all copies', () => {
  const { ps, m, h } = setup(); order(ps); const sample = ps.acquireChess(normal('白面鸮')); ps.openRecruitment(sample.uid);
  const ids = [...ps.recruitment.pending.ids];
  for (const id of ids) assert.equal(m.pool.left(id), m.pool.cap(id) - 1);
  ps.endPrep();
  for (const id of ids) assert.equal(m.pool.left(id), m.pool.cap(id));
  ps.ready = false; ps.openRecruitment(sample.uid);
  assert.deepEqual(ps.recruitment.pending.ids, ids);
  ps.eliminate(4);
  for (const id of ids) assert.equal(m.pool.left(id), m.pool.cap(id));
  h.invariants();
});

test('empty/short/banned stock never invents recruits, failed opening consumes nothing', () => {
  const { ps, m } = setup(); order(ps);
  const sample = ps.acquireChess(normal('山'));
  const high = Object.values(DATA.chess).filter(c => c.visible && !c.isGolden && c.tier === 6 && c.bonds.includes('columbiaShip'));
  for (const c of high) m.pool.entries.delete(c.chessId);
  assert.equal(ps.openRecruitment(sample.uid).ok, undefined);
  assert.equal(ps.recruitment.charges, 1); assert.ok(ps.find(sample.uid));
  const id = high[0].chessId;
  m.pool.entries.set(id, { cap: 1, left: 1, tier: 6 });
  ps.openRecruitment(sample.uid);
  assert.deepEqual(ps.recruitment.pending.ids, [id]);
  assert.equal(m.pool.left(id), 0);
});

test('normal gain completes merge, pool transfers exactly one copy; replayed pick is rejected', () => {
  const { ps, m, h } = setup(); order(ps);
  const sample = ps.acquireChess(normal('山')), target = normal('霍尔海雅');
  ps.acquireChess(target); ps.acquireChess(target);
  const gains = ps.round.gainedChess;
  ps.openRecruitment(sample.uid); const offer = structuredClone(ps.recruitment.pending);
  assert.deepEqual(choose(ps, offer.ids.indexOf(target)), OK);
  const elite = ps.allChess().find(p => p.id === ps.gd.goldenIdOf(target));
  assert.equal(elite.poolCopies, 3);
  assert.equal(m.pool.left(target), m.pool.cap(target) - 3);
  assert.equal(ps.round.gainedChess, gains + 1);
  assert.equal(ps.pickRecruitment(offer.id, 0).ok, undefined);
  h.invariants();
});

test('ready/combat cannot open or confirm; private views do not leak another player offer', () => {
  const { ps, other, m } = setup(); order(ps); const sample = ps.acquireChess(normal('白面鸮'));
  ps.ready = true; assert.equal(ps.openRecruitment(sample.uid).ok, undefined);
  ps.ready = false; ps.openRecruitment(sample.uid);
  assert.equal(other.privateView().recruitment, null);
  m.phase = 'COMBAT'; assert.equal(choose(ps).ok, undefined);
});

test('disabled core blocks new squads and bot spending obeys same server transactions', () => {
  const { ps, m, h } = setup(); order(ps); ps.acquireChess(normal('白面鸮'));
  const original = new Map(m.pool.entries);
  m.disabledBonds.push('sarkazShip'); assert.equal(m.recruitmentBandOff('band_recruit_sarkaz'), false, 'soft core with remaining members stays playable');
  for (const id of m.pool.entries.keys()) if (m.gd.chess(id).bonds.some(b => ['sarkazShip','columbiaShip'].includes(b))) m.pool.entries.delete(id);
  assert.equal(m.recruitmentBandOff('band_recruit_sarkaz'), true);
  assert.equal(m.recruitmentBandOff(ps.bandId), true);
  m.pool.entries = original;
  m.disabledBonds = []; takeRecruitment(m, ps);
  assert.equal(ps.recruitment.charges, 0); assert.equal(ps.allChess().length, 1);
  h.invariants();
});

test('two players compete for the last copy through routed intents without overselling', () => {
  const { ps, other, m, h } = setup();
  other.bandId = ps.bandId; other.shop.level = 6;
  other.recruitmentSpec = ps.recruitmentSpec;
  order(ps); order(other);
  const a = ps.acquireChess(normal('山')), b = other.acquireChess(normal('山'));
  const target = normal('霍尔海雅');
  for (const [id, e] of m.pool.entries) {
    if (e.tier !== 6 || !DATA.chess[id].bonds.includes('columbiaShip')) continue;
    if (id === target) { e.cap = 1; e.left = 1; }
    else m.pool.entries.delete(id);
  }
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.recruitOpen', sampleUid: a.uid }), OK);
  assert.ok(m.handle(other.playerId, { t: 'g.recruitOpen', sampleUid: b.uid }).error);
  assert.equal(other.recruitment.charges, 1);
  h.invariants();
  const offerId = ps.recruitment.pending.id;
  assert.deepEqual(m.handle(ps.playerId, { t: 'g.recruitCancel', offerId }), OK);
  assert.deepEqual(m.handle(other.playerId, { t: 'g.recruitOpen', sampleUid: b.uid }), OK);
  assert.deepEqual(m.handle(other.playerId, { t: 'g.recruitPick', offerId: other.recruitment.pending.id, idx: 0 }), OK);
  assert.equal(m.pool.left(target), 0);
  assert.equal(ps.recruitment.charges, 1); assert.ok(ps.find(a.uid));
  h.invariants();
});

test('recruitment wire validation rejects invalid indices, missing offer identities and forged sample types', () => {
  for (const msg of [{ t: 'g.recruitPick', idx: 0 }, { t: 'g.recruitPick', offerId: 'recruit_1', idx: -1 },
    { t: 'g.recruitPick', offerId: 'recruit_1', idx: 3 }, { t: 'g.recruitOpen', sampleUid: '1' }]) {
    assert.match(validateC2S(msg), /^bad field /);
  }
});
