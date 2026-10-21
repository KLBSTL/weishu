import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA, give } from './harness.js';
import { bondPlan, planLayout, improveGrowthLayoutSteps, runSteps, rangeTiles, fieldModel } from '../../server/match/bot.js';
import { previewPrep, previewBattleGrowth, skillCycle, forecastGrowth } from '../../server/match/botGrowth.js';
import { SUB_BOND_ROUTES, growthBenchBudget, planOwnedBonds } from '../../server/match/botPlans.js';
import { customGrowthTrait } from '../../server/match/botStrategy.js';

const rec = (name, elite = false) => Object.values(DATA.chess).find(c => c.name === name && c.isGolden === elite && c.visible);
function setup() {
  const h = makeMatch({ humans: 1, mode: 'solo', difficulty: 'ABYSS', fake: true, seed: 91 }).start().toPrep(1);
  const m = h.m, ps = h.ps('p_0'), gd = ps.gd;
  for (const p of ps.allChess()) ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.layers = {}; ps.counters = {}; ps.funds = 21;
  m.round = 6; m.disabledBonds = []; m.bannedChess = []; ps.bandId = 'band_sarkazb';
  m.pool.entries = new Map(gd.visibleChess.map(id => [id, { tier: gd.tierOf(id), left: 100 }]));
  ps.recompute();
  return { h, m, ps, gd };
}
const activate = (ps, ids) => { ps.bonds = Object.fromEntries(ids.map(id => [id, { active: true, tier: 1, count: 3, layers: ps.layers[id] || 0 }])); };
const put = (m, ps, name, at, elite = false) => give(m, ps, rec(name, elite).chessId, at ? 'board' : 'hand', at);
const snapshot = (m, ps) => JSON.stringify({ board: [...ps.board], hand: ps.hand, temp: ps.temp, funds: ps.funds, pending: ps.pendingFunds, layers: ps.layers,
  counters: ps.counters, round: ps.round, meta: m.rngMeta.state(), shop: m.rngShop.state(), bots: m.rngBots.state(), pool: [...m.pool.entries] });

test('prep currency handlers preserve their separate economy recruitment value', () => {
  for (const key of ['SERVER_ONCE_GOLD', 'SERVER_ONCE_GOLD_WITH_BOND_CONDITION', 'SERVER_GAIN_FREE_REFRESH_COUNT']) assert.equal(customGrowthTrait(key), false);
  const { m, ps, gd } = setup();
  const economic = Object.values(DATA.chess).find(c => c.visible && !c.isGolden && c.garrisonIds.some(id => {
    const g = gd.garrison(id); return g.effectKey === 'SERVER_ONCE_GOLD' && g.eventType === 'SERVER_GAIN';
  }));
  assert.ok(economic);
  const p = give(m, ps, economic.chessId, 'hand');
  const before = snapshot(m, ps), result = previewPrep(gd, ps, { event: 'SERVER_GAIN', only: p });
  assert.equal(result.funds, ps.funds, 'the currency reward is pending, not spendable immediately');
  assert.ok(result.pendingFunds > ps.pendingFunds, 'the preview still runs the real currency handler');
  assert.equal(snapshot(m, ps), before); m.dispose();
});

for (const [main, prefs] of Object.entries(SUB_BOND_ROUTES).filter(([id]) => id !== 'egirShip')) test(`main ${main}: proactive primary sub-bond route before owning its first card`, () => {
  const { m, ps } = setup();
  const band = Object.values(DATA.bands).find(b => b.bondIds.includes(main)); ps.bandId = band.bandId;
  const plan = bondPlan(m, ps);
  assert.equal(plan.focus, main); assert.equal(plan.subBonds[0], prefs[0]); assert.equal(plan.subBonds.length, 2);
  assert.equal(plan.reason, 'specialty-reachable'); m.dispose();
});

test('all twelve specialty squads retain a reachable own core; absent Egir members have an explicit fallback', () => {
  const { m, ps } = setup();
  for (const b of Object.values(DATA.bands).filter(b => b.bondIds.length)) {
    ps.bandId = b.bandId; const p = bondPlan(m, ps);
    if (b.bondIds.includes('egirShip')) { assert.notEqual(p.focus, 'egirShip'); assert.equal(p.reason, 'specialty-unreachable'); }
    else assert.ok(b.bondIds.includes(p.focus), b.name);
  }
  m.dispose();
});

test('item grants change member counts and the plan; normal/elite count as one identity', () => {
  const { m, ps, gd } = setup();
  const a = put(m, ps, '莱恩哈特', [10,4]), b = put(m, ps, '莱恩哈特', null, true);
  const morph = Object.values(DATA.items).find(i => i.canGiveBond && !i.isGolden);
  const hammer = Object.values(DATA.items).find(i => i.giveBondId === 'victoriaShip' && !i.isGolden && !i.canGiveBond);
  const before = planOwnedBonds(gd, ps); assert.equal(before.counts.get('preciShip'), 1);
  a.items = [{ id: morph.id }, { id: hammer.id }];
  const after = planOwnedBonds(gd, ps); assert.equal(after.counts.get('victoriaShip'), 1); assert.ok(b);
  m.dispose();
});

test('Archetto start and Cliffheart end are different events; elite copy parameters come from the target', () => {
  const { m, ps, gd } = setup();
  const copy = put(m, ps, '白面鸮', [10,3]); copy.dir = 'RIGHT';
  put(m, ps, '空弦', [10,4], true); put(m, ps, '至简', [10,5]);
  ps.layers = {}; activate(ps, ['skillfulShip', 'lateranoShip']);
  const before = snapshot(m, ps);
  const start = previewPrep(gd, ps, { event: 'SERVER_PREP_START', round: 7 });
  assert.equal(start.gains.skillfulShip, 24); assert.equal(start.gains.lateranoShip, 12);
  assert.equal(snapshot(m, ps), before);
  ps.board.set('10,4', { ...ps.board.get('10,4'), id: rec('断崖', true).chessId });
  const wrong = previewPrep(gd, ps, { event: 'SERVER_PREP_START', round: 7 });
  assert.deepEqual(wrong.gains, {}); m.dispose();
});

test('copy loops terminate without gains, funds or RNG changes', () => {
  const { m, ps, gd } = setup();
  const a = put(m, ps, '白面鸮', [10,3]), b = put(m, ps, '白面鸮', [10,4]);
  a.dir = 'RIGHT'; b.dir = 'LEFT'; const before = snapshot(m, ps);
  assert.deepEqual(previewPrep(gd, ps, { event: 'SERVER_PREP_START', round: 7 }).gains, {});
  assert.equal(snapshot(m, ps), before); m.dispose();
});

test('combined Dusk/Logos end-prep gains match production dispatch, including a Saria copy', () => {
  const { m, ps, gd } = setup();
  const copy = put(m, ps, '塞雷娅', [12,3]); copy.dir = 'RIGHT'; put(m, ps, '夕', [12,4]); put(m, ps, '溯光星源', [11,4]);
  ps.layers = {}; ps.round.gainedChess = 5; ps.round.spent = 17;
  for (const id of ['yanShip', 'arcaneShip', 'skillfulShip']) ps.bondCountBonus[id] = 20;
  ps.recompute();
  const before = snapshot(m, ps), preview = previewPrep(gd, ps, { round: 6 });
  assert.equal(preview.gains.yanShip, 20); assert.equal(preview.gains.skillfulShip, 10); assert.equal(preview.gains.arcaneShip, 30);
  assert.equal(snapshot(m, ps), before);
  m.dispatch(ps, 'onPrepEnd', { round: 6 });
  for (const [id, n] of Object.entries(preview.gains)) assert.equal(ps.layers[id], n, id);
  m.dispose();
});

test('Nymph counts only regular hand chess, and her elite doubles the per-body amount', () => {
  const { m, ps, gd } = setup(); put(m, ps, '妮芙', [10,4]);
  for (const n of ['角峰','跃跃','深靛','野鬃','小满','折桠','雪猎']) put(m, ps, n);
  ps.temp[0] = { uid: 9000, kind: 'chess', id: rec('夕').chessId };
  const slot = ps.hand.indexOf(null); ps.hand[slot] = { uid: 9001, kind: 'item', id: Object.keys(DATA.items)[0] };
  ps.layers = {}; activate(ps, ['swiftShip']);
  assert.equal(previewPrep(gd, ps, { round: 6 }).gains.swiftShip, 14);
  ps.board.get('10,4').id = rec('妮芙', true).chessId;
  assert.equal(previewPrep(gd, ps, { round: 6 }).gains.swiftShip, 28);
  assert.ok(growthBenchBudget(gd, ps, 4) > 4); m.dispose();
});

test('Columbia beginning spends one shared budget in board order, not a fresh budget for each operator', () => {
  const { m, ps, gd } = setup(); put(m, ps, '赫默', [12,3]); put(m, ps, '山', [11,3]); put(m, ps, '谬因', [10,3]);
  ps.layers = {}; ps.funds = 21; activate(ps, ['columbiaShip','visiShip','preciShip']);
  const p = previewPrep(gd, ps, { event: 'SERVER_PREP_START', round: 7 });
  assert.equal(p.funds, 15); assert.equal(p.gains.columbiaShip, 34); assert.equal(p.gains.preciShip, 20); assert.equal(p.gains.visiShip, 4);
  m.dispose();
});

test('two investments share money and caps; neither forecast writes formal counters or RNG', () => {
  const { m, ps, gd } = setup(); put(m, ps, '星极', [12,3]); put(m, ps, '星极', [11,3]);
  ps.layers = { columbiaShip: 998 }; ps.funds = 5; activate(ps, ['columbiaShip']); const before = snapshot(m, ps);
  const p = previewPrep(gd, ps, { round: 6 }); assert.equal(p.gains.columbiaShip, 1); assert.equal(p.funds, 0);
  assert.equal(snapshot(m, ps), before); m.dispose();
});

test('ordinary and elite acquisition use Investor x2/x3; held acquisition rewards are never reissued', () => {
  const { m, ps, gd } = setup(); const c = rec('雪猎');
  activate(ps, ['investShip']); ps.layers.investShip = 100;
  const probe = { uid: -1, id: c.chessId, kind: 'chess', area: 'hand', items: [] };
  const a = previewPrep(gd, ps, { event: 'SERVER_GAIN', round: 6, only: probe });
  assert.equal(a.gains.kjeragShip, 15); assert.equal(a.gains.preciShip, 15);
  const held = previewPrep(gd, ps, { round: 6, only: probe }); assert.deepEqual(held.gains, {}); m.dispose();
});

test('battle growth distinguishes sleep entries, deployment, source grants and boss prohibitions', () => {
  const { m, ps, gd } = setup(); put(m, ps, '缇缇', [10,4]); put(m, ps, '锏', [10,5]);
  ps.layers = {}; activate(ps, ['sargonShip','preciShip','swiftShip','kjeragShip','kazimierzShip']);
  const battle = previewBattleGrowth(gd, ps, 6);
  assert.ok(battle.gains.preciShip > 0 && battle.gains.swiftShip >= 8);
  assert.equal(previewBattleGrowth(gd, ps, gd.bossRound).gains.preciShip, undefined);
  assert.deepEqual(previewBattleGrowth(gd, ps, gd.hiddenRound).gains, {});
  ps._botGrowthContext = { layerGainsEnabled: true, controlSusceptible: 0 };
  assert.equal(previewBattleGrowth(gd, ps, 6).gains.preciShip, undefined); m.dispose();
});

test('skill cycle respects ammo count, attack recovery, elite cost and capped Swift refunds', () => {
  const { m, ps, gd } = setup(); const p = put(m, ps, '隐现', [10,4]); const c = gd.chess(p.id);
  const base = skillCycle(gd, ps, c, p, 90); assert.ok(base.duration > 5, 'full ammo magazine, not one bullet');
  activate(ps, ['swiftShip']); ps.layers.swiftShip = 229;
  const capped = skillCycle(gd, ps, c, p, 90); ps.layers.swiftShip = 999;
  assert.equal(skillCycle(gd, ps, c, p, 90).period, capped.period); assert.ok(capped.casts >= base.casts);
  const before = snapshot(m, ps); forecastGrowth(gd, ps, [p], 6); assert.equal(snapshot(m, ps), before); m.dispose();
});

test('safe growth layout keeps every usable attacker facing targets and preserves formal state', () => {
  const { m, ps } = setup(); const a = put(m, ps, '空弦', [10,4]), b = put(m, ps, '白面鸮', [10,3]);
  put(m, ps, '角峰', [10,6]); const pieces = [a,b,...ps.board.values()].filter((p,i,a)=>a.findIndex(q=>q.uid===p.uid)===i);
  const base = planLayout(m, ps, pieces), before = snapshot(m, ps);
  const improved = runSteps(improveGrowthLayoutSteps(m, ps, pieces, base));
  assert.equal(snapshot(m, ps), before); assert.equal(improved.size, base.size);
  const routes = new Set(fieldModel(m, ps).routes.flatMap(r=>r.tiles));
  for (const p of pieces.filter(p=>DATA.chess[p.id].attackKind !== 'heal')) {
    const [r,c] = improved.get(p.uid).split(',').map(Number);
    const [br,bc] = base.get(p.uid).split(',').map(Number);
    if (rangeTiles(DATA.chess[p.id],br,bc,base.dirOf(p.uid)).some(k=>routes.has(k))) assert.ok(rangeTiles(DATA.chess[p.id],r,c,improved.dirOf(p.uid)).some(k=>routes.has(k)));
  }
  m.dispose();
});
