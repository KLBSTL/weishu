import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../match/harness.js';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves, buildNormalWave, isFlyKey } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { Grid } from '../../server/sim/grid.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { compileRoute } from '../../server/sim/ai.js';
import { GEO } from '../../shared/constants.js';
import { spawnChildren, stepGroundToward } from '../../server/sim/content/enemies/helpers.js';

test('涨潮控制: seed 4 R1 ground substitutions never inherit the flying wall checkpoints', () => {
  const gd = new GameData(DATA, 'mode_single_catastrophe');
  const setup = setupMatchWaves(gd, createRng(4));
  const wave = buildNormalWave(gd, createRng(5), setup.factions, 1);
  const spawn = wave.spawns.find(s => s.routeIndex === 2);
  assert.equal(spawn.enemyKey, 'enemy_1043_zomsbr');
  const h = makeBattle({ stageId: 'act2autochess_m04', content: 'none', autoFinish: false,
    modeId: gd.modeId, round: 1, routes: wave.routes, timeLimit: 120 });
  const e = h.spawn(spawn.enemyKey, spawn);
  for (let i = 0; i < 3600 && e.alive; i++) {
    h.step();
    assert.ok(h.b.grid.walkable(Math.round(e.y), Math.round(e.x)),
      `t=${h.b.time}: WALK entered (${e.y},${e.x})`);
  }
  assert.equal(e.alive, false, 'reaches the blue door');
});

test('天灾 lane replacements: every effective ground leg remains reachable on 涨潮控制, both gates, all R1–13', () => {
  const gd = new GameData(DATA, 'mode_multi_catastrophe');
  const g = new Grid(getDefaultSource().getStage('act2autochess_m04'), GEO.NORMAL_RECT);
  let substitutions = 0, flights = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const setup = setupMatchWaves(gd, createRng(seed));
    for (let round = 1; round <= 13; round++) {
      const wave = buildNormalWave(gd, createRng(5), setup.factions, round);
      for (const s of wave.spawns) {
        const route = s.route ?? wave.routes[s.routeIndex];
        const fly = isFlyKey(gd, s.enemyKey);
        assert.equal(route.motion === 'FLY', fly, `${seed}/${round}/${s.enemyKey}`);
        if (s.route) substitutions++;
        if (fly) { flights++; continue; }
        let pos = route.start;
        for (const leg of compileRoute(route, GEO.NORMAL_RECT)) {
          if (leg.t === 'appear') pos = [leg.r, leg.c];
          if (leg.t !== 'move') continue;
          assert.ok(g.waypoints(...pos, leg.r, leg.c), `${seed}/${round}: ${pos} -> ${leg.r},${leg.c}`);
          pos = [leg.r, leg.c];
        }
      }
    }
  }
  assert.ok(substitutions > 100); assert.ok(flights > 100);
});

test('涨潮控制 movement: ground enters/leaves water with speed changes; flyers keep flight and ignore water', () => {
  for (const motion of ['WALK', 'FLY']) {
    const key = `probe_${motion}`;
    const h = makeBattle({ stageId: 'act2autochess_m04', autoFinish: false, timeLimit: 100,
      defs: { enemies: { [key]: enemyRec({ key, hp: 1e8, motion, speed: 1 }) } } });
    const e = h.spawn(key, { route: { motion, start: [9, 10], end: [9, 2], checkpoints: [] } });
    let wet = false, left = false;
    for (let i = 0; i < 2500 && e.alive; i++) {
      h.step();
      if (motion === 'FLY') { assert.equal(e.findBuff('terrain:deepsea'), null); continue; }
      assert.ok(h.b.grid.walkable(Math.round(e.y), Math.round(e.x)));
      if (e.findBuff('terrain:deepsea')) { wet = true; assert.ok(e.s.moveSpeed < 1); }
      else if (wet && e.alive) { left = true; assert.equal(e.s.moveSpeed, 1); }
    }
    assert.equal(e.alive, false);
    if (motion === 'WALK') { assert.ok(wet); assert.ok(left); }
    assert.deepEqual(h.b.errors, []);
  }
});

test('ground never walks straight through an unreachable checkpoint or a hard block; reopening the path resumes it', () => {
  const h = makeBattle({ content: 'none', autoFinish: false, timeLimit: 100,
    defs: { enemies: { probe: enemyRec({ key: 'probe', speed: 1 }) } } });
  for (let r = 9; r <= 12; r++) h.b.grid.setObstacle(r, 7, true);
  const e = h.spawn('probe', { route: { motion: 'WALK', start: [9, 10], end: [9, 2], checkpoints: [] } });
  h.run(10); assert.equal(e.x, 10); assert.ok(e.alive); assert.equal(e.moving, false);
  h.b.grid.setObstacle(9, 7, false); h.run(20); assert.equal(e.alive, false);
  const h2 = makeBattle({ stageId: 'act2autochess_m04', content: 'none', autoFinish: false,
    defs: { enemies: { probe: enemyRec({ key: 'probe', speed: 1 }) } } });
  const invalid = h2.spawn('probe', { route: { motion: 'WALK', start: [9, 6], end: [9, 5], checkpoints: [] } });
  h2.run(10); assert.equal(invalid.x, 6); assert.equal(invalid.y, 9); assert.ok(invalid.alive);
});

test('flying death drops/spread never place WALK children in walls or retain aerial wall checkpoints', () => {
  const h = makeBattle({ stageId: 'act2autochess_m04', content: 'none', autoFinish: false, timeLimit: 120,
    defs: { enemies: { parent: enemyRec({ key: 'parent', motion: 'FLY' }), child: enemyRec({ key: 'child', hp: 1e8, speed: 1 }) } } });
  const p = h.spawn('parent', { pos: [10, 5], route: { motion: 'FLY', start: [10, 5], end: [9, 2],
    checkpoints: [{ type: 'MOVE', pos: [12, 5] }, { type: 'MOVE', pos: [9, 5] }] } });
  const children = spawnChildren(h.b, p, 'child', 3);
  assert.equal(children.length, 3);
  for (const c of children) {
    assert.ok(h.b.grid.groundPassable(Math.round(c.y), Math.round(c.x)));
    assert.equal(c.route.legs.length, 1, 'ground route to the goal, no aerial patrol');
  }
  for (let i = 0; i < 2700 && children.some(c => c.alive); i++) {
    h.step(); for (const c of children) assert.ok(h.b.grid.walkable(Math.round(c.y), Math.round(c.x)));
  }
  assert.ok(children.every(c => !c.alive));
});

test('ground spring pursuit goes around fences/water and can then resume its ordinary route', () => {
  const h = makeBattle({ stageId: 'act2autochess_m04', kind: 'boss', content: 'none', autoFinish: false,
    defs: { enemies: { probe: enemyRec({ key: 'probe', speed: 1 }) } } });
  const e = h.spawn('probe', { pos: [3, 9] });
  let arrived = false;
  for (let i = 0; i < 1000 && !arrived; i++) {
    arrived = stepGroundToward(h.b, e, 3, 2, .05);
    assert.ok(h.b.grid.groundPassable(Math.round(e.y), Math.round(e.x)));
  }
  assert.ok(arrived); assert.equal(e.x, 3); assert.equal(e.y, 2);
});
