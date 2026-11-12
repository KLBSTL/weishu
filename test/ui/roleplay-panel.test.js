import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const root=fileURLToPath(new URL('../..',import.meta.url));
const electron=process.env.DSH_PET_ELECTRON_PATH||resolve(root,'desktop-pet/state/electron/electron.exe');
const soakCycles=Number(process.env.SP_UI_SOAK_CYCLES||0);
assert.ok(Number.isInteger(soakCycles)&&soakCycles>=0&&soakCycles<=300,'SP_UI_SOAK_CYCLES must be 0..300');
const nativeTimeout=40000+soakCycles*6000;
test('curtain layout reserves a complete pendant and anchors to the real top on small or offset displays',()=>{
  const {settings,shellLayout}=createRequire(import.meta.url)('../../server/desktop/roleplay-config.cjs');
  const prefs=settings({width:2400,height:1600,lineLength:160,gemSize:104});assert.equal(prefs.moveEnabled,false);
  assert.throws(()=>settings({moveEnabled:'yes'}));
  for(const display of [{bounds:{x:0,y:0,width:1366,height:768},workArea:{x:0,y:32,width:1366,height:696}},
    {bounds:{x:-1920,y:-1080,width:1920,height:1080},workArea:{x:-1920,y:-1080,width:1920,height:1040}}]){
    const l=shellLayout(prefs,display,-100000);
    assert.equal(l.bounds.y,display.bounds.y);assert.ok(l.bounds.x>=display.workArea.x);
    assert.ok(l.bounds.y+l.bounds.height<=display.workArea.y+display.workArea.height);
    assert.ok(l.panelHeight+prefs.lineLength+prefs.gemSize*1.2<l.bounds.height);
    assert.ok(l.gemX>=l.margin&&l.gemX<=l.bounds.width-l.margin);
  }
});
async function hiddenMain(){
  const {app,BrowserWindow,ipcMain,screen}=require('electron');
  const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
  const {setTimeout:delay}=require('node:timers/promises');
  const visible=process.env.SP_UI_VISIBLE==='1';
  const source=process.argv.at(-1),companion=path.join(source,'../companion'),helper=path.join(__dirname,'helper');fs.mkdirSync(helper);
  fs.copyFileSync(path.join(source,'roleplay-preload.cjs'),path.join(helper,'ark-roleplay-preload.cjs'));
  app.disableHardwareAcceleration();app.setPath('userData',path.join(__dirname,'profile'));app.setPath('sessionData',path.join(__dirname,'profile'));
  await app.whenReady();let shown=0;app.on('browser-window-created',(_event,w)=>w.on('show',()=>shown++));
  const profile={name:'小雨',description:'我在河边经营一家书店，喜欢听雨和收集旧书。'};
  const data={revision:1,actors:[{id:'main',name:'小雨',assetId:'public-card',characterId:'public-person',resolvedSpeaker:profile,speaker:profile}],
    assets:[{id:'public-card',kind:'card',name:'小雨',card:profile}],bindings:{main:'main'},petIds:['main'],embeddedBooks:[],events:[],states:{},rooms:[],
    userPersona:{name:'你',description:''},preset:{style:''},group:{running:false}};
  const files={'library-ui':[companion,'manager.html'],'library-client.js':[companion,'manager.js'],'library-panel.js':[companion,'panel.js'],'library-prompts.js':[companion,'prompt-editor.js'],
    'library-prompt-transfer.js':[companion,'prompt-transfer.js'],'i18n.js':[source,'../../shared/i18n.js'],'i18nPacks.js':[source,'../../shared/i18nPacks.js'],
    'library-motion.js':[companion,'motion.js'],'library-pagination.js':[companion,'pagination.js'],'library-style.css':[companion,'manager.css'],'library-shell.js':[source,'roleplay-dock.js'],'library-shell.css':[source,'roleplay-dock.css']};
  const server=http.createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.split('/').at(-1),file=files[name];
    if(file){res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(path.join(...file)));return;}
    let raw='';for await(const b of req)raw+=b;let body={};try{body=JSON.parse(raw||'{}');}catch{/* no body */}
    let result={};if(name==='library'){
      if(body.action==='snapshot')result=data;
      if(body.action==='analyze-card')result={candidates:[],speaker:profile,sceneCard:false};
      if(body.action==='recent-history')result={messages:[]};
    }
    if(name==='chat-options')result={mode:'daily',effort:'low',maxChars:60,idleSeconds:30,bubbleSeconds:20,proactive:true};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const pet=new BrowserWindow({show:false,webPreferences:{preload:path.join(helper,'ark-roleplay-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  await pet.loadURL('data:text/html,<title>pet</title>');
  await pet.webContents.executeJavaScript('window.arkDesktop.onCommand(v=>window.arkDesktop.report({requestId:v.requestId,roleplay:v.enabled,game:false}));');
  const privateDir=path.join(process.env.DSH_HOME,'dsh-pet');fs.mkdirSync(privateDir,{recursive:true});fs.writeFileSync(path.join(privateDir,'ark-roleplay-window.json'),JSON.stringify({y:80}));
  const {install}=require(path.join(source,'roleplay-windows.cjs'));
  const {createBridge}=require(path.join(source,'../../desktop-pet/node_modules/dsh-pet/runtime/electron-helper/main/bridge.js'));
  const bridge=createBridge({isBridge:true,prefix:'PUBLIC-BRIDGE:',origin,token:'public-fixture'});
  const stdout=process.stdout.write.bind(process.stdout);let callbackServer,bridgeCalls=0,emptyCallbacks=0;
  process.stdout.write=function(chunk,...args){const line=String(chunk);if(!line.startsWith('PUBLIC-BRIDGE:'))return stdout(chunk,...args);
    const request=JSON.parse(line.slice('PUBLIC-BRIDGE:'.length));bridgeCalls++;if(!request.cb){emptyCallbacks++;return true;}
    void fetch(request.cb,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:request.id,status:bridgeCalls===1?503:200,body:JSON.stringify({url:origin+'/dsh-pet-7340/stronghold/library-ui#token=public-fixture'})})});return true;};
  // Exercise the actual upstream bridge while its callback is still starting, then a transient host response.
  const callbackTimer=setTimeout(()=>{callbackServer=bridge.startCallback();},100);
  const ui=install({app,BrowserWindow,ipcMain,screen,helperDir:helper,petWindows:{state:{windows:new Map([['main',pet]])}},hidden:!visible,
    hostRequest:bridge.hostRequest,hostReady:()=>!!bridge.callbackUrl()});
  const js=code=>ui.panel.webContents.executeJavaScript(code);
  const status=()=>js('window.arkDesktop.status()');
  let reports=0;const countReport=()=>reports++;ipcMain.on('ark:shell-report',countReport);
  const command=value=>js('window.arkDesktop.command('+JSON.stringify(value)+')');
  async function until(fn,label){for(let i=0;i<180;i++){if(await fn())return;await delay(20);}throw new Error(label);}
  async function ended(open){await until(async()=>{const s=await status();return s.panelOpen===open&&!s.animating;},'animation completes');}
  async function point(){return js('(()=>{const r=document.querySelector(".charm .gem").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');}
  async function mouse(type,p,extra={}){await ui.panel.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1,...extra});}
  async function click(){const p=await point();await mouse('mousePressed',p,{buttons:1});await mouse('mouseReleased',p);}
  async function capture(suffix,crop){
    const frame=await ui.panel.webContents.capturePage();if(process.env.SP_UI_CAPTURE)fs.writeFileSync(process.env.SP_UI_CAPTURE.replace(/\.png$/u,suffix+'.png'),(crop?frame.crop(crop):frame).toPNG());
  }
  try{
    await ui.ready;await until(()=>js('document.body.dataset.ready==="true"&&!!document.querySelector(".charm")'),'actual manager ready');
    assert.equal(emptyCallbacks,0,'the first bridge request must already have a response channel');assert.equal(bridgeCalls,2,'startup retries a transient local host response');
    await ui.panel.webContents.capturePage();ui.panel.webContents.debugger.attach('1.3');
    let s=await status();assert.equal(s.settings.moveEnabled,false);assert.equal(ui.panel,ui.dock);assert.equal(await js('document.querySelectorAll(".move").length'),0);
    assert.equal(s.layout.bounds.y,screen.getDisplayMatching(s.layout.bounds).bounds.y,'old y offset cannot leave the cord floating');
    await until(()=>js('Math.abs(document.getElementById("panelMotion").getBoundingClientRect().bottom)<1'),'closed cord starts at screen edge');
    await capture('-dock',{x:Math.floor(s.layout.gemX-s.layout.margin),y:0,width:Math.ceil(s.layout.margin*2),height:s.layout.tail});
    const lockedAnchor=s.layout.bounds.x+s.layout.gemX;
    await assert.rejects(command({name:'dock-position',x:lockedAnchor-100,y:s.layout.bounds.y+100}),/开启调整位置/);
    const start=await point();await mouse('mousePressed',start,{buttons:1});await mouse('mouseMoved',{x:start.x,y:start.y+90},{buttons:1});
    const drag=await js('(()=>{const m=document.getElementById("panelMotion"),g=document.querySelector(".charm .gem");return {offset:Number(m.dataset.offset),bottom:g.getBoundingClientRect().bottom,inner:innerHeight,edge:m.getBoundingClientRect().bottom};})()');
    assert.ok(drag.offset>80&&drag.offset<100,'entire panel follows the pull');assert.ok(drag.bottom<drag.inner-4,'pendant is never clipped while pulling');assert.ok(Math.abs(drag.edge-drag.offset)<1);
    await capture('-pull');await mouse('mouseReleased',{x:start.x,y:start.y+90});await ended(true);
    const firstId=ui.panel.id;
    s=await status();
    assert.ok(await js('(()=>{const m=document.getElementById("panelMotion").getBoundingClientRect(),g=document.querySelector(".charm").getBoundingClientRect();return m.top===0&&g.bottom<=innerHeight;})()'),'open panel and pendant remain on screen');
    await capture('-hanging');
    const up=await point();await mouse('mousePressed',up,{buttons:1});await mouse('mouseMoved',{x:up.x,y:up.y-70},{buttons:1});await mouse('mouseReleased',{x:up.x,y:up.y-70});await ended(false);
    await click();await ended(true);
    await command({name:'roleplay',pet:'main',enabled:true});assert.equal((await status()).pets.main.roleplay,true);
    await ui.openPanel('world','main');assert.equal(ui.panel.id,firstId);await js('document.querySelector("[data-section=worldInspect]").click()');
    await ui.panel.webContents.capturePage();const input=await js('(()=>{const r=document.getElementById("probe").getBoundingClientRect();return {x:r.x+12,y:r.y+12};})()');
    await mouse('mousePressed',input,{buttons:1});await mouse('mouseReleased',input);
    assert.equal(await js('document.activeElement.id'),'probe');await ui.panel.webContents.debugger.sendCommand('Input.insertText',{text:'选择这个人物'});
    assert.equal(await js('document.getElementById("probe").value'),'选择这个人物');
    await command({name:'close'});await ended(false);
    const stable=ui.panel.getBounds(),offsets=[],native=[];
    const opening=command({name:'toggle'});
    for(let i=0;i<12;i++){await delay(25);offsets.push(await js('Number(document.getElementById("panelMotion").dataset.offset)'));native.push(ui.panel.getBounds());}
    await opening;await ended(true);
    assert.ok(offsets.filter(x=>x>1&&x<s.layout.panelHeight-1).length>3,'renderer has continuous intermediate frames');
    for(const b of native)assert.deepEqual(b,stable,'animation must not resize or move the native window');
    await command({name:'close'});const forward=command({name:'toggle'});await delay(100);
    const beforeReverse=await js('Number(document.getElementById("panelMotion").dataset.offset)');
    const backward=command({name:'toggle'});assert.equal((await forward).interrupted,true);await backward;await ended(false);
    assert.ok(beforeReverse>1,'reversal interrupts a moving panel');assert.ok(await js('Number(document.getElementById("panelMotion").dataset.offset)<1'));
    // A click is enough; an up/down gesture is optional.
    await click();await ended(true);await click();await ended(false);
    let p=await point();await mouse('mousePressed',p,{buttons:1,modifiers:1});await mouse('mouseMoved',{x:p.x-60,y:p.y},{buttons:1,modifiers:1});await mouse('mouseReleased',{x:p.x-60,y:p.y},{modifiers:1});await ended(false);
    s=await status();assert.equal(s.layout.bounds.x+s.layout.gemX,lockedAnchor,'Alt drag cannot move a locked pendant');
    await ui.openPanel('settings','main');await js('document.querySelector("[data-section=dockSettings]").click()');
    assert.equal(await js('document.getElementById("dockMove").checked'),false);
    await js('document.getElementById("dockMove").checked=true;document.getElementById("dockForm").requestSubmit()');
    await until(async()=>(await status()).settings.moveEnabled,'setting unlocks movement');
    await command({name:'close'});p=await point();await mouse('mousePressed',p,{buttons:1,modifiers:1});await mouse('mouseMoved',{x:p.x-80,y:p.y},{buttons:1,modifiers:1});await mouse('mouseReleased',{x:p.x-80,y:p.y},{modifiers:1});
    await until(async()=>Math.abs((await status()).layout.bounds.x+(await status()).layout.gemX-lockedAnchor)>50,'unlocked pendant moves');
    assert.equal((await status()).layout.bounds.y,s.layout.bounds.y,'moving cannot detach the cord from the screen top');
    await command({name:'panel-settings',settings:{sway:true,gemSize:96,lineLength:120,width:960,height:640,fontSize:22}});
    await mouse('mouseMoved',{x:10,y:10});await mouse('mouseMoved',await point());
    const angles=[];for(let i=0;i<25;i++){await delay(30);angles.push(await js('Number(document.getElementById("panelMotion").dataset.angle)'));}
    assert.ok(Math.max(...angles)-Math.min(...angles)>1,'hover excites a visible, damped physical swing');
    assert.ok(angles.every(a=>Math.abs(a)<=18),'physics and native hit region share the same bounds');
    await command({name:'panel-settings',settings:{sway:false}});await delay(60);
    assert.equal(await js('Number(document.getElementById("panelMotion").dataset.angle)'),0);
    await command({name:'toggle'});const before=(await status()).panel;
    await ui.panel.webContents.capturePage();const edge=await js('(()=>{const r=document.querySelector(".resize-edge[data-edge=se]").getBoundingClientRect();return {x:r.x+5,y:r.y+5};})()');
    await mouse('mousePressed',edge,{buttons:1});await delay(30);await mouse('mouseMoved',{x:edge.x+100,y:edge.y+60},{buttons:1});await delay(30);await mouse('mouseReleased',{x:edge.x+100,y:edge.y+60});
    await until(async()=>(await status()).panel.width>before.width,'corner drag resizes the panel');
    s=await status();assert.ok(s.panel.width>=before.width&&s.panel.height>=before.height);assert.ok(s.layout.bounds.height<=screen.getDisplayMatching(s.layout.bounds).workArea.height);
    await command({name:'panel-settings',settings:{sway:true}});await delay(100);
    assert.equal(await js('document.getElementById("panelMotion").dataset.resting'),'true','an unexcited pendant sleeps with sway enabled');
    const reportStart=reports;await delay(200);const restReports=reports-reportStart;assert.equal(restReports,0,'rest does not emit per-frame IPC');
    await js('(()=>{for(const s of document.querySelectorAll("main>section"))s.hidden=true;const s=document.createElement("section");s.id="paginationProbe";const b=document.createElement("div"),c=document.createElement("div");b.className="paged-body";b.style.flex="1";s.append(b,c);document.querySelector("main").append(s);window.probeRenderCalls=0;window.probeFrames=0;window.probeStarted=performance.now();window.probePager=new window.FittedPages(b,c,r=>{probeRenderCalls++;const p=document.createElement("p");p.textContent=r.text;return p;});probePager.set(Array.from({length:400},(_,i)=>({id:String(i),text:("第"+i+"条公开测试记录，检查长历史分页时仍然能够响应输入。").repeat(4)})));const tick=()=>{probeFrames++;if(!b.dataset.pages)requestAnimationFrame(tick);};requestAnimationFrame(tick);})()');
    await until(()=>js('Number(probePager.body.dataset.pages)>1'),'long history paginates in bounded frame slices');
    const paging=await js('({rows:new Set(probePager.pages.flat().map(r=>r.id)).size,pages:probePager.pages.length,frames:probeFrames,elapsedMs:Math.round(performance.now()-probeStarted)})');
    assert.equal(paging.rows,400);assert.ok(paging.frames>2,'pagination yields to rendering instead of blocking for the whole history');
    await js('probePager.set(probePager.rows,false)');await until(()=>js('!!probePager.work'),'reflow starts');await js('probePager.turn(1)');
    await until(()=>js('!probePager.work'),'interactive reflow finishes');assert.equal(await js('probePager.pages.length'),paging.pages,'turning a page during reflow keeps the measurement surface attached');
    assert.equal(await js('new Set(probePager.pages.flat().map(r=>r.id)).size'),400);await js('probePager.index=0;probePager.paint()');
    await js('probePager.body.dispatchEvent(new WheelEvent("wheel",{deltaY:90,bubbles:true,cancelable:true}))');
    assert.equal(await js('probePager.index'),1);assert.ok(await js('probePager.body.getAnimations().length>0'),'page change animates');
    await js('for(let i=0;i<20;i++)probePager.body.dispatchEvent(new WheelEvent("wheel",{deltaY:5,bubbles:true,cancelable:true}))');
    assert.equal(await js('probePager.index'),1,'a touchpad momentum burst cannot skip many pages');
    await js('probePager.body.dispatchEvent(new KeyboardEvent("keydown",{key:"PageDown",bubbles:true}))');assert.equal(await js('probePager.index'),2);
    await js('probePager.body.dispatchEvent(new PointerEvent("pointerdown",{pointerType:"touch",clientX:150,clientY:30}));probePager.body.dispatchEvent(new PointerEvent("pointerup",{pointerType:"touch",clientX:40,clientY:32}))');assert.equal(await js('probePager.index'),3);
    await js('document.body.classList.add("reduce-motion");ArkMotion.cancelAll();probePager.turn(1)');
    assert.equal(await js('probePager.body.getAnimations().length'),0,'reduced motion also disables native animation API transitions');
    const renders=await js('probeRenderCalls');await js('probePager.refresh()');await delay(60);assert.equal(await js('probeRenderCalls'),renders,'unchanged dimensions/content do not remeasure the full history');
    await js('probePager.dispose();document.getElementById("paginationProbe").remove();document.body.classList.remove("reduce-motion")');
    const offline=await js('(async()=>{const original=window.fetch;let calls=0;document.getElementById("probe").value="未发送的草稿";try{window.fetch=async()=>{calls++;throw new Error("private transport detail")};let message;try{await requestJson("library",{method:"POST",body:"{}"})}catch(e){message=e.message}return {calls,message,draft:document.getElementById("probe").value}}finally{window.fetch=original}})()');
    assert.equal(offline.calls,1,'uncertain writes are not automatically submitted twice');assert.equal(offline.draft,'未发送的草稿');assert.match(offline.message,/尚未确认/);assert.doesNotMatch(offline.message,/private/);
    const saved=JSON.parse(fs.readFileSync(path.join(privateDir,'ark-roleplay-window.json'),'utf8'));
    assert.equal(saved.settings.width,s.settings.width);assert.equal(saved.settings.moveEnabled,true);assert.equal(saved.settings.fontSize,22);
    assert.equal(BrowserWindow.getAllWindows().length,2);assert.equal(shown>0,visible);assert.equal(ui.panel.isVisible(),visible);assert.equal(pet.isDestroyed(),false);
    let soak;
    const cycles=Number(process.env.SP_UI_SOAK_CYCLES||0);
    if(cycles){
      const started=Date.now(),samples=[],crashes=[];
      ui.panel.webContents.on('render-process-gone',(_event,details)=>crashes.push(details.reason));
      await js('window.soakErrors=[];addEventListener("error",e=>soakErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>soakErrors.push(String(e.reason)));');
      const sample=()=>({cycle:samples.length?cycles:0,workingSetKB:app.getAppMetrics().reduce((n,m)=>n+m.memory.workingSetSize,0),windows:BrowserWindow.getAllWindows().length});
      samples.push(sample());
      await command({name:'close'});await ended(false);
      for(let i=0;i<cycles;i++){
        await click();await ended(true);
        const page=i%2?'people':'world';
        const target=await js('(()=>{const r=document.querySelector("[data-page='+page+']").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
        await mouse('mousePressed',target,{buttons:1});await mouse('mouseReleased',target);
        await until(()=>js('document.querySelector("[data-page='+page+']").getAttribute("aria-current")==="true"'),'soak page input delivered');
        await click();await ended(false);
        if(i%10===0){const opening=command({name:'toggle'});await delay(100);await command({name:'toggle'});assert.equal((await opening).interrupted,true);await ended(false);}
        assert.equal(ui.panel.id,firstId);assert.equal(BrowserWindow.getAllWindows().length,2);assert.deepEqual(crashes,[]);
        if(i%30===29)console.log('Native soak progress: '+(i+1)+'/'+cycles);
      }
      await command({name:'panel-settings',settings:{sway:false}});await delay(300);
      const atRest=reports;await delay(500);assert.equal(reports-atRest,0);
      assert.deepEqual(await js('soakErrors'),[]);samples.push(sample());
      soak={cycles,reversals:Math.ceil(cycles/10),elapsedMs:Date.now()-started,restReports:reports-atRest,rendererErrors:0,crashes:0,samples};
    }
    console.log(JSON.stringify({hiddenRoleplay:!visible,nativeInput:true,reusedPanel:true,controlsDelivered:true,visibleWindows:shown,compositorFrames:offsets.length,continuousReverse:true,restReports,paging,offlineDraftPreserved:true,soak}));
  }finally{process.stdout.write=stdout;clearTimeout(callbackTimer);if(ui.panel.webContents.debugger.isAttached())ui.panel.webContents.debugger.detach();ui.cleanup();pet.destroy();callbackServer?.closeAllConnections();if(callbackServer)await new Promise(resolve=>callbackServer.close(resolve));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  app.exit(0);
}
test('one native surface keeps the pendant attached, animates without resizing and accepts input',
  {skip:process.env.SP_E2E!=='1'||!existsSync(electron),timeout:nativeTimeout+5000},async()=>{
    const temp=await mkdtemp(join(tmpdir(),'sp-roleplay-panel-'));
    try{
      const script=join(temp,'hidden.cjs');await writeFile(script,'('+hiddenMain.toString()+')().catch(e=>{console.error(e.stack);require("electron").app.exit(1)});');
      const env={...process.env,DSH_HOME:temp};delete env.ELECTRON_RUN_AS_NODE;
      const {stdout}=await promisify(execFile)(electron,['--no-sandbox','--force-device-scale-factor=1',script,join(root,'server/desktop')],{env,windowsHide:true,timeout:nativeTimeout,maxBuffer:1024*1024});
      const result=JSON.parse(stdout.split(/\r?\n/u).find(line=>line.startsWith('{"hiddenRoleplay"')));assert.equal(result.visibleWindows>0,process.env.SP_UI_VISIBLE==='1');console.log('Native UI evidence: '+JSON.stringify(result));
    }finally{assert.ok(temp.startsWith(join(tmpdir(),'sp-roleplay-panel-')));await rm(temp,{recursive:true,force:true});}
  });
