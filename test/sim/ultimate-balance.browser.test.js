import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {buildBattleSpec,createBattleFromSpec} from '../../server/sim/spec.js';
import {getDefaultSource} from '../../server/sim/simdata.js';
import {ultimateBalanceProbe} from '../helpers/ultimateBalanceProbe.js';
const CHROME=process.env.CHROME_PATH;
test('ultimate balance: Chromium/Node modifiers and leak provenance match; supplied icons load with real alpha',{
  skip:!(process.env.SIM_E2E==='1'&&CHROME&&existsSync(CHROME)),timeout:120000,
},async()=>{
  const {startServer}=await import('../../server/index.js'),P=(await import('puppeteer-core')).default;
  const srv=await startServer({port:0,host:'127.0.0.1',quiet:true});let browser;
  try{
    browser=await P.launch({executablePath:CHROME,headless:true,args:['--no-first-run']});
    const page=await browser.newPage();await page.setViewport({width:1024,height:460});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${srv.port}/sim/spec.js`);
    const spec=buildBattleSpec({kind:'normal',round:6,seed:19,modeId:'mode_single_abyss',stageId:'act2autochess_m04',
      timeLimit:60,routes:[],spawns:[],players:[{playerId:'p1',side:'L',units:[{uid:1,chessId:'chess_char_1_01_a',row:10,col:4}]}]});
    const b=createBattleFromSpec(spec,getDefaultSource(),{quiet:true});b.autoFinish=false;
    const expected=JSON.parse(JSON.stringify(ultimateBalanceProbe(b)));
    const actual=await page.evaluate(async(spec,source)=>{
      const {loadBrowserSim}=await import('/js/battle/runner.js'),{spec:S,ds}=await loadBrowserSim();
      const b=S.createBattleFromSpec(spec,ds,{quiet:true});b.autoFinish=false;return new Function(`return (${source})`)()(b);
    },spec,ultimateBalanceProbe.toString());
    assert.deepEqual(actual,expected);assert.deepEqual(actual.errors,[]);
    assert.equal(actual.ratios.atk,.9);assert.ok(Math.abs(actual.ratios.hp-.8)<1e-12);assert.equal(actual.ratios.ballAtk,900);
    assert.equal(actual.leaks[0].lpr,0);
    const icons=await page.evaluate(async()=>{
      const m=await(await fetch('/data/assets.json')).json();
      const rows=[['哥伦比亚动力甲',m.items['columbia-power-armor']],['力场防护装置',m.items['columbia-force-field']],['斐尔迪南分队',m.bands.band_ferdinand]];
      document.body.replaceChildren();document.body.style.cssText='margin:0;padding:24px;background:#111b1b;color:#e5ffff;font:20px sans-serif;display:flex;gap:20px';
      return Promise.all(rows.map(async([name,url])=>{
        const box=document.createElement('div');box.style.cssText='width:300px;text-align:center';
        const heading=document.createElement('p');heading.textContent=name;box.append(heading);
        const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=300;
        const ctx=canvas.getContext('2d');for(let y=0;y<300;y+=20)for(let x=0;x<300;x+=20){ctx.fillStyle=(x/20+y/20)%2?'#405050':'#253535';ctx.fillRect(x,y,20,20);}
        ctx.drawImage(image,0,0,300,300);box.append(canvas);document.body.append(box);
        const raw=document.createElement('canvas');raw.width=raw.height=1;const pixel=raw.getContext('2d');pixel.drawImage(image,0,0);
        return {url,width:image.naturalWidth,alpha:pixel.getImageData(0,0,1,1).data[3]};
      }));
    });
    assert.deepEqual(icons.map(i=>i.width),[1254,1254,1148]);assert.deepEqual(icons.map(i=>i.alpha),[0,0,255]);
    if(process.env.SP_ICON_SCREENSHOT)await page.screenshot({path:process.env.SP_ICON_SCREENSHOT});
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await srv.close();}
});
