import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';
import { getDefaultSource, spawnsFromTemplate } from '../../server/sim/simdata.js';
import { COLUMBIA_ROSTER } from '../../tools/columbia-data.mjs';

const CHROME = process.env.CHROME_PATH;
test('Columbia normal/elite browser-server parity, assets and live combat stats', {
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
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${srv.port}/sim/spec.js`);
    const ds = getDefaultSource();
    for (const form of ['a', 'b']) {
      const ids = COLUMBIA_ROSTER.map(([code, , tier, old]) => (old ?? `chess_char_${tier}_columbia_${code}_a`).replace(/_a$/, `_${form}`));
      const spec = buildBattleSpec({ seed: 781, kind: 'normal', round: 6, stageId: 'act2autochess_m01', timeLimit: 100,
        players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, playerEffects: [],
          bonds: { columbiaShip: { count: 10, active: true, tier: 2, layers: 80 } },
          units: ids.map((chessId, i) => ({ uid: i + 1, chessId, row: 10 + Math.floor(i / 5), col: 3 + i % 5, dir: 'RIGHT',
            items: i === 9 ? [`chess_item_3_columbia_chip_e_${form}`, `chess_item_6_columbia_field_e_${form}`] : [] })),
        }], ...spawnsFromTemplate(ds.getWave('act1autochess_06')) });
      const nb = createBattleFromSpec(spec, ds, { quiet: true });
      const expectedHits = { blast: 0, burn: 0 };
      nb.on('damaged', c => {
        if (c.dmg.tags?.includes('bond:columbia:burst')) expectedHits.blast++;
        if (c.dmg.tags?.includes('bond:columbia:dot')) expectedHits.burn++;
      });
      const expected = resultDigest(nb.runToEnd(4000)).hash;
      assert.deepEqual(nb.errors, []);
      const result = await page.evaluate(async ({ spec, form }) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const { spec: S, ds } = await loadBrowserSim();
        const b = S.createBattleFromSpec(spec, ds, { quiet: true });
        const hits = { blast: 0, burn: 0 };
        b.on('damaged', c => {
          if (c.dmg.tags?.includes('bond:columbia:burst')) hits.blast++;
          if (c.dmg.tags?.includes('bond:columbia:dot')) hits.burn++;
        });
        const end = b.runToEnd(4000);
        const unit = b.allyUnits.filter(u => u.kind === 'op').sort((a, b) => b.stats.dmg - a.stats.dmg)[0];
        const { unitStatsEntry } = await import('/shared/protocol.js');
        const { loadData } = await import('/js/data.js');
        await loadData('chess', 'assets');
        const { chessStatsBlock } = await import('/js/ui/detailPanel.js');
        const { render } = await import('/vendor/preact.module.js');
        document.head.innerHTML = '<meta charset="utf-8"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/screens/game-panels.css">';
        document.body.innerHTML = `<main style="max-width:760px;margin:40px auto;padding:24px;background:#17211f"><h1 style="font-size:24px">哥伦比亚 · ${form === 'b' ? '精锐' : '普通'} · 实际模拟结果</h1><div id="card"></div></main>`;
        render(chessStatsBlock({ rec: unit.def.raw, chess: unit.def.raw, live: { ...unitStatsEntry(unit, unit.s), src: 'battle' } }), document.querySelector('#card'));
        return { hash: S.resultDigest(end).hash, errors: b.errors, damage: unit.stats.dmg, hits };
      }, { spec, form });
      assert.equal(result.hash, expected); assert.deepEqual(result.errors, []); assert.ok(result.damage > 0);
      assert.deepEqual(result.hits, expectedHits);
      assert.ok(result.hits.blast > 0 && result.hits.burn > 0, 'the current Columbia barrage and burning zone both deal damage');
      await page.waitForSelector('[data-combat-stats]');
      mkdirSync('test/e2e/out', { recursive: true });
      await page.screenshot({ path: `test/e2e/out/columbia-${form}-stats.png`, fullPage: true });
      console.log(JSON.stringify({ form, ...result }));
    }
    const assets = await page.evaluate(async () => (await fetch('/data/assets.json')).json());
    for (const [, id] of COLUMBIA_ROSTER) {
      const a = assets.chars[id];
      for (const url of [a.avatar, a.portrait, a.spine.front.skel, a.spine.front.atlas, ...a.spine.front.textures]) {
        const status = await page.evaluate(async url => (await fetch(url)).status, url);
        assert.equal(status, 200, `${id}: ${url}`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await srv.close(); }
});
