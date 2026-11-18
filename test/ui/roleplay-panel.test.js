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
  const {settings,restoreSettings,shellLayout}=createRequire(import.meta.url)('../../server/desktop/roleplay-config.cjs');
  const prefs=settings({width:2400,height:1600,lineLength:160,gemSize:104});assert.equal(prefs.moveEnabled,false);
  assert.equal(prefs.theme,'book');
  assert.equal(settings({theme:'removed-theme',width:960}).theme,'book');
  assert.equal(settings({theme:'removed-theme',width:960}).width,960);
  assert.throws(()=>settings({moveEnabled:'yes'}));
  const migrated=restoreSettings({settings:{theme:'parchment',width:960,moveEnabled:true}});
  assert.equal(migrated.prefs.theme,'book');
  assert.equal(migrated.prefs.width,960);
  assert.equal(migrated.prefs.moveEnabled,true);
  assert.equal(migrated.petTheme,'parchment');
  const restored=restoreSettings({settings:{...migrated.prefs,theme:'desk'},petTheme:migrated.petTheme});
  assert.equal(restored.prefs.theme,'desk');
  assert.equal(restored.petTheme,'parchment');
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
  if(process.env.SP_UI_CARD)profile.portrait='data:image/png;base64,'+fs.readFileSync(process.env.SP_UI_CARD).toString('base64');
  const data={revision:1,actors:[{id:'main',name:'小雨',assetId:'public-card',characterId:'public-person',resolvedSpeaker:profile,speaker:profile}],
    assets:[{id:'public-card',kind:'card',name:'小雨',card:profile}],bindings:{main:'main'},petIds:['main'],embeddedBooks:[],events:[],states:{},rooms:[],
    userPersona:{name:'你',description:''},preset:{style:''},group:{running:false}};
  const files={'library-ui':[companion,'manager.html'],'library-client.js':[companion,'manager.js'],'library-panel.js':[companion,'panel.js'],'library-prompts.js':[companion,'prompt-editor.js'],
    'library-prompt-transfer.js':[companion,'prompt-transfer.js'],'i18n.js':[source,'../../shared/i18n.js'],'i18nPacks.js':[source,'../../shared/i18nPacks.js'],
    'library-motion.js':[companion,'motion.js'],'library-pagination.js':[companion,'pagination.js'],'library-style.css':[companion,'manager.css'],'library-shell.js':[source,'roleplay-dock.js'],'library-shell.css':[source,'roleplay-dock.css']};
  Object.assign(files,{'library-panel-ui.js':[companion,'panel-ui.js'],'library-panel-theme.css':[companion,'panel-theme.css'],'library-themes.js':[source,'roleplay-themes.cjs']});
  const {themes}=require(path.join(source,'roleplay-themes.cjs'));
  files['library-broadcast.js']=[companion,'broadcast-panel.js'];
  files['library-broadcast-view.js']=[companion,'broadcast-view.js'];
  for(const [id,theme] of Object.entries(themes))for(const name of ['theme.css',...theme.assets]){
    files['library-themes/'+id+'/'+name]=[companion,id,name];
  }
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const name=pathname.split('/').at(-1),file=files[pathname.split('/stronghold/').at(-1)]||files[name];
    if(file){res.setHeader('Content-Type',name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':name.endsWith('.webp')?'image/webp':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(path.join(...file)));return;}
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
  await pet.webContents.executeJavaScript('window.arkDesktop.onCommand(v=>window.arkDesktop.report({requestId:v.requestId,roleplay:v.enabled,game:false}));window.arkDesktop.onSettings(v=>document.documentElement.dataset.theme=v.theme);');
  const privateDir=path.join(process.env.DSH_HOME,'dsh-pet');fs.mkdirSync(privateDir,{recursive:true});fs.writeFileSync(path.join(privateDir,'ark-roleplay-window.json'),JSON.stringify({y:80,settings:{theme:'parchment'}}));
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
    assert.equal(s.settings.theme,'book');
    await until(()=>js('document.documentElement.dataset.theme==="book"&&!!getComputedStyle(document.documentElement).getPropertyValue("--book-shell")'),'upgraded drop-down loads the book theme by default');
    assert.equal(await pet.webContents.executeJavaScript('window.arkDesktop.status().then(s=>s.settings.theme)'),'parchment');
    const beforePetMove=ui.panel.getBounds(),[petX,petY]=pet.getPosition();
    pet.setPosition(petX+20,petY+20);
    assert.deepEqual(ui.panel.getBounds(),beforePetMove,'panel remains anchored when the pet window moves');
    await command({name:'panel-settings',settings:{theme:'parchment'}});
    await until(()=>js('getComputedStyle(document.querySelector(".charm .gem")).backgroundImage.includes("/parchment/pendant.svg")'),'pendant adopts selected theme');
    assert.equal(await pet.webContents.executeJavaScript('document.documentElement.dataset.theme'),'parchment');
    const persistedTheme=JSON.parse(fs.readFileSync(path.join(privateDir,'ark-roleplay-window.json'),'utf8')).settings.theme;
    assert.equal(persistedTheme,'parchment');
    assert.deepEqual((await status()).layout,s.layout);
    await command({name:'panel-settings',settings:{theme:'desk'}});
    await until(()=>js('getComputedStyle(document.querySelector(".charm .gem")).backgroundImage.includes("/desk/tassel.svg")'),'desk tassel adopts selected theme');
    assert.equal(await pet.webContents.executeJavaScript('document.documentElement.dataset.theme'),'parchment');
    await ui.openPanel('dialogue','main');
    await ended(true);
    assert.ok(await js('(()=>{const composer=document.querySelector("#liveComposer").getBoundingClientRect(),panel=document.querySelector("#panelMotion").getBoundingClientRect();return composer.top>=0&&composer.bottom<=panel.bottom&&composer.left>=0&&composer.right<=panel.right})()'),'desk composer fits within the native mouse hit region');
    const more=await js('(()=>{const r=document.querySelector("#deskMore").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    await mouse('mouseMoved',more);
    await until(()=>js('!!document.querySelector("#panelTooltip:popover-open")'),'native toolbar shows a themed tooltip');
    await mouse('mousePressed',more,{buttons:1});await mouse('mouseReleased',more);
    await until(()=>js('!!document.querySelector("#deskShortcuts:popover-open")'),'native toolbar opens the anchored menu');
    assert.ok(await js(`(()=>{
      const menu=document.querySelector('#deskShortcuts').getBoundingClientRect();
      const panel=document.querySelector('#panelMotion').getBoundingClientRect();
      return menu.bottom<=panel.bottom&&menu.right<=panel.right&&!document.querySelector('dialog[open]');
    })()`),'menu stays inside the native input region');
    await ui.panel.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until(()=>js('!document.querySelector("#deskShortcuts:popover-open")'),'Escape dismisses the menu');
    assert.equal((await status()).panelOpen,true);
    await command({name:'panel-settings',settings:{theme:'book'}});
    await until(()=>js('getComputedStyle(document.documentElement).getPropertyValue("--book-frame").includes("frame-paper.svg")'),'the book theme loads in Electron');
    assert.equal(await pet.webContents.executeJavaScript('document.documentElement.dataset.theme'),'parchment');
    assert.ok(await js(`(()=>{
      const rect=id=>document.getElementById(id).getBoundingClientRect();
      const log=rect('liveChat'),strip=rect('subNav'),composer=rect('liveComposer'),panel=rect('panelMotion');
      return log.bottom<=strip.top&&strip.bottom<=composer.top+10&&composer.bottom<=panel.bottom;
    })()`),'bottom tabs and composer fit the native panel, above the pendant');
    await capture('-book');
    await command({name:'panel-settings',settings:{theme:'broadcast'}});
    await until(()=>js('document.querySelector("#broadcastPanel")?.shadowRoot.querySelector(".artist-name strong")?.textContent==="小雨"'),'native broadcast displays the selected person');
    if(profile.portrait)await until(()=>js('!!document.querySelector("#broadcastPanel").shadowRoot.querySelector(".stage-card img")?.naturalWidth'),'native card image loads');
    await until(()=>js('getComputedStyle(document.querySelector("#broadcastPanel").shadowRoot.querySelector(".desk")).display==="flex"'),'native broadcast skin loaded');
    await js('Promise.all([...document.querySelector("#broadcastPanel").shadowRoot.querySelectorAll("img")].map(img=>img.decode())).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
    assert.equal(await js(`(async()=>{const src=getComputedStyle(document.querySelector('.charm .gem')).backgroundImage.slice(5,-2);const img=new Image();img.src=src;await img.decode();return img.src.endsWith('/library-themes/broadcast/arc-cherry-vinyl.webp');})()`),true);
    assert.equal(await js('document.querySelector("main").assignedSlot.name'),'content');
    assert.ok(await js('document.querySelector("#liveComposer").getBoundingClientRect().bottom<=document.querySelector("#panelMotion").getBoundingClientRect().bottom'));
    // capturePage can return the previous compositor surface immediately after a theme switch.
    await until(async()=>{
      const image=await ui.panel.webContents.capturePage();
      const {width,height}=image.getSize();
      const pixel=image.crop({x:Math.floor(width*.55),y:Math.floor(height*.07),width:1,height:1}).toBitmap();
      const paper=image.crop({x:Math.floor(width*.88),y:Math.floor(height*.45),width:1,height:1}).toBitmap();
      if(pixel[0]<85||pixel[0]-pixel[2]<32||Math.min(...paper.subarray(0,3))<212)return false;
      const cover=image.crop({x:Math.floor(width*.16),y:Math.floor(height*.24),width:Math.floor(width*.18),height:Math.floor(height*.23)}).resize({width:24,height:24}).toBitmap();
      const colors=new Set();
      for(let i=0;i<cover.length;i+=4)colors.add([cover[i]>>4,cover[i+1]>>4,cover[i+2]>>4].join(':'));
      if(colors.size<35)return false;
      if(process.env.SP_UI_CAPTURE)fs.writeFileSync(process.env.SP_UI_CAPTURE.replace(/\.png$/u,'-broadcast.png'),image.toPNG());
      return true;
    },'Electron compositor displays the purple broadcast header');
    const stageHit=await js('(()=>{const root=document.querySelector("#broadcastPanel").shadowRoot;const b=root.querySelector(root.querySelector(".stage-card").disabled?".choose-stage-card":".stage-card").getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()');
    await mouse('mousePressed',stageHit,{buttons:1});await mouse('mouseReleased',stageHit);
    if(profile.portrait){
      await until(()=>js('document.querySelector("#portraitDialog[open] img")?.src===document.querySelector("#companionPortrait img")?.src'),'native press opens the active character cover');
      await ui.panel.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await until(()=>js('!document.querySelector("#portraitDialog").open'),'native escape closes the cover');
    }else await until(()=>js('!document.querySelector("#actors").hidden'),'native text-only character can choose a card');
    await command({name:'panel-settings',settings:{theme:'book'}});
    await until(()=>js('!document.querySelector("#broadcastPanel")&&document.querySelector("main").isConnected'),'native controls restored');
    await command({name:'close'});await ended(false);
    assert.equal(s.layout.bounds.y,screen.getDisplayMatching(s.layout.bounds).bounds.y,'old y offset cannot leave the cord floating');
    await until(()=>js('Math.abs(document.getElementById("panelMotion").getBoundingClientRect().bottom)<1'),'closed cord starts at screen edge');
    await capture('-dock',{x:Math.floor(s.layout.gemX-s.layout.margin),y:0,width:Math.ceil(s.layout.margin*2),height:s.layout.tail});
    const lockedAnchor=s.layout.bounds.x+s.layout.gemX;
    await assert.rejects(command({name:'dock-position',x:lockedAnchor-100,y:s.layout.bounds.y+100}),/开启调整位置/);
    const start=await point();await mouse('mousePressed',start,{buttons:1});await mouse('mouseMoved',{x:start.x,y:start.y+90},{buttons:1});
    const drag=await js('(()=>{const m=document.getElementById("panelMotion"),g=document.querySelector(".charm .gem");return {offset:Number(m.dataset.offset),bottom:g.getBoundingClientRect().bottom,inner:innerHeight,edge:m.getBoundingClientRect().bottom};})()');
    assert.ok(drag.offset>80&&drag.offset<100,'entire panel follows the pull');assert.ok(drag.bottom<drag.inner-4,'pendant is never clipped while pulling');assert.ok(Math.abs(drag.edge-drag.offset)<1);
    await capture('-pull');await mouse('mouseReleased',{x:start.x,y:start.y+90});await ended(true);
    assert.equal(await js('document.documentElement.dataset.theme'),'book','drag opens the restored book');
    const firstId=ui.panel.id;
    s=await status();
    assert.ok(await js('(()=>{const m=document.getElementById("panelMotion").getBoundingClientRect(),g=document.querySelector(".charm").getBoundingClientRect();return m.top===0&&g.bottom<=innerHeight;})()'),'open panel and pendant remain on screen');
    await capture('-hanging');
    await command({name:'panel-settings',settings:{theme:'parchment'}});
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
