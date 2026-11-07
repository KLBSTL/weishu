/* global window, document, requestAnimationFrame, cancelAnimationFrame */
(() => {
  const bridge=window.arkDesktop;if(!bridge?.onShell)return;
  const motion=document.createElement('div'),surface=document.createElement('div'),charm=document.createElement('button');
  motion.id='panelMotion';surface.id='panelSurface';charm.className='charm';charm.setAttribute('aria-label','角色面板');charm.setAttribute('aria-expanded','false');
  charm.innerHTML='<svg viewBox="0 0 80 96" aria-hidden="true"><defs><linearGradient id="pendantFacet" x2="1" y2="1"><stop stop-color="#cde9fb"/><stop offset=".5" stop-color="#8399cb"/><stop offset="1" stop-color="#b697c6"/></linearGradient></defs><path d="M33 14V9a7 7 0 0114 0v5" fill="none" stroke="#e9d9a0" stroke-width="2"/><path d="M40 13L9 37v18l31 34 31-34V37z" fill="url(#pendantFacet)" stroke="#f2e3ce" stroke-width="2"/><path d="M9 37l31 13 31-13M40 13v76M9 55l31-5 31 5" fill="none" stroke="#f3eef4b0"/><path d="M40 31l5 13 13 6-13 6-5 14-5-14-13-6 13-6z" fill="#fff2dc" opacity=".95"/></svg>';
  surface.append(...document.body.children);motion.append(surface,charm);document.body.append(motion);
  document.documentElement.classList.add('native-shell');document.body.classList.add('native-shell');
  let prefs={gemSize:80,lineLength:72,sway:true,reducedMotion:false,moveEnabled:false};
  let layout,hidden=false,frame,last,y=0,velocity=0,target=0,open=false,activeMotion,drag,angle=0,angularVelocity=0,lastReport=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduce=()=>prefs.reducedMotion||reduced.matches;
  const swaying=()=>prefs.sway&&!reduce()&&(!document.hidden||hidden);
  const notify=value=>bridge.shellReport({progress:layout?y/layout.panelHeight:0,angle,...value});
  function paint(){if(!layout)return;motion.style.transform='translate3d(0,'+(y-layout.panelHeight)+'px,0)';charm.style.rotate=angle+'deg';motion.dataset.offset=String(y);motion.dataset.angle=String(angle);}
  function schedule(){if(!frame){last=undefined;frame=requestAnimationFrame(step);}}
  function step(time){
    frame=undefined;const dt=Math.min(.04,(time-(last||time-16))/1000);last=time;
    let moving=!!activeMotion;
    if(moving&&!drag){
      if(reduce()){y=target;velocity=0;}
      else{const w=18,d=y-target,c=velocity+w*d,e=Math.exp(-w*dt);y=target+(d+c*dt)*e;velocity=(velocity-w*c*dt)*e;
        if(y<0||y>layout.panelHeight){y=Math.max(0,Math.min(layout.panelHeight,y));velocity=0;}}
      if(Math.abs(y-target)<.25&&Math.abs(velocity)<4){y=target;velocity=0;moving=false;}
    }
    if(swaying()&&!drag){
      const wanted=3.4*Math.sin(time/5800*Math.PI*2)+.8*Math.sin(time/11900*Math.PI*2);
      angularVelocity+=((wanted-angle)*18-angularVelocity*4.4)*dt;angle=Math.max(-8,Math.min(8,angle+angularVelocity*dt));
    }else{angle=0;angularVelocity=0;}
    paint();
    if(time-lastReport>32){notify({phase:drag?'drag':'frame'});lastReport=time;}
    if(activeMotion&&!moving){const id=activeMotion;activeMotion=undefined;delete document.body.dataset.transition;notify({phase:'done',id});}
    if(moving||swaying())frame=requestAnimationFrame(step);else last=undefined;
  }
  function configure(value){
    prefs={...prefs,...value};document.documentElement.style.setProperty('--gem',prefs.gemSize+'px');document.documentElement.style.setProperty('--rope',prefs.lineLength+'px');
    charm.title='点击切换开关，下拉展开，上推收起'+(prefs.moveEnabled?'；Alt+拖动调整横向位置':'');
    if(!swaying()){angle=angularVelocity=0;paint();}schedule();
  }
  function geometry(value,visible){
    const fraction=layout?y/layout.panelHeight:0;layout=value;y=fraction*layout.panelHeight;target=open?layout.panelHeight:0;
    document.documentElement.style.setProperty('--panel-layout-height',layout.panelHeight+'px');motion.style.setProperty('--anchor-x',layout.gemX+'px');charm.hidden=visible===false;paint();schedule();
  }
  bridge.onSettings(configure);
  bridge.onShell(value=>{
    if(value.type==='layout')geometry(value.layout,value.visible);
    if(value.type==='motion'){
      activeMotion=value.id;open=value.open;target=open?layout.panelHeight:0;charm.setAttribute('aria-expanded',String(open));
      document.body.dataset.transition='active';schedule();
    }
  });
  void bridge.status().then(s=>{hidden=s.hidden;configure(s.settings);if(!layout){geometry(s.layout,s.visible);open=s.panelOpen;y=s.progress*s.layout.panelHeight;target=open?s.layout.panelHeight:0;paint();}}).catch(()=>{});
  charm.addEventListener('pointerenter',()=>{if(swaying()){angularVelocity+=25;schedule();}});
  charm.addEventListener('pointerdown',e=>{
    if(e.button!==0||!layout)return;charm.setPointerCapture(e.pointerId);
    activeMotion=undefined;drag={x:e.screenX,y:e.screenY,lastY:e.screenY,lastTime:e.timeStamp,base:y,open,anchor:window.screenX+layout.gemX,moving:prefs.moveEnabled&&e.altKey,dx:0,dy:0};
    void bridge.command({name:'motion-grab'});void bridge.command({name:'dock-drag',active:true});notify({phase:'drag'});
  });
  charm.addEventListener('pointermove',e=>{
    if(!drag)return;drag.dx=e.screenX-drag.x;drag.dy=e.screenY-drag.y;
    if(drag.moving)charm.style.translate=drag.dx+'px 0';
    else{y=Math.max(0,Math.min(layout.panelHeight,drag.base+drag.dy));velocity=Math.max(-1400,Math.min(1400,(e.screenY-drag.lastY)/Math.max(.016,(e.timeStamp-drag.lastTime)/1000)));paint();notify({phase:'drag'});}
    drag.lastY=e.screenY;drag.lastTime=e.timeStamp;
  });
  const end=async(e,cancel=false)=>{
    if(!drag)return;const d=drag;drag=null;charm.style.translate='';await bridge.command({name:'dock-drag',active:false});
    if(d.moving&&!cancel){await bridge.moveDock(d.anchor+e.screenX-d.x,e.screenY);schedule();return;}
    const click=Math.max(Math.abs(d.dx),Math.abs(d.dy))<6;
    const desired=cancel?d.open:click?!d.open:Math.abs(d.dy)>=36?d.dy>0:d.open;
    await bridge.command({name:'settle',open:desired});
  };
  charm.addEventListener('pointerup',e=>void end(e));charm.addEventListener('pointercancel',e=>void end(e,true));
  charm.addEventListener('click',e=>{if(e.detail===0)void bridge.command({name:'toggle'});});
  document.addEventListener('visibilitychange',()=>{if(swaying())schedule();else if(!activeMotion){cancelAnimationFrame(frame);frame=undefined;}});
  reduced.addEventListener('change',()=>{configure({});});
})();
