import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildBattleSpec,createBattleFromSpec } from '../../server/sim/spec.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { ultimateProbe } from '../helpers/ultimateProbe.js';
const CHROME=process.env.CHROME_PATH;
test('ultimate additions: Node/Chromium DIY, summoning and erosion bombardments match; costumes load',{
  skip:!(process.env.SIM_E2E==='1'&&CHROME&&existsSync(CHROME)),timeout:120000,
},async()=>{
  const {startServer}=await import('../../server/index.js'),P=(await import('puppeteer-core')).default;
  const srv=await startServer({port:0,host:'127.0.0.1',quiet:true});let browser;
  try{
    browser=await P.launch({executablePath:CHROME,headless:true,args:['--no-first-run']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/sim/spec.js`);
    for(const skillIndex of [0,1,2]){
      const spec=buildBattleSpec({kind:'normal',round:6,seed:81,modeId:'mode_single_abyss',stageId:'act2autochess_m04',
        waveId:'act1autochess_06',wave:{spawns:[],routes:[],timeLimit:120},
        players:[{playerId:'p1',side:'L',units:[{uid:1,chessId:'chess_char_6_diy1_b',row:10,col:4,dir:'RIGHT',items:[],
          diy:{charId:'char_4231_clemnt',skillIndex,uniEquipId:null}}]}]});
      const b=createBattleFromSpec(spec,getDefaultSource(),{quiet:true});b.autoFinish=false;
      const expected=JSON.parse(JSON.stringify(ultimateProbe(b)));
      const actual=await page.evaluate(async(spec,probeText)=>{
        const {loadBrowserSim}=await import('/js/battle/runner.js');
        const {spec:S,ds}=await loadBrowserSim();
        const b=S.createBattleFromSpec(spec,ds,{quiet:true});b.autoFinish=false;
        return (0,eval)('('+probeText+')')(b);
      },spec,ultimateProbe.toString());
      assert.deepEqual(actual,expected,'S'+(skillIndex+1));assert.deepEqual(actual.errors,[]);
      assert.equal(actual.unit,'char_4231_clemnt');assert.ok(actual.children>0);assert.ok(actual.skills.length>0);
    }
    const costumes=await page.evaluate(async()=>{
      const manifest=await(await fetch('/data/assets.json')).json();
      const ids=['char_4132_ascln','char_4037_demetr','char_4231_clemnt'];
      const urls=ids.flatMap(id=>{
        const c=manifest.chars[id];const entries=[c.spine.front,c.spine.back,c.base,
          ...(c.skins||[]).flatMap(s=>[s.spine.front,s.spine.back,s.base])].filter(Boolean);
        return entries.flatMap(e=>[e.skel,e.atlas,...e.textures]);
      });
      return Promise.all(urls.map(async url=>[url,(await fetch(url)).status]));
    });
    assert.ok(costumes.length>=18);assert.ok(costumes.every(([,status])=>status===200));assert.deepEqual(errors,[]);
    await page.evaluate(async()=>{
      const {h,render}=await import('/vendor/preact.module.js');
      const {AppearanceControls}=await import('/js/ui/appearanceControls.js');
      const manifest=await(await fetch('/data/assets.json')).json();
      document.body.replaceChildren();
      render(h('div',null,...['char_4132_ascln','char_4037_demetr','char_4231_clemnt'].map(charId=>h(AppearanceControls,{charId,manifest}))),document.body);
    });
    await page.waitForFunction(()=>document.querySelectorAll('.appearance-preview canvas').length===3,{timeout:20000});
    await page.select('[data-char="char_4132_ascln"] select[aria-label="选择皮肤"]','char_4132_ascln_iteration_4');
    for(const id of ['char_4132_ascln','char_4037_demetr','char_4231_clemnt'])await page.select(`[data-char="${id}"] select[aria-label="模型方向"]`,'base');
    await page.waitForFunction(()=>document.querySelectorAll('.appearance-preview canvas').length===3 && !document.querySelector('.appearance-preview [role="status"]'),{timeout:20000});
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await srv.close();}
});
