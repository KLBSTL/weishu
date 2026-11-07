const { join } = require('node:path');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const config = require('./roleplay-config.cjs');

/** One stable transparent surface; animation belongs to the renderer's compositor. */
function install({ app, BrowserWindow, ipcMain, screen, hostRequest, hostReady = () => true, petWindows, helperDir, hidden = false }) {
  let disposed=false, currentPet='main', loadedPet, loading=Promise.resolve(), motion, sequence=0, resize;
  let panelOpen=false, animating=false, progress=0, angle=0, ignore=true;
  const pending=new Map(), state={pets:{},dragging:false};
  const file=join(process.env.DSH_HOME||app.getPath('userData'),'dsh-pet','ark-roleplay-window.json');
  let position={};try{position=JSON.parse(readFileSync(file,'utf8'));}catch{/* first launch */}
  if(!position||typeof position!=='object'||Array.isArray(position))position={};
  let prefs;try{prefs=config.settings(position.settings);}catch{prefs=config.settings();}
  const displays=()=>screen.getAllDisplays();
  let display=displays().find(d=>d.id===position.displayId)||screen.getPrimaryDisplay();
  let anchor=Number.isFinite(position.anchor)?position.anchor:Number.isFinite(position.x)?position.x+config.dockSize(prefs).width/2:undefined;
  let layout=config.shellLayout(prefs,display,anchor),origin;
  const petEntries=()=>[...petWindows.state.windows.entries()];
  const petIdFor=sender=>petEntries().find(([_id,w])=>w.webContents===sender)?.[0];
  const allowed=new Set(['overview','people','world','dialogue','status','settings']);
  const persist=()=>{if(disposed)return;try{Object.assign(position,{settings:prefs,anchor:layout.bounds.x+layout.gemX,displayId:display.id});mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,JSON.stringify(position));}catch{/* optional geometry */}};
  const shell=new BrowserWindow({...layout.bounds,frame:false,show:false,transparent:true,hasShadow:false,skipTaskbar:true,
    resizable:false,fullscreenable:false,focusable:false,alwaysOnTop:true,
    webPreferences:{preload:join(helperDir,'ark-roleplay-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:hidden}});
  const trusted=sender=>sender===shell.webContents||petIdFor(sender)!==undefined;
  const send=(value)=>{if(!disposed&&!shell.isDestroyed())shell.webContents.send('ark:shell',value);};
  const sendSettings=()=>{if(!disposed&&!shell.isDestroyed())shell.webContents.send('ark:settings',prefs);};
  const show=()=>{if(hidden||shell.isDestroyed())return;if(panelOpen||position.visible!==false)shell.showInactive();else shell.hide();};
  function geometry(save=false) {
    layout=config.shellLayout(prefs,display,anchor);anchor=layout.bounds.x+layout.gemX;
    shell.setBounds(layout.bounds);send({type:'layout',layout,visible:position.visible!==false});if(save)persist();
  }
  function finish(value={ok:true,interrupted:true}){if(motion){clearTimeout(motion.timer);motion.resolve(value);motion=null;}}
  function settle(open) {
    finish();panelOpen=open;animating=true;shell.setFocusable(open);show();
    if(open&&!hidden){shell.show();shell.focus();}
    const id='motion-'+ ++sequence;
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{if(motion?.id!==id)return;motion=null;animating=false;resolve({ok:false});},5000);
      motion={id,resolve,timer};send({type:'motion',id,open});
    });
  }
  shell.setIgnoreMouseEvents(true,{forward:true});
  shell.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  shell.webContents.on('will-navigate',(e,url)=>{if(!origin||!url.startsWith(origin+'/dsh-pet-7340/stronghold/library-ui'))e.preventDefault();});
  shell.on('close',e=>{if(!app.isQuitting&&!disposed){e.preventDefault();void settle(false);}});
  async function loadContext(pet,page='overview') {
    if(!allowed.has(page))throw new Error('未知面板页');
    if(!petEntries().some(([id])=>id===pet))pet=petEntries()[0]?.[0]||'main';
    if(loadedPet===pet){shell.webContents.send('ark:navigate',{page});return;}
    const started=Date.now();
    while(!hostReady()){
      if(disposed||Date.now()-started>5000)throw new Error('桌宠回调通道尚未就绪');
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    const r=await hostRequest('POST','/dsh-pet-7340/stronghold/library',JSON.stringify({action:'open',pet}));
    if(r.status!==200)throw new Error('资料面板暂时无法连接');
    const url=new URL(JSON.parse(r.body).url);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/dsh-pet-7340/stronghold/library-ui')throw new Error('无效的本机面板地址');
    origin=url.origin;url.searchParams.set('page',page);currentPet=pet;
    await shell.loadURL(url.href);loadedPet=pet;sendSettings();send({type:'layout',layout,visible:position.visible!==false});shell.webContents.send('ark:navigate',{page});show();
  }
  const context=(pet,page)=>{const result=loading.then(()=>loadContext(pet,page));loading=result.catch(()=>{});return result;};
  const ready=(async()=>{for(let attempt=0;attempt<3;attempt++){try{return await context(currentPet,'overview');}catch(e){if(disposed||attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));}}})();
  // Registration precedes renderer loading; initial status contains everything needed for the first frame.
  const onShellReport=(event,value)=>{
    if(event.sender!==shell.webContents||!value||typeof value!=='object')return;
    if(Number.isFinite(value.progress))progress=Math.max(0,Math.min(1,value.progress));
    if(Number.isFinite(value.angle))angle=Math.max(-8,Math.min(8,value.angle));
    if(value.phase==='done'&&motion?.id===value.id){animating=false;finish({ok:true});show();}
  };ipcMain.on('ark:shell-report',onShellReport);
  const onReport=(event,value)=>{
    const id=petIdFor(event.sender);if(id===undefined||!value||typeof value!=='object')return;
    state.pets[id]={roleplay:value.roleplay===true,game:value.game===true,round:Number(value.round)||null,phase:String(value.phase||'').slice(0,40)};
    const w=pending.get(value.requestId);if(w?.petId===id){clearTimeout(w.timer);pending.delete(value.requestId);w.resolve({ok:true});}
  };ipcMain.on('ark:report',onReport);
  const snapshot=()=>({pets:state.pets,dock:layout.bounds,panel:{...layout.bounds,height:layout.panelHeight},layout,settings:prefs,
    visible:position.visible!==false,panelOpen,animating,progress,hidden});
  ipcMain.handle('ark:status',event=>{if(!trusted(event.sender))throw new Error('未知窗口');return snapshot();});
  const ensureReady=async()=>{await ready.catch(()=>{});if(!loadedPet)await context(currentPet,'overview');};
  const openPanel=async(page='overview',pet=currentPet)=>{await ensureReady();await context(pet,page);if(!panelOpen||animating)return settle(true);show();if(!hidden)shell.focus();return {ok:true};};
  ipcMain.handle('ark:command',async(event,value)=>{
    if(!trusted(event.sender)||!value||typeof value!=='object')throw new Error('未知窗口操作');
    if(value.name==='open')return openPanel(value.page||'overview',value.pet);
    if(value.name==='toggle'){await ensureReady();return settle(!panelOpen);}
    if(value.name==='close'){await ensureReady();return settle(false);}
    if(value.name==='settle'){if(event.sender!==shell.webContents)throw new Error('未知窗口操作');return settle(value.open===true);}
    if(value.name==='motion-grab'){if(event.sender!==shell.webContents)throw new Error('未知窗口操作');finish();animating=false;return {ok:true,panelOpen};}
    if(value.name==='panel-settings'){
      prefs=config.settings({...prefs,...value.settings});geometry(true);sendSettings();return {ok:true,settings:prefs};
    }
    if(value.name==='resize-start'){
      if(event.sender!==shell.webContents||!panelOpen||animating||!Number.isFinite(value.x)||!Number.isFinite(value.y)||!['n','s','e','w','ne','nw','se','sw'].includes(value.edge))throw new Error('无效缩放');
      resize={width:layout.bounds.width,height:layout.panelHeight,left:layout.bounds.x,anchor,edge:value.edge,x:value.x,y:value.y};return {ok:true};
    }
    if(value.name==='resize-move'){
      if(event.sender!==shell.webContents||!resize||!Number.isFinite(value.x)||!Number.isFinite(value.y))throw new Error('无效缩放');
      const dx=value.x-resize.x,dy=value.y-resize.y,e=resize.edge;
      const a=display.workArea,maxWidth=e.includes('e')?a.x+a.width-8-resize.left:e.includes('w')?resize.left+resize.width-a.x-8:resize.width;
      const width=Math.round(Math.max(Math.min(760,maxWidth),Math.min(2400,maxWidth,resize.width+(e.includes('e')?dx:e.includes('w')?-dx:0))));
      anchor=resize.anchor+(e.includes('e')?width-resize.width:0);
      prefs={...prefs,width:Math.max(760,width),
        height:Math.round(Math.max(560,Math.min(1600,resize.height+(e.includes('s')?dy:e.includes('n')?-dy:0))))};
      geometry();return {ok:true};
    }
    if(value.name==='resize-end'){if(event.sender!==shell.webContents)throw new Error('无效缩放');resize=null;persist();sendSettings();return {ok:true};}
    if(value.name==='dock'){position.visible=value.visible===true;persist();send({type:'layout',layout,visible:position.visible});show();return {ok:true};}
    if(value.name==='dock-reset'){display=screen.getPrimaryDisplay();anchor=undefined;geometry(true);return {ok:true};}
    if(value.name==='dock-position'){
      if(event.sender!==shell.webContents||!prefs.moveEnabled||!Number.isFinite(value.x)||!Number.isFinite(value.y))throw new Error('请先在吊坠设置中开启调整位置');
      display=screen.getDisplayNearestPoint({x:Math.round(value.x),y:Math.round(value.y)});anchor=value.x;geometry(true);return {ok:true};
    }
    if(value.name==='dock-drag'){if(event.sender!==shell.webContents)throw new Error('无效拖拽');state.dragging=value.active===true;return {ok:true};}
    if(!['roleplay','composer','refresh'].includes(value.name))throw new Error('未支持的操作');
    const pet=petEntries().find(([id])=>id===(value.pet||currentPet));if(!pet)throw new Error('该桌宠尚未显示');
    const requestId='panel-'+ ++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('桌宠未响应，请重启后再试'));},3500);
      pending.set(requestId,{resolve,timer,petId:pet[0]});pet[1].webContents.send('ark:pet-command',{requestId,name:value.name,enabled:value.enabled===true});
    });
  });
  const pointer=setInterval(()=>{
    if(shell.isDestroyed()||!hidden&&!shell.isVisible())return;
    const p=screen.getCursorScreenPoint(),x=p.x-layout.bounds.x,y=p.y-layout.bounds.y,top=progress*layout.panelHeight;
    const rad=angle*Math.PI/180,rope=prefs.lineLength,gH=prefs.gemSize*1.2;
    const gemX=layout.gemX-Math.sin(rad)*(rope+gH/2),gemY=top+Math.cos(rad)*(rope+gH/2);
    const panelHit=top>0&&x>=0&&x<layout.bounds.width&&y>=0&&y<top;
    const charmHit=position.visible!==false&&(y>=top&&y<top+rope&&Math.abs(x-(layout.gemX-Math.tan(rad)*(y-top)))<7
      ||Math.abs(x-gemX)<prefs.gemSize*.6&&Math.abs(y-gemY)<gH*.6);
    const next=!(state.dragging||panelHit||charmHit);
    if(next!==ignore){ignore=next;shell.setIgnoreMouseEvents(ignore,{forward:true});}
  },32);pointer.unref();
  const clamp=()=>{display=displays().find(d=>d.id===display.id)||screen.getPrimaryDisplay();geometry(true);};
  screen.on('display-removed',clamp);screen.on('display-metrics-changed',clamp);
  const cleanup=()=>{
    if(disposed)return;app.isQuitting=true;disposed=true;clearInterval(pointer);finish({ok:false});
    screen.removeListener('display-removed',clamp);screen.removeListener('display-metrics-changed',clamp);
    for(const w of pending.values()){clearTimeout(w.timer);w.resolve({ok:false});}pending.clear();
    ipcMain.removeHandler('ark:command');ipcMain.removeHandler('ark:status');ipcMain.removeListener('ark:report',onReport);ipcMain.removeListener('ark:shell-report',onShellReport);shell.destroy();
  };app.once('before-quit',cleanup);
  void ready.catch(()=>{if(!disposed)console.error('角色面板暂时无法连接，请重启桌宠后再试。');});
  return {openPanel,ready,cleanup,get dock(){return shell;},get panel(){return shell;},get animating(){return animating;}};
}
module.exports={install};
