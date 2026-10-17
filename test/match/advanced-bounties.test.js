import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, makeMatch } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';
import { advancedBountySets, generateDraft } from '../../server/match/choices.js';
import { setupMatchWaves, buildNormalWave, bountySpawns, gateOf } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { PHASE } from '../../shared/constants.js';
const cards = DATA.choices.cards.bounty.filter(c => c.advancedBounty);

test('advanced offers: 30 solo and 87 equiprobable legal multi sets; no R9 boss in the entire pool', () => {
  assert.equal(cards.length, 12);
  const oldIds = new Set(DATA.choices.bountyDrafts.boss.groups.flatMap(g => g.cards));
  const oldKeys = new Set(DATA.choices.cards.bounty.filter(c => oldIds.has(c.effectId)).map(c => c.enemyKey));
  assert.ok(cards.every(c => !oldKeys.has(c.enemyKey)));
  const solo = advancedBountySets(cards, true), multi = advancedBountySets(cards, false);
  assert.equal(solo.length, 30); assert.equal(multi.length, 87);
  assert.equal(new Set(multi.map(s => s.map(c => c.effectId).sort().join())).size, 87);
  const totals = {};
  for (const s of multi) {
    assert.equal(s.length, 6); assert.equal(new Set(s.map(c => c.enemyKey)).size, 6);
    const total = s.reduce((n, c) => n + c.coin, 0); totals[total] = (totals[total] || 0) + 1;
    assert.equal(s.filter(c => c.coin === 0).length, 1);
    assert.equal(s.filter(c => c.coin >= 3 && c.coin <= 5).length, 2);
    assert.equal(s.filter(c => c.coin >= 6 && c.coin <= 7).length, 2);
    assert.equal(s.filter(c => c.coin === 9).length, 1);
  }
  assert.deepEqual(totals, { 27: 3, 28: 18, 29: 33, 30: 33 });
  for (const s of solo) assert.deepEqual(s.map(c => c.coin === 0 ? 0 : c.coin <= 6 ? 1 : 2).sort(), [0, 1, 2]);
});

test('Catastrophe R12 only: deterministic uniform legal-set selection, prior schedules and 115-second limit kept', () => {
  for (const type of ['single', 'multi']) {
    const gd = new GameData(DATA, `mode_${type}_catastrophe`), seen = new Set();
    assert.deepEqual(gd.spRounds(), [3, 9, 11, 12]);
    assert.equal(gd.mode.rounds['12'].combatTimeLimit, 115);
    const base = DATA.choices.schedule[`mode_${type}_abyss`];
    for (const r of [3, 9, 11]) assert.deepEqual(gd.choices.schedule[gd.modeId].rounds[r], base.rounds[r]);
    for (let seed = 1; seed <= 2500; seed++) {
      const d = generateDraft(gd, createRng(seed * 7919), 12);
      assert.equal(d.family, 'bounty'); assert.equal(d.cards.length, type === 'single' ? 3 : 6);
      assert.ok(d.cards.every(c => c.advancedBounty && c.rounds === 1 && c.payout === 'kill'));
      seen.add(d.cards.map(c => c.id).sort().join());
      if (seed < 4) assert.deepEqual(d, generateDraft(gd, createRng(seed * 7919), 12));
    }
    assert.equal(seen.size, type === 'single' ? 30 : 87);
  }
  for (const m of Object.values(DATA.config.modes)) if (m.difficulty !== 'CATASTROPHE') assert.ok(!m.spRounds.includes(12));
});

test('each selected leader adds exactly one lower-lane target, normal R12 scaling and LP override; zero card stays kill/0', () => {
  for (const type of ['single', 'multi']) {
    const gd = new GameData(DATA, `mode_${type}_catastrophe`);
    for (let seed = 1; seed <= 12; seed++) {
      const rng = createRng(seed), setup = setupMatchWaves(gd, rng), wave = buildNormalWave(gd, rng, setup, 12);
      for (const card of cards) {
        const specs = bountySpawns(gd, 12, wave, [{ id: 'a', card }], 'p1');
        assert.equal(specs.length, 1); const s = specs[0];
        assert.equal(s.count, 1); assert.equal(s.ownerPlayerId, 'p1'); assert.equal(s.mods.bountyLpr, 1);
        assert.equal(s.mods.hpMul, gd.enemyScale(12).hpMul); assert.equal(s.mods.atkMul, gd.enemyScale(12).atkMul);
        if (card.coin > 0) { assert.equal(gateOf(wave.routes[s.routeIndex].start, false), 'lower'); assert.equal(s.bounty.coins, card.coin); }
        else assert.equal(s.bounty, undefined);
      }
    }
  }
});

test('real shared R12 draft keeps seats, taken cards, reconnect view and picker-owned one-battle tasks', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'CATASTROPHE', humans: 3, fake: true }).start(), m = h.m;
  h.drive(() => m.phase === PHASE.ROUND_START && m.round === 12);
  h.run(() => m.phase === PHASE.SP_DRAFT);
  assert.equal(m.sp.cards.length, 6);
  const indices = [];
  for (let i = 0; i < 3; i++) {
    const pid = m.spTurn(), card = m.sp.cards.find(c => m.sp.taken[c.idx] == null);
    const view = m.publicView().sp;
    assert.equal(view.cards.length, 6);
    assert.deepEqual(m.handle(pid, { t: 'g.choice', idx: card.idx }), { ok: true });
    indices.push(card.idx);
    const task = h.ps(pid).bounties.find(b => b.card.effectId === card.id);
    assert.ok(task?.card.advancedBounty); assert.equal(task.roundsLeft, 1);
    assert.ok(![...m.players.values()].some(ps => ps.playerId !== pid && ps.bounties.some(b => b.card.effectId === card.id)));
  }
  assert.equal(new Set(indices).size, 3);
  h.sched.advance(1); assert.equal(m.phase, PHASE.PREP); m.dispose();
});

test('R12 reward remains pending until R13 prep and the selected task expires after that one battle', () => {
  const finalFunds = [];
  for (const coins of [0, 7]) {
    const h = makeMatch({ mode: 'solo', difficulty: 'CATASTROPHE', fake: true, seed: 17 }).start(), m = h.m;
    h.drive(() => m.phase === PHASE.PREP && m.round === 12);
    const ps = h.ps('p_0'); ps.funds = 0; ps.pendingFunds = 0;
    assert.equal(ps.bounties.filter(b => b.card.advancedBounty).length, 1);
    m.lastResults.set(ps.playerId, { coins, leaked: [], perfect: true, killed: 1, damageDealt: 100, layerGains: {} });
    m.settle({ leakers: [], helpers: [] }, null);
    assert.equal(ps.funds, 0); assert.equal(ps.pendingFunds, coins);
    assert.ok(!ps.bounties.some(b => b.card.advancedBounty));
    h.run(() => m.phase === PHASE.PREP && m.round === 13);
    assert.equal(ps.pendingFunds, 0); finalFunds.push(ps.funds); m.dispose();
  }
  assert.equal(finalFunds[1] - finalFunds[0], 7);
});
