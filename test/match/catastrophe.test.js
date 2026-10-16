import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, SELECTABLE_DIFFICULTIES } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { canSelectStage } from '../../shared/stages.js';
import { GameData } from '../../server/match/gamedata.js';
import { SharedPool } from '../../server/match/pool.js';
import { bossPoolHp, hiddenEligible } from '../../server/match/finalAssault.js';
import { buildBossWave, setupMatchWaves } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { makeBattle, enemyRec, chessRec } from '../helpers/battleHarness.js';
import { DATA, makeMatch } from './harness.js';

const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} expected ${expected}`);

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

  test(`${type} shared pool doubles tiers V/VI including overrides, retaining take/return accounting`, () => {
    const pool = new SharedPool(gd);
    for (const chess of gd.visibleChess) {
      const expected = base.poolCopies(chess) * (base.tierOf(chess) >= 5 ? 2 : 1);
      assert.equal(gd.poolCopies(chess), expected, chess);
      assert.equal(pool.cap(chess), expected, chess);
      assert.equal(pool.take(chess, expected + 2), expected);
      assert.equal(pool.left(chess), 0);
      assert.equal(pool.give(chess, expected + 2), expected);
      assert.equal(pool.left(chess), expected);
    }
    assert.equal(pool.cap('chess_char_6_11_a'), 8, '缪尔赛思 override is doubled too');
  });

  test(`${type} every leader has ABYSS shared HP ×100, including multiplayer alive-count scaling`, () => {
    for (const boss of Object.keys(DATA.bosses)) for (const alive of [1, 2, 3, 4]) {
      assert.equal(bossPoolHp(gd, boss, alive), bossPoolHp(base, boss, alive) * 100, boss);
      assert.equal(gd.bossPoolHp(boss, alive), base.bossPoolHp(boss, alive) * 100, boss);
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
          approx(e.base.maxHp, rawHp * (spawn.mods?.hpMul ?? 1) * 100);
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
  assert.equal(e.s.maxHp, 200000);
  assert.equal(e.s.atk, 6000);
  assert.equal(e.s.def, 200);
  assert.equal(e.s.res, 30);
  const child = h.b.spawnEnemy('enemy_dummy', { pos: [11, 8], mods: e.mods });
  assert.deepEqual(child.base, e.base, 'a child inherits original wave mods, never 100× a second time');
  const summoned = h.b.spawnEnemy('enemy_dummy', { pos: [11, 8] });
  assert.equal(summoned.s.maxHp, 100000);
  assert.equal(summoned.s.atk, 2000);
});

for (const [type, expected] of [['phys', 40], ['arts', 35], ['true', 50], ['elemental', 50]]) {
  test(`天灾 ${type} HP damage has 95% reduction after mitigation`, () => {
    const h = field(), e = h.enemy('enemy_dummy');
    approx(h.b.dealDamage(null, e, { type, amount: 1000, canDodge: false }), expected);
    approx(e.hp, e.s.maxHp - expected);
    const ally = h.unit('op');
    approx(h.b.dealDamage(e, ally, { type: 'true', amount: 1000, canDodge: false }), 1000);
  });
}

test('天灾 hit-count enemies also get reduction, without changing element buildup or direct HP loss rules', () => {
  const h = field(), e = h.enemy('enemy_dummy');
  h.b.addBuff(e, { key: 'test:hitCount', flags: { hitCount: true } });
  approx(h.b.dealDamage(null, e, { type: 'true', amount: 1000, canDodge: false }), 0.05);
  const before = e.hp;
  h.b.loseHp(e, 100);
  approx(before - e.hp, 100);
  h.b.dealDamage(null, e, { type: 'element', element: 'burn', amount: 100 });
  approx(e.elem.burn, 100);
});

test('a real reborn 深池逐火战士 keeps ×100 HP in its hit-count husk form', () => {
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
  assert.equal(huskHp[1], huskHp[0] * 100);
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
