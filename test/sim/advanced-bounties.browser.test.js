import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { advancedBountyProbe } from '../helpers/advancedBountyProbe.js';
const CHROME = process.env.CHROME_PATH;
const keys = ['enemy_1506_patrt','enemy_1546_cliff','enemy_2013_csbot','enemy_2038_sydonq',
  'enemy_2055_smlead','enemy_2072_skdny2','enemy_1533_stmkgt','enemy_2073_skzrck','enemy_1002_nsabr'];
test('advanced leaders: Node/Chromium parity, all nine models and form clips load and render', {
  skip: !(process.env.SIM_E2E === '1' && CHROME && existsSync(CHROME)), timeout: 120000,
}, async () => {
  const { startServer } = await import('../../server/index.js'), P = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true }); let browser;
  try {
    browser = await P.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width: 1200, height: 900 });
    await page.goto(`http://127.0.0.1:${srv.port}/sim/spec.js`);
    const spec = buildBattleSpec({ kind: 'normal', round: 12, seed: 19, modeId: 'mode_single_catastrophe',
      stageId: 'act2autochess_m04', waveId: 'act1autochess_h05', wave: { spawns: [], routes: [], timeLimit: 230 },
      players: [{ playerId: 'p1', side: 'L', units: [{ uid: 1, chessId: 'chess_char_1_01_a', row: 10, col: 4, dir: 'RIGHT', items: [] }] }] });
    for (const key of keys.slice(0, 7)) {
      const b = createBattleFromSpec(spec, getDefaultSource(), { quiet: true }); b.autoFinish = false;
      const expected = JSON.parse(JSON.stringify(advancedBountyProbe(b, key)));
      const actual = await page.evaluate(async (spec, key, fn) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const { spec: S, ds } = await loadBrowserSim();
        const b = S.createBattleFromSpec(spec, ds, { quiet: true }); b.autoFinish = false;
        return (0, eval)('(' + fn + ')')(b, key);
      }, spec, key, advancedBountyProbe.toString());
      assert.deepEqual(actual, expected, key); assert.deepEqual(actual.errors, []);
    }
    await page.addScriptTag({ url: `http://127.0.0.1:${srv.port}/vendor/pixi.min.js` });
    await page.addScriptTag({ url: `http://127.0.0.1:${srv.port}/vendor/pixi-spine.js` });
    const loaded = await page.evaluate(async keys => {
      const manifest = await (await fetch('/data/assets.json')).json();
      const { loadSpineData } = await import('/js/assets.js');
      const { FORMS } = await import('/js/render/units.js');
      document.body.replaceChildren(); document.body.style.margin = '0';
      const app = new globalThis.PIXI.Application({ width: 1200, height: 900, backgroundColor: 0x141d24 });
      document.body.append(app.view);
      const output = [];
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i], entry = manifest.enemies[key]?.spine;
        if (!entry) throw new Error('Missing spine ' + key);
        const data = await loadSpineData(entry), names = new Set(data.animations.map(a => a.name));
        const check = value => { if (typeof value === 'string' && !names.has(value)) throw new Error(key + ': missing clip ' + value);
          if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (k !== 'via') check(v); };
        for (const form of Object.values(FORMS[key] || {})) { check(form.roles); if (form.change) check(form.change); }
        const actor = new globalThis.PIXI.spine.Spine(data); actor.state.setAnimation(0, entry.anims.idle, true); actor.update(0.2);
        const bounds = actor.getLocalBounds(), scale = Math.min(280 / bounds.width, 210 / bounds.height);
        actor.scale.set(scale); actor.position.set((i % 3) * 400 + 200, Math.floor(i / 3) * 300 + 250);
        app.stage.addChild(actor);
        const label = new globalThis.PIXI.Text(key, { fill: 0xd8e8ef, fontSize: 15 });
        label.position.set((i % 3) * 400 + 90, Math.floor(i / 3) * 300 + 275); app.stage.addChild(label);
        output.push({ key, animations: names.size, width: bounds.width, height: bounds.height });
      }
      app.renderer.render(app.stage); return output;
    }, keys);
    assert.equal(loaded.length, 9); assert.ok(loaded.every(x => x.width > 0 && x.height > 0));
    assert.deepEqual(errors, []);
    if (process.env.BOUNTY_SCREENSHOT) await page.screenshot({ path: process.env.BOUNTY_SCREENSHOT });
  } finally { await browser?.close(); await srv.close(); }
});
