import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';
import { getDefaultSource, spawnsFromTemplate } from '../../server/sim/simdata.js';
import { SARKAZ_ROSTER } from '../../tools/sarkaz-data.mjs';

const CHROME = process.env.CHROME_PATH;
test('Sarkaz browser/server parity and live combat-stat card', {
  skip: !(process.env.SIM_E2E === '1' && CHROME && existsSync(CHROME)),
  timeout: 120000,
}, async () => {
  const { startServer } = await import('../../server/index.js');
  const P = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  let browser;
  try {
    browser = await P.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    const ds = getDefaultSource(), tpl = ds.getWave('act1autochess_03');
    const ids = SARKAZ_ROSTER.map(([code, , tier, old]) => (old || `chess_char_${tier}_sarkaz_${code}_a`).replace(/_a$/, '_b'));
    const spec = buildBattleSpec({
      seed: 871, kind: 'normal', round: 3, stageId: 'act2autochess_m01', timeLimit: 100,
      players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, playerEffects: [],
        bonds: { sarkazShip: { count: 9, active: true, tier: 2, layers: 80 } },
        units: ids.map((chessId, i) => ({ uid: i + 1, chessId, row: 10 + Math.floor(i / 5), col: 3 + i % 5, dir: 'RIGHT',
          items: i === 8 ? ['chess_item_2_sarkaz_bone_e_b', 'chess_item_6_sarkaz_remains_e_b'] : [] })),
      }],
      ...spawnsFromTemplate(tpl),
    });
    const nb = createBattleFromSpec(spec, ds, { quiet: true });
    const expected = resultDigest(nb.runToEnd(4000)).hash;
    assert.deepEqual(nb.errors, []);
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(`http://127.0.0.1:${srv.port}/sim/spec.js`);
    const result = await page.evaluate(async (spec) => {
      const { loadBrowserSim } = await import('/js/battle/runner.js');
      const { spec: S, ds } = await loadBrowserSim();
      const { unitStatsEntry } = await import('/shared/protocol.js');
      const b = S.createBattleFromSpec(spec, ds, { quiet: true });
      const end = b.runToEnd(4000);
      const unit = b.allyUnits.find(u => u.stats.barrierSeconds > 0 && u.stats.dmg > 0);
      if (!unit) throw Error('No active Sarkaz damage/barrier stats');
      const live = { ...unitStatsEntry(unit, unit.s), src: 'battle' };
      const { loadData } = await import('/js/data.js');
      await loadData('chess', 'assets');
      const { chessStatsBlock } = await import('/js/ui/detailPanel.js');
      const { render } = await import('/vendor/preact.module.js');
      document.head.innerHTML = '<meta charset="utf-8"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/screens/game-panels.css">';
      document.body.innerHTML = '<main id="preview" style="max-width:760px;margin:40px auto;padding:24px;background:#17211f"><h1 style="font-size:24px">萨卡兹 · 实际模拟结果</h1><div id="card"></div></main>';
      render(chessStatsBlock({ rec: unit.def.raw, chess: unit.def.raw, live }), document.querySelector('#card'));
      return { hash: S.resultDigest(end).hash, errors: b.errors, combat: live.combat };
    }, spec);
    await page.waitForSelector('[data-combat-stats] .dstat');
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-combat-stats]').getBoundingClientRect();
      return b.top >= document.querySelector('.dstats').getBoundingClientRect().bottom;
    });
    assert.equal(result.hash, expected);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(errors, []);
    assert.ok(result.combat.sarkazShieldLayers >= 0 && result.combat.sarkazShieldLayers <= 3);
    const text = await page.$eval('[data-combat-stats]', e => e.textContent);
    for (const label of ['造成伤害', '萨卡兹盟约护盾层数', '屏障时间覆盖率']) assert.ok(text.includes(label));
    mkdirSync('test/e2e/out', { recursive: true });
    await page.screenshot({ path: 'test/e2e/out/sarkaz-stats.png', fullPage: true });
    console.log(JSON.stringify({ hash: expected, combat: result.combat }));
  } finally { await browser?.close(); await srv.close(); }
});


test('Aegir/Sargon real-data browser/server deterministic parity, shared field and starting snapshots', {
  skip: !(process.env.SIM_E2E === '1' && CHROME && existsSync(CHROME)), timeout: 120000,
}, async () => {
  const { startServer } = await import('../../server/index.js');
  const P=(await import('puppeteer-core')).default;
  const srv=await startServer({port:0,host:'127.0.0.1',quiet:true});
  let browser;
  try {
    browser=await P.launch({executablePath:CHROME,headless:true,args:['--no-first-run']});
    const page=await browser.newPage(),ds=getDefaultSource();
    await page.goto(`http://127.0.0.1:${srv.port}/sim/spec.js`);
    for(const bond of ['egirShip','sargonShip']){
      const records=Object.values(ds.raw.chess).filter(c=>c.visible&&!c.isGolden&&c.bonds.includes(bond)).slice(0,6);
      if(bond==='egirShip') records[5]=ds.raw.chess.chess_char_5_aegir_clemnt_a;
      const spec=buildBattleSpec({seed:882,kind:'unite',stageId:'act2autochess_m01',timeLimit:60,
        players:[0,1].map(i=>({playerId:'p'+i,seat:i,side:'L',colOffset:i?8:0,playerEffects:[],
          bonds:{[bond]:{count:6,active:true,tier:bond==='egirShip'?3:2,layers:i?100:600}},
          units:records.map((c,j)=>({uid:100*i+j+1,chessId:c.goldenId,row:10+Math.floor(j/3),col:3+j%3,dir:'UP',
            items:bond==='egirShip'&&j===0?['chess_item_6_04_e_a','chess_item_3_07_e_a']:[]}))})),
        ...spawnsFromTemplate(ds.getWave('act1autochess_03'))});
      const b=createBattleFromSpec(spec,ds,{quiet:true}),expected=resultDigest(b.runToEnd(2500)).hash;
      assert.deepEqual(b.errors,[]);
      const actual=await page.evaluate(async spec=>{
        const {loadBrowserSim}=await import('/js/battle/runner.js');
        const {spec:S,ds}=await loadBrowserSim(),b=S.createBattleFromSpec(spec,ds,{quiet:true});
        const end=b.runToEnd(2500);return{hash:S.resultDigest(end).hash,errors:b.errors};
      },spec);
      assert.deepEqual(actual,{hash:expected,errors:[]});
      console.log(JSON.stringify({bond,hash:expected}));
    }
  } finally {await browser?.close();await srv.close();}
});
