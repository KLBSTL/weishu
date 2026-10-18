import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { catastropheProbe } from '../helpers/catastropheProbe.js';

const CHROME = process.env.CHROME_PATH;
test('Catastrophe v2: Chromium/Node storage, cooldown, half-HP queue and synchronous burst exit match', {
  skip: !(process.env.SIM_E2E === '1' && CHROME && existsSync(CHROME)), timeout: 120000,
}, async () => {
  const { startServer } = await import('../../server/index.js');
  const P = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  let browser;
  try {
    browser = await P.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/sim/spec.js`);
    for (const kind of ['steel', 'concord', 'path']) {
      let spec = buildBattleSpec({ kind: 'hidden', round: 15, seed: 34, modeId: 'mode_single_catastrophe',
        stageId: 'act2autochess_m04', waveId: kind === 'steel' ? 'act1autochess_h08_01_s' : 'act1autochess_h08_03_s',
        boss: { poolHp: 1e6, poolMax: 1e6 }, players: [{ playerId: 'p1', side: 'L',
          units: [{ uid: 1, chessId: 'chess_char_1_01_a', row: 10, col: 4, dir: 'RIGHT', items: [] }] }],
      });
      if (kind === 'path') {
        spec = buildBattleSpec({ kind: 'normal', round: 1, seed: 4, modeId: 'mode_single_catastrophe', stageId: 'act2autochess_m04',
          timeLimit: 90, routes: [{ motion: 'WALK', start: [9,10], end: [9,2], checkpoints: [] }],
          spawns: [{ enemyKey: 'enemy_1422_lrsldr', routeIndex: 0, count: 1, time: 0 }] });
      }
      const expected = JSON.parse(JSON.stringify(catastropheProbe(createBattleFromSpec(spec, getDefaultSource(), { quiet: true }), kind)));
      assert.deepEqual(expected.errors, []);
      const actual = await page.evaluate(async (spec, source, kind) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const { spec: S, ds } = await loadBrowserSim();
        const probe = new Function(`return (${source})`)();
        return probe(S.createBattleFromSpec(spec, ds, { quiet: true }), kind);
      }, spec, catastropheProbe.toString(), kind);
      assert.deepEqual(actual, expected, kind);
      if (kind === 'steel') {
        assert.equal(actual.mechanics.cast1[0], 0); assert.equal(actual.mechanics.cast1[4], 20000);
        assert.equal(actual.mechanics.casts, 2); assert.equal(actual.mechanics.armours, 3);
        assert.equal(actual.mechanics.sp, 0); assert.equal(actual.mechanics.snapshot, 70);
      }
      else if (kind === 'concord') { assert.equal(actual.mechanics.expelledImmediately, true); assert.equal(actual.mechanics.queued, true);
        assert.equal(actual.mechanics.free, true); assert.equal(actual.mechanics.sp, 13); }
      else { assert.equal(actual.mechanics.walls, 0); assert.ok(actual.mechanics.wetFrames > 0); }
    }
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await srv.close(); }
});
