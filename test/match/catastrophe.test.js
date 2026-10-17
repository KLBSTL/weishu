import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, SELECTABLE_DIFFICULTIES } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { canSelectStage } from '../../shared/stages.js';
import { GameData } from '../../server/match/gamedata.js';
import { SharedPool } from '../../server/match/pool.js';
import { bossPoolHp, hiddenEligible } from '../../server/match/finalAssault.js';
import { buildBossWave, buildNormalWave, setupMatchWaves, gateOf } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { makeBattle, enemyRec, chessRec } from '../helpers/battleHarness.js';
import { DATA, makeMatch } from './harness.js';

const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} expected ${expected}`);

test('天灾 starts with 4 regular candidates; two distinct lane types preserve same-seed ABYSS counts/timing/routes', () => {
  for (const type of ['single', 'multi']) for (let seed = 1; seed <= 40; seed++) {
    const gd = new GameData(DATA, `mode_${type}_catastrophe`), base = new GameData(DATA, `mode_${type}_abyss`);
    const setup = setupMatchWaves(gd, createRng(seed)), original = setupMatchWaves(base, createRng(seed));
    assert.equal(new Set(setup.factions).size, 4);
    assert.deepEqual(setup.picks, original.picks, 'R14/R15 and the baseline action counts retain the ABYSS schedule');
    const again = setupMatchWaves(gd, createRng(seed));
    assert.deepEqual(setup.lanePicks, again.lanePicks);
    for (let round = 1; round <= 13; round++) {
      const wave = buildNormalWave(gd, createRng(5), setup.factions, round);
      const old = buildNormalWave(base, createRng(5), original.factions, round);
      assert.notEqual(wave.lanePicks.upper.type, wave.lanePicks.lower.type);
      for (const p of Object.values(wave.lanePicks)) assert.ok([...setup.factions, 'SPECIAL'].includes(p.type));
      assert.deepEqual(wave.spawns.map(s => [s.count, s.time, s.interval, s.routeIndex]), old.spawns.map(s => [s.count, s.time, s.interval, s.routeIndex]));
      assert.deepEqual(wave.routes, old.routes);
      for (const s of wave.spawns) {
        const pick = wave.lanePicks[gateOf(wave.routes[s.routeIndex].start, false)];
        assert.ok([pick.key, pick.normal, pick.elite].includes(s.enemyKey));
      }
    }
  }
});

test('天灾 R1–13 speed ×1.5 applies once to spawns and inherited summons, never to R14/R15', () => {
  for (const round of [1, 4, 13, 14, 15]) {
    const h = makeBattle({ modeId: 'mode_multi_catastrophe', round, kind: round <= 13 ? 'normal' : round === 14 ? 'boss' : 'hidden',
      content: 'none', autoFinish: false, defs: { enemies: { fast: enemyRec({ key: 'fast', speed: 1 }) } } }).step();
    const u = h.spawn('fast', { pos: [10, 7], mods: { speedMul: 1.15 } });
    const child = h.spawn('fast', { pos: [10, 8], mods: u.mods });
    approx(u.s.moveSpeed, 1.15 * (round <= 13 ? 1.5 : 1));
    approx(child.s.moveSpeed, u.s.moveSpeed);
  }
});

test('R15 has ×2 HP and 50% physical/Arts reduction without R14 carry-over', () => {
  const h = field({ round: 15, kind: 'hidden' }), e = h.enemy('enemy_dummy');
  assert.equal(e.s.maxHp, 4000);
  for (const [type, expected] of [['phys', 490], ['arts', 450], ['true', 1000], ['elemental', 1000]]) {
    approx(h.b.dealDamage(null, e, { type, amount: 1000 }), expected);
  }
});

test('天灾 replaces 标准 in the four UI choices while legacy records remain readable', () => {
  assert.deepEqual(SELECTABLE_DIFFICULTIES, ['NORMAL', 'HARD', 'ABYSS', 'CATASTROPHE']);
  assert.ok(DIFFICULTIES.includes('FUNNY'));
  assert.equal(validateC2S({ t: 'room.create', mode: 'solo', difficulty: 'CATASTROPHE' }), null);
  assert.equal(validateC2S({ t: 'room.setDifficulty', difficulty: 'CATASTROPHE' }), null);
});

for (const type of ['single', 'multi']) {
  const id = `mode_${type}_catastrophe`, baseId = `mode_${type}_abyss`;
  const gd = new GameData(DATA, id), base = new GameData(DATA, baseId);

  test(`${type} 天灾 preserves the ABYSS rounds, drafts, stages and hidden eligibility`, () => {
    assert.equal(gd.difficulty, 'CATASTROPHE');
    assert.equal(gd.bossRound, 14);
    assert.equal(gd.hiddenRound, 15);
    assert.deepEqual(gd.mode.rounds, base.mode.rounds);
    assert.deepEqual(gd.mode.stages, base.mode.stages);
    assert.deepEqual(gd.mode.shopSlots, base.mode.shopSlots);
    assert.deepEqual(gd.choices.schedule[id], base.choices.schedule[baseId]);
    assert.deepEqual(gd.bans(gd.difficulty), base.bans(base.difficulty));
    assert.equal(hiddenEligible(gd, { layerSum: 10000, teamLp: 26 }), true);
    assert.equal(hiddenEligible(gd, { layerSum: 1, teamLp: 26 }), false);
    for (const stage of gd.mode.stages) assert.equal(canSelectStage(DATA, id, stage), true);
    for (let r = 1; r <= 15; r++) assert.deepEqual(gd.baseEnemyScale(r), base.baseEnemyScale(r));
  });

  test(`${type} shared pool retains ABYSS stock including tier V/VI overrides`, () => {
    const pool = new SharedPool(gd);
    for (const chess of gd.visibleChess) {
      const expected = base.poolCopies(chess);
      assert.equal(gd.poolCopies(chess), expected, chess);
      assert.equal(pool.cap(chess), expected, chess);
      assert.equal(pool.take(chess, expected + 2), expected);
      assert.equal(pool.left(chess), 0);
      assert.equal(pool.give(chess, expected + 2), expected);
      assert.equal(pool.left(chess), expected);
    }
    assert.equal(pool.cap('chess_char_6_11_a'), 4, '缪尔赛思 keeps its original override');
  });

  test(`${type} final/hidden leaders have ABYSS shared HP ×1.5/×2, including alive-count scaling`, () => {
    for (const boss of Object.keys(DATA.bosses)) for (const alive of [1, 2, 3, 4]) {
      const mul = DATA.bosses[boss].hidden ? 2 : 1.5;
      assert.equal(bossPoolHp(gd, boss, alive), bossPoolHp(base, boss, alive) * mul, boss);
      assert.equal(gd.bossPoolHp(boss, alive), base.bossPoolHp(boss, alive) * mul, boss);
      assert.equal(gd.bossPoolHp(boss, alive), bossPoolHp(gd, boss, alive));
    }
  });

  test(`${type} can start a real 天灾 match and enter preparation`, () => {
    const h = makeMatch({ mode: type === 'single' ? 'solo' : 'coop', difficulty: 'CATASTROPHE', humans: 1, fake: true });
    try {
      h.autoHumans().start(); h.runToPhase('PREP');
      assert.equal(h.m.modeId, id);
      assert.equal(h.m.gd.difficulty, 'CATASTROPHE');
      h.invariants();
    } finally { h.m.dispose(); }
  });

  for (const round of [14, 15]) test(`${type} R${round} real boss wave and JSON client replica scale leaders, parts and escorts`, () => {
    const setup = setupMatchWaves(gd, createRng(12));
    const weights = gd.bossWeights(round === 15);
    for (const bossId of Object.keys(weights)) {
      const wave = buildBossWave(gd, createRng(31), setup.factions, round, { bossId, solo: gd.isSolo });
      const hp = bossPoolHp(gd, bossId, 1);
      const spec = buildBattleSpec({ kind: round === 14 ? 'boss' : 'hidden', modeId: id, round, seed: 5,
        stageId: setup.stageId, timeLimit: null, players: [], spawns: [], routes: wave.routes,
        enemyOverrides: wave.overrides, bossId, boss: { poolHp: hp, poolMax: hp } });
      const b = createBattleFromSpec(spec, DATA, { quiet: true });
      const replica = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), DATA, { quiet: true });
      for (const spawn of wave.spawns.filter(s => gd.enemy(s.enemyKey))) {
        const opts = { ...spawn, pos: [3, 8] };
        const e = b.spawnEnemy(spawn.enemyKey, opts), copy = replica.spawnEnemy(spawn.enemyKey, opts);
        if (e.isBoss) assert.equal(e.s.maxHp, hp, `${bossId} shared pool`);
        else if (!e.s.flags.hitCount && !e.s.flags.hitCountArts) {
          const def = b.data.getEnemy(spawn.enemyKey);
          const rawHp = wave.overrides?.[spawn.enemyKey]?.stats?.maxHp ?? def.maxHp;
          approx(e.base.maxHp, rawHp * (spawn.mods?.hpMul ?? 1) * (round === 15 ? 2 : 1.5));
        }
        assert.deepEqual(e.base, copy.base, `${bossId} client/server spawn stats`);
        assert.equal(e.hp, copy.hp);
      }
      assert.ok(b.enemies.some(e => e.isBoss), `${bossId} contains a leader`);
    }
  });
}

function field({ modeId = 'mode_multi_catastrophe', round = 14, kind = 'boss' } = {}) {
  const h = makeBattle({ modeId, round, kind, content: 'none',
    defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1000, atk: 200, def: 20, res: 10, speed: 0 }) },
      chess: { op: chessRec({ id: 'op', stats: { maxHp: 10000 } }) } },
    units: [{ chessId: 'op', row: 9, col: 3 }],
    enemies: [{ key: 'enemy_dummy', pos: [11, 8], mods: { hpMul: 2, atkMul: 3 } }],
  });
  h.step();
  return h;
}

test('all 天灾 spawn routes apply once, including inherited mods on dynamic summons', () => {
  const h = field(), e = h.enemy('enemy_dummy');
  assert.equal(e.s.maxHp, 3000);
  assert.equal(e.s.atk, 600);
  assert.equal(e.s.def, 20);
  assert.equal(e.s.res, 10);
  const child = h.b.spawnEnemy('enemy_dummy', { pos: [11, 8], mods: e.mods });
  assert.deepEqual(child.base, e.base, 'a child inherits original wave mods, never applies the stage multiplier twice');
  const summoned = h.b.spawnEnemy('enemy_dummy', { pos: [11, 8] });
  assert.equal(summoned.s.maxHp, 1500);
  assert.equal(summoned.s.atk, 200);
});

for (const [type, expected] of [['phys', 735], ['arts', 675], ['true', 1000], ['elemental', 1000]]) {
  test(`天灾 R14 ${type} has only the confirmed physical/Arts reduction`, () => {
    const h = field(), e = h.enemy('enemy_dummy');
    approx(h.b.dealDamage(null, e, { type, amount: 1000, canDodge: false }), expected);
    approx(e.hp, e.s.maxHp - expected);
    const ally = h.unit('op');
    approx(h.b.dealDamage(e, ally, { type: 'true', amount: 1000, canDodge: false }), 1000);
  });
}

test('hit-count enemies ignore every damage reduction, preserving element buildup and direct HP loss', () => {
  const h = field(), e = h.enemy('enemy_dummy');
  h.b.addBuff(e, { key: 'test:hitCount', flags: { hitCount: true } });
  h.b.addBuff(e, { key: 'all-guard', mods: { dmgTakenMul: .01, physTakenMul: .01, artsTakenMul: .01, trueTakenMul: .01, elementalTakenMul: .01 } });
  for (const type of ['phys', 'arts', 'true', 'elemental']) approx(h.b.dealDamage(null, e, { type, amount: 1000, canDodge: false }), 1);
  const before = e.hp;
  h.b.loseHp(e, 100);
  approx(before - e.hp, 100);
  h.b.dealDamage(null, e, { type: 'element', element: 'burn', amount: 100 });
  approx(e.elem.burn, 100);
});

test('a real reborn 深池逐火战士 retains the R14 multiplier in its hit-count husk form', () => {
  const huskHp = [];
  for (const modeId of ['mode_multi_abyss', 'mode_multi_catastrophe']) {
    const b = createBattleFromSpec(buildBattleSpec({ modeId, round: 14, kind: 'boss',
      seed: 7, players: [], spawns: [], routes: [] }), DATA, { quiet: true });
    const e = b.spawnEnemy('enemy_1288_duskls', { pos: [3, 5] });
    b.loseHp(e, e.s.maxHp + 1);
    assert.equal(e.alive, true);
    assert.equal(e.s.flags.hitCount, true);
    huskHp.push(e.s.maxHp);
  }
  assert.equal(huskHp[1], Math.round(huskHp[0] * 1.5));
});

for (const settings of [{ round: 13 }, { round: 14, kind: 'normal' }, { modeId: 'mode_multi_abyss' }, { modeId: 'mode_single_hard' }]) {
  test(`ordinary stats and damage stay unchanged: ${JSON.stringify(settings)}`, () => {
    const h = field(settings), e = h.enemy('enemy_dummy');
    assert.equal(e.s.maxHp, 2000);
    assert.equal(e.s.atk, 600);
    assert.equal(e.s.def, 20);
    assert.equal(e.s.res, 10);
    approx(h.b.dealDamage(null, e, { type: 'true', amount: 1000 }), 1000);
  });
}
