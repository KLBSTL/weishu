import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client,hasChrome,startRealServer,problemsOf} from '../e2e/client.mjs';
const enabled=process.env.SP_E2E==='1'&&hasChrome();

for(const mode of ['solo','coop'])test(`opening bans ${mode}: actual controls, reload, responsive layout and match groups`,{skip:!enabled,timeout:120000},async()=>{
  const P=(await import('puppeteer-core')).default,srv=await startRealServer();
  const c=new Client(P,srv.base,`bans-${mode}`,{prefix:`bans-${mode}`});
  let guest;
  try{
    await c.open();await c.enter('禁用配置');
    await c.click('.mode-card',mode==='solo'?'独立模拟':'同盟模拟');await c.click('.diff-card','险境');
    await c.click('.create-box button',mode==='solo'?'开始独立模拟':'创建同盟');
    await c.waitFor(s=>!!s.room,'room');
    assert.equal(await c.page.$('[data-testid="ban-picker"]'),null,'configuration stays closed until requested');
    await c.click('[data-testid="ban-config-open"]');await c.page.waitForSelector('[data-testid="ban-picker"]');
    const config=()=>c.page.evaluate(()=>globalThis.__SP__.store.get().room.banConfig);
    assert.deepEqual(await config(),{hardCore:1,softCore:3,addon:5});
    await c.page.$eval('[data-testid="ban-picker"]',e=>e.scrollIntoView({block:'center'}));
    await c.click('[data-ban-kind="hardCore"] .ban-picker__stepper button','+');
    await c.page.waitForFunction(()=>globalThis.__SP__.store.get().room.banConfig.hardCore===2);
    await c.click('[data-ban-kind="softCore"] .ban-picker__stepper button','−');
    await c.page.waitForFunction(()=>globalThis.__SP__.store.get().room.banConfig.softCore===2);
    await c.click('[data-ban-kind="addon"] .ban-picker__stepper button','−');
    await c.page.waitForFunction(()=>globalThis.__SP__.store.get().room.banConfig.addon===4);
    await c.page.reload({waitUntil:'domcontentloaded'});await c.page.waitForFunction(()=>!!globalThis.__SP__);await c.waitFor(s=>!!s.room,'reconnected');
    assert.deepEqual(await config(),{hardCore:2,softCore:2,addon:4});
    assert.equal(await c.page.$('.ban-config-dialog'),null);await c.click('[data-testid="ban-config-open"]');
    for(const [width,height,name] of [[1280,900,'desktop'],[844,650,'compact'],[640,360,'narrow']]){
      await c.page.setViewport({width,height});await c.page.$eval('.ban-picker',e=>e.scrollIntoView({block:'center'}));
      const box=await c.page.$eval('.ban-picker',e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,scroll:e.scrollWidth,width:e.clientWidth};});
      assert.ok(box.left>=0&&box.right<=width+1&&box.scroll<=box.width+1,JSON.stringify(box));await c.shot(name);
    }
    await c.page.setViewport({width:1280,height:900});
    await c.page.$eval('.ban-picker',e=>e.scrollIntoView({block:'center'}));await c.click('.ban-picker__reset');
    await c.page.waitForFunction(()=>globalThis.__SP__.store.get().room.banConfig.hardCore===1);
    for(const key of ['hardCore','softCore','addon']){
      await c.page.focus(`[data-ban-kind="${key}"] input`);await c.page.keyboard.press('Home');await c.page.keyboard.press('Tab');
      await c.page.waitForFunction(k=>globalThis.__SP__.store.get().room.banConfig[k]===0,{},key);
    }
    assert.deepEqual(await config(),{hardCore:0,softCore:0,addon:0});
    await c.click('.ban-picker__reset');await c.page.waitForFunction(()=>globalThis.__SP__.store.get().room.banConfig.addon===5);
    if(mode==='coop'){
      guest=new Client(P,srv.base,'bans-guest',{prefix:'bans-guest'});await guest.open();await guest.enter('访客');
      const code=(await c.st()).room.code;
      await guest.page.evaluate(code=>globalThis.__SP__.net.request('room.join',{code}),code);
      await guest.waitFor(s=>!!s.room,'guest joined');
      await guest.click('[data-testid="ban-config-open"]');
      assert.equal(await guest.page.$$eval('.ban-picker button,.ban-picker input',es=>es.every(e=>e.disabled)),true);
      await guest.page.keyboard.press('Escape');
      await guest.page.evaluate(()=>globalThis.__SP__.net.request('room.ready',{ready:true}));
    }
    await c.click('[data-testid="ban-config-close"]');assert.equal(await c.page.$('.ban-config-dialog'),null);
    await c.click('[data-testid="ban-config-open"]');await c.page.keyboard.press('Escape');
    await c.page.waitForFunction(()=>!document.querySelector('.ban-config-dialog'));
    await c.page.$eval('.room-bar__right',e=>e.scrollIntoView({block:'center'}));await c.click('.room-bar__right button','开始模拟');
    await c.waitFor(s=>s.phase==='INFO_CHECK','briefing');
    const pub=await c.page.evaluate(()=>globalThis.__SP__.store.get().match.public);
    assert.deepEqual(pub.banConfig,{hardCore:1,softCore:3,addon:5});
    assert.equal(pub.hardBannedBonds.length,1);assert.equal(pub.softBannedBonds.length,3);assert.equal(pub.addonBannedBonds.length,5);
    await c.page.waitForSelector('.brief-bond__kind--hard',{visible:true});
    assert.equal(await c.page.$eval('.brief-bond__kind--hard',e=>e.getBoundingClientRect().width>20),true);
    await c.shot('briefing');
    assert.deepEqual(problemsOf([c,...(guest?[guest]:[])]).filter(x=>!/fonts.googleapis|fonts.gstatic/.test(x)),[]);
  }finally{await guest?.close();await c.close();await srv.stop();}
});
