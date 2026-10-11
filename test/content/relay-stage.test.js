import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../match/harness.js';
import { Grid } from '../../server/sim/grid.js';
import { buildDeployMap } from '../../server/match/board.js';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { canSelectStage } from '../../shared/stages.js';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { terrainInfo } from '../../public/js/ui/gameLogic/terrain.js';
import { classifyStage } from '../../public/js/render/board3d/layout.js';
import { parseStage } from '../../public/js/render/tiles.js';

const ID = 'local_relay_lab', stage = DATA.stages[ID];
test('relay: compact atlas, manual selection only, same enemy setup for the same seed', () => {
  assert.equal(stage.rows.length, 19);
  assert.ok(stage.rows.every(row => row.length === 21));
  assert.deepEqual([stage.deployTiles.normal.melee.length, stage.deployTiles.normal.rangedOnly.length], [14, 8]);
  for (const modeId of Object.keys(DATA.config.modes)) {
    assert.ok(canSelectStage(DATA, modeId, ID));
    assert.ok(!DATA.config.modes[modeId].stages.includes(ID));
    const gd = new GameData(DATA, modeId);
    const random = setupMatchWaves(gd, createRng(17)), chosen = setupMatchWaves(gd, createRng(17), ID);
    assert.equal(chosen.stageId, ID);
    assert.notEqual(random.stageId, ID);
    assert.deepEqual({ ...random, stageId: ID }, chosen);
  }
  assert.throws(() => setupMatchWaves(new GameData(DATA, 'mode_single_funny'), createRng(1), 'act1autochess_m02'));
});

test('relay: normal, union and every solo/paired boss walking route stays connected', () => {
  for (const [c1, starts] of [[10, [[9, 10], [12, 10]]], [20, [[9, 18], [12, 18]]]]) {
    const grid = new Grid(stage, { r0: 9, r1: 12, c0: 0, c1 });
    for (const p of starts) assert.ok(grid.findPath(...p, 9, 2), `normal/unite ${p}`);
  }
  const bossKeys = new Set(Object.values(DATA.bosses).map(b => b.enemyKey));
  for (const tpl of Object.values(DATA.waves).filter(t => t.bossId && t.kind !== 'training')) {
    // Runtime keeps BOSS_RECT even in solo: hidden boss parts can start beyond the player's deployment half.
    const grid = new Grid(stage, { r0: 0, r1: 5, c0: 0, c1: 20 });
    const leaderRoutes = new Set(tpl.spawns.filter(s => bossKeys.has(s.key)).map(s => s.routeIndex));
    for (const [idx, route] of tpl.routes.entries()) {
      if (route.motion !== 'WALK') continue;
      let at = route.start;
      const steps = route.steps || (route.checkpoints || []).map(p => ({ t: 'move', p }));
      for (const step of [...steps, { t: 'move', p: route.end }]) {
        if (!step.p) continue;
        if (step.t === 'appear') { at = step.p; continue; }
        const path = grid.findPath(...at, ...step.p);
        assert.ok(path, `${tpl.id} route ${idx}: ${at} -> ${step.p}`);
        if (leaderRoutes.has(idx)) assert.ok(path.every(([r,c]) => stage.rows[r][c] !== 'i'), `${tpl.id}: leader crosses infection`);
        at = step.p;
      }
    }
  }
});

test('relay: boss mirroring preserves legal operator positions; terrain is visible and explained', () => {
  const normal = buildDeployMap(stage), left = buildDeployMap(stage, { field: 'bossL' }), right = buildDeployMap(stage, { field: 'bossR' });
  assert.deepEqual(left, right);
  for (const [k, cls] of normal) {
    assert.ok(left.has(k), k);
    if (cls === 'melee') assert.equal(left.get(k), 'melee', k);
  }
  const pixi = parseStage(stage), three = classifyStage(stage);
  assert.ok(pixi[11][4].h > 0 && three[11][4].raised, 'originium platform is raised');
  assert.equal(terrainInfo(stage, 11, 4).key, 'infection');
  assert.equal(terrainInfo(stage, 11, 6).key, 'healing');
});

test('healing rune regenerates 3% max HP, ignores heal multipliers and stops on leaving', () => {
  const h = makeBattle({ stageId: ID, defs: { chess: { medic: chessRec({ id: 'medic', skill: null, stats: { maxHp: 3000, atk: 0 } }) } },
    units: [{ chessId: 'medic', row: 11, col: 6 }], autoFinish: false, timeLimit: 20 });
  h.step(); const u = h.unit('medic'); u.hp = 100;
  h.b.addBuff(u, { key: 'test:no-heal', flags: { noHeal: true, healFree: true }, mods: { healingTakenMul: 5 } });
  h.run(2); assert.equal(u.hp, 280);
  assert.ok(h.b.relocate(u, 10, 6)); h.step();
  const before = u.hp; h.run(2); assert.equal(u.hp, before);
  assert.equal(u.findBuff('terrain:healing'), null);
});

test('relay originium buffs both sides, damages shield and does not stack after repeated contact', () => {
  const h = makeBattle({ stageId: ID, defs: {
    chess: { caster: chessRec({ id: 'caster', profession: 'CASTER', skill: null, stats: { atk: 100, maxHp: 3000 } }) },
    enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 10000, atk: 100, speed: 0 }) },
  }, units: [{ chessId: 'caster', row: 11, col: 4 }], enemies: [{ key: 'enemy_dummy', pos: [9, 8] }], autoFinish: false, timeLimit: 10 });
  h.step(); const u = h.unit('caster'), e = h.enemy('enemy_dummy');
  h.b.addBuff(u, { key: 'test:shield', shield: 500 });
  h.run(2);
  assert.equal(u.s.atk, 130); assert.equal(e.s.atk, 130);
  assert.equal(u.s.aspd, 130); assert.equal(u.hp, 3000);
  assert.equal(u.findBuff('test:shield').shield, 340);
  assert.equal(u.buffs.filter(b => b.key === 'terrain:infection').length, 1);
});
