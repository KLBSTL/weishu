import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../..', import.meta.url));
const runtime = resolve(root, 'desktop-pet');
const electron = process.env.DSH_PET_ELECTRON_PATH || join(runtime, 'state/electron/electron.exe');
function renderer(origin) {
  window.strongholdPetConfig = { origin, token: 'T'.repeat(43) };
  window.BASE = origin + '/dsh-pet-7340';
  window.__dshPetDebug = {};
  window.toScreen = v => v;
  window.S = { pick: list => list[0] };
  window.arkDesktop = { onCommand: callback => { window.panelCommand = callback; }, report: value => { window.panelReport = value; } };
  document.body.innerHTML = '<div id="hit" style="position:absolute;left:300px;top:180px;width:180px;height:180px"></div>';
  window.PetSprite = class {
    pet = { id: 'main' };
    hit = document.querySelector('#hit');
    el = this.hit;
    size = 180;
    front = 0;
    menuItems = [];
    animations = { idle: ['idle'] };
    videoA = document.createElement('video');
    videoB = document.createElement('video');
    dragState = { active: false };
    inputRegionElements = new Set();
    inputRegionResize = { observe() {}, unobserve() {} };
    visibleClampRect() { return { x: 0, y: 0, w: innerWidth, h: innerHeight }; }
    switchTo(_name, once, _id, url) { this.videoA.src = url || ''; this.videoA.loop = !once; }
    playOnce(name) { this.switchTo(name, true); }
    closeMenu() {}
    onContextMenu() {}
    onMenuAction() {}
    stopMove() {}
    clearWhisper() {}
    showWhisper(text) { window.whisperCalls=(window.whisperCalls||0)+1; this.whisperText=text; this.whisperView={}; }
  };
  window.sprites = [new window.PetSprite()];
  window.nativeClicks=[];document.addEventListener('click',e=>{window.nativeClicks.push(e.target.dataset.role||e.target.tagName);});
}
async function electronMain() {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
  const { setTimeout: delay } = require('node:timers/promises');
  const [source, helper] = process.argv.slice(-2);
  const { decideWindowIgnore, pointerZone } = require(helper + '/pointer-target.js');
  let busy = false, regions, shown = 0, win, gameActive = true;
  const questions = [];
  const dailyQuestions=[];let idleCalls=0,idleDeletes=0,idleReceipts=0,releaseIdle;
  const idleGate=new Promise(resolve=>{releaseIdle=resolve;});
  app.disableHardwareAcceleration();
  const profile = require('node:path').join(__dirname, 'electron-profile');
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile); app.setPath('sessionData', profile);
  ipcMain.on('pet:input-busy', (_e, value) => { busy = value; });
  ipcMain.on('pet:input-regions', (_e, value) => { regions = value; });
  // The test deliberately never focuses or shows the OS window.
  ipcMain.on('pet:request-keyboard-focus', () => {});
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.end(); return; }
    let body = ''; for await (const b of req) body += b;
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head></head><body></body></html>'); return; }
    if (req.url === '/playing.webm') { res.setHeader('Content-Type', 'video/webm'); res.end(fs.readFileSync(source + '/server/desktop/playing.webm')); return; }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/pet/status') res.end(JSON.stringify({ active: gameActive, matchId: 'fixture', pet: 'main', phase: 'PREP' }));
    else if (req.url === '/pet/ask') { questions.push(JSON.parse(body)); res.end(JSON.stringify({ ok: true, requestId: String(questions.length) })); }
    else if(req.url.startsWith('/dsh-pet-7340/chat?')){dailyQuestions.push(JSON.parse(body));res.end(JSON.stringify({ok:true,text:'我现在想喝一杯热茶。'}));}
    else if(req.url==='/dsh-pet-7340/stronghold/idle'){
      if(req.method==='POST'){idleCalls++;if(idleCalls===1)await idleGate;res.end(JSON.stringify({text:'我今天整理了书架，想和你分享一个有趣的小发现。',deliveryId:'public-idle-fixture'}));}
      else if(req.method==='PATCH'){idleReceipts++;if(idleReceipts===1){res.statusCode=500;res.end(JSON.stringify({error:'fixture'}));}else res.end(JSON.stringify({ok:true}));}
      else{if(req.method==='DELETE')idleDeletes++;res.end(JSON.stringify({skipped:true}));}
    }
    else res.end(JSON.stringify({ mode: 'daily', maxChars: 60, proactive:false, idleSeconds:30,bubbleSeconds:20 }));
  });
  server.listen(0, '127.0.0.1'); await require('node:events').once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  await app.whenReady();
  win = new BrowserWindow({ width: 900, height: 700, show: false, frame: false, transparent: true, skipTaskbar: true,
    webPreferences: { preload: helper + '/preload.js', contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  win.on('show', () => { shown++; });
  const until = async read => { for (let i = 0; i < 120; i++) { if (await read()) return; await delay(50); } throw Error('native input timed out: '+JSON.stringify({idleCalls,idleDeletes,clicks:await win.webContents.executeJavaScript('window.nativeClicks')})); };
  try {
    await win.loadURL(origin + '/');
    win.webContents.debugger.attach('1.3');
    const nativeClick = async point => {
      await win.webContents.capturePage();
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    };
    await win.webContents.executeJavaScript('(' + renderer.toString() + ')(' + JSON.stringify(origin) + ')');
    await win.webContents.executeJavaScript(fs.readFileSync(helper + '/sprite/input.js', 'utf8') + '\n;void 0;');
    await win.webContents.executeJavaScript(fs.readFileSync(source + '/server/desktop/native.js', 'utf8') + '\n;void 0;');
    await until(()=>win.webContents.executeJavaScript('!!document.querySelector(".stronghold-pet-chat")'));
    assert.equal(await win.webContents.executeJavaScript('document.querySelector(".stronghold-pet-chat").hidden'),true,'game startup does not open the input bar');
    await win.webContents.executeJavaScript('window.panelCommand({name:"composer",requestId:"game-open"})');
    await until(() => busy && regions?.rects?.length);
    const box = await win.webContents.executeJavaScript("JSON.stringify((()=>{const r=document.querySelector('.stronghold-pet-chat input').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})())");
    const point = JSON.parse(box), bounds = win.getBounds(), margins = { l: 250, t: 400, r: 0, b: 0 };
    const screenPoint = { x: bounds.x + point.x, y: bounds.y + point.y };
    assert.equal(pointerZone(bounds, screenPoint, margins), 'margin');
    assert.equal(decideWindowIgnore(bounds, screenPoint, true, false, 1000, regions, margins), true);
    const ignoring = decideWindowIgnore(bounds, screenPoint, true, busy, 1000, regions, margins);
    assert.equal(ignoring, false, 'real preload IPC makes the margin composer interactive');
    win.setIgnoreMouseEvents(ignoring, { forward: true });
    assert.equal(decideWindowIgnore(bounds, { x: bounds.x + 1, y: bounds.y + 1 }, false, busy, 1000, regions, margins), true, 'desktop outside controls remains passthrough');
    win.webContents.focus();
    await nativeClick(point);
    await until(() => win.webContents.executeJavaScript("document.activeElement.matches('.stronghold-pet-chat input')"));
    await win.webContents.insertText('这轮买谁');
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('.stronghold-pet-chat input').value"), '这轮买谁');
    const sendBox = JSON.parse(await win.webContents.executeJavaScript("JSON.stringify((()=>{const r=document.querySelector('.stronghold-pet-chat button[type=submit]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})())"));
    await nativeClick(sendBox);
    await until(() => questions.length === 1);
    assert.equal(questions[0].text, '这轮买谁');
    await win.webContents.executeJavaScript("(()=>{const input=document.querySelector('.stronghold-pet-chat input');input.value='正在选词';input.dispatchEvent(new CompositionEvent('compositionstart'));input.form.requestSubmit();})()");
    await delay(100); assert.equal(questions.length, 1, 'IME composition cannot accidentally submit');
    await win.webContents.executeJavaScript('document.querySelector("[data-role=close]").click()');
    gameActive = false;
    await until(() => win.webContents.executeJavaScript('window.panelReport && !window.panelReport.roleplay'));
    for (const enabled of [true, true, false]) {
      await win.webContents.executeJavaScript('window.panelCommand(' + JSON.stringify({ name: 'roleplay', enabled, requestId: 'fixture-' + enabled }) + ')');
      assert.equal(await win.webContents.executeJavaScript('window.panelReport.roleplay'), enabled, 'explicit panel commands are idempotent');
    }
    await until(()=>!busy);
    await win.webContents.executeJavaScript('window.panelCommand({name:"roleplay",enabled:true,requestId:"daily-cold"})');
    assert.equal(await win.webContents.executeJavaScript('document.querySelector(".stronghold-pet-chat").hidden'),true,'daily roleplay starts with a closed input bar');
    await win.webContents.executeJavaScript('window.panelCommand({name:"composer",requestId:"daily-open"})');
    await until(()=>win.webContents.executeJavaScript('!!document.querySelector(".stronghold-pet-chat:not([hidden])")'));
    await win.webContents.executeJavaScript('document.activeElement.blur();sprites[0].syncInputBusy()');await delay(80);
    assert.equal(await win.webContents.executeJavaScript('document.activeElement.tagName'),'BODY');
    assert.equal(busy,true,'visible daily controls need their input lease before the first click');
    const coldClick=async selector=>{
      await win.webContents.executeJavaScript('document.activeElement.blur();sprites[0].syncInputBusy()');await delay(60);
      const p=await win.webContents.executeJavaScript('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
      const b=win.getBounds(),q={x:b.x+p.x,y:b.y+p.y};
      assert.equal(pointerZone(b,q,margins),'margin');
      assert.equal(decideWindowIgnore(b,q,true,busy,1000,regions,margins),false,'cold daily control remains clickable beyond the margin timeout: '+selector);
      assert.equal(decideWindowIgnore(b,{x:b.x+1,y:b.y+1},false,busy,1000,regions,margins),true,'unused desktop remains click-through');
      win.setIgnoreMouseEvents(false,{forward:true});
      await nativeClick(p);
    };
    await coldClick('.stronghold-pet-chat input');await win.webContents.insertText('平时你喜欢喝什么');
    await coldClick('.stronghold-pet-chat button[type=submit]');await until(()=>dailyQuestions.length===1);
    assert.equal(dailyQuestions[0].text,'平时你喜欢喝什么');
    await until(()=>win.webContents.executeJavaScript('!document.querySelector(".stronghold-pet-chat button[type=submit]").disabled'));
    await coldClick('[data-role=whisper]');await until(()=>idleCalls===1);
    await until(()=>win.webContents.executeJavaScript('!document.querySelector("[data-role=cancel]").disabled'));
    await coldClick('[data-role=cancel]');await until(()=>idleDeletes===1);releaseIdle();
    await until(()=>win.webContents.executeJavaScript('!document.querySelector("[data-role=whisper]").disabled'));
    await coldClick('[data-role=whisper]');await until(()=>idleCalls===2);
    await until(()=>win.webContents.executeJavaScript('sprites[0].whisperText.includes("整理了书架")'));
    await until(()=>idleReceipts===1);
    const displayed=await win.webContents.executeJavaScript('window.whisperCalls');
    const receipt=await win.webContents.executeJavaScript('window.localStorage.getItem("ark-display-receipts")');
    assert.match(receipt,/public-idle-fixture/);assert.doesNotMatch(receipt,/整理了书架/,'receipt recovery stores no private text');
    await coldClick('[data-role=whisper]');await until(()=>idleCalls===3&&idleReceipts>=2);
    assert.equal(await win.webContents.executeJavaScript('window.whisperCalls'),displayed,'lost ACK retries without replaying the same bubble');
    assert.equal(await win.webContents.executeJavaScript('sprites[0].videoA.src.endsWith("/playing.webm")'),false,'daily buttons cannot restart the game animation');
    await coldClick('[data-role=close]');await until(()=>!busy&&regions.rects.length===0);
    assert.equal(await win.webContents.executeJavaScript('document.querySelector(".stronghold-pet-chat").hidden'),true);
    await win.webContents.executeJavaScript('window.panelCommand({name:"composer",requestId:"reopen-daily"})');
    await until(()=>win.webContents.executeJavaScript('!document.querySelector(".stronghold-pet-chat").hidden'));
    await coldClick('.stronghold-pet-chat input');await until(()=>win.webContents.executeJavaScript('document.activeElement.tagName==="INPUT"'));
    assert.equal(await win.webContents.executeJavaScript('document.activeElement.tagName'),'INPUT');
    await win.webContents.executeJavaScript('window.panelCommand({name:"roleplay",enabled:false,requestId:"daily-off"})');await until(()=>!busy);
    await win.webContents.executeJavaScript('window.panelCommand({name:"composer",requestId:"open-without-roleplay"})');
    assert.equal(await win.webContents.executeJavaScript('document.querySelector(".stronghold-pet-chat").hidden'),false,'input bar can be opened without first enabling roleplay');
    assert.equal(await win.webContents.executeJavaScript('sprites[0].videoA.src.endsWith("/playing.webm")'),false);
    assert.equal(win.isVisible(), false); assert.equal(shown, 0);
    console.log(JSON.stringify({ nativeInput: true, realPreloadIpc: true, chineseInput: true, clickSubmit: true, imeGuard: true, outsidePassthrough: true, visibleWindows: shown }));
  } finally {
    releaseIdle();win?.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  app.exit(0);
}
test('Electron native input IPC accepts a cold composer click and Chinese text without displaying any window',
  { skip: process.env.SP_E2E !== '1' || !existsSync(electron), timeout: 30000 }, async () => {
    const temp = await mkdtemp(join(tmpdir(), 'sp-native-input-'));
    try {
      const script = join(temp, 'hidden.cjs');
      await writeFile(script, renderer.toString() + '\n(' + electronMain.toString() + ')().catch(e=>{console.error(e.stack);require("electron").app.exit(1)});');
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const { stdout } = await promisify(execFile)(electron, ['--no-sandbox', '--force-device-scale-factor=1', script, root, join(runtime, 'node_modules/dsh-pet/runtime/electron-helper')],
        { env, windowsHide: true, timeout: 25000, maxBuffer: 1024 * 1024 });
      const result = JSON.parse(stdout.split(/\r?\n/u).find(line => line.startsWith('{"nativeInput"')));
      assert.equal(result.visibleWindows, 0); assert.equal(result.clickSubmit, true); assert.equal(result.realPreloadIpc, true);
    } finally {
      assert.ok(temp.startsWith(join(tmpdir(), 'sp-native-input-')));
      await rm(temp, { recursive: true, force: true });
    }
  });
