/* global window, document, requestAnimationFrame, cancelAnimationFrame */
(() => {
  const bridge=window.arkDesktop;if(!bridge?.onShell||!window.ArkMotion)return;
  const {Spring,Pendulum}=window.ArkMotion, panelSpring=new Spring(), pendulum=new Pendulum(), cordSpring=new Spring(0,12);
  const motion=document.createElement('div'),surface=document.createElement('div'),charm=document.createElement('button');
  motion.id='panelMotion';surface.id='panelSurface';charm.className='charm';charm.setAttribute('aria-label','角色面板');charm.setAttribute('aria-expanded','false');
  charm.innerHTML='<svg class="cord" aria-hidden="true"><path fill="none" stroke="#eddba6" stroke-width="2"/></svg><svg class="gem" viewBox="0 0 80 96" aria-hidden="true"><defs><linearGradient id="pendantFacet" x2="1" y2="1"><stop stop-color="#cde9fb"/><stop offset=".5" stop-color="#8399cb"/><stop offset="1" stop-color="#b697c6"/></linearGradient></defs><path d="M33 14V9a7 7 0 0114 0v5" fill="none" stroke="#e9d9a0" stroke-width="2"/><path d="M40 13L9 37v18l31 34 31-34V37z" fill="url(#pendantFacet)" stroke="#f2e3ce" stroke-width="2"/><path d="M9 37l31 13 31-13M40 13v76M9 55l31-5 31 5" fill="none" stroke="#f3eef4b0"/><path class="gleam" d="M40 13L9 37l31 13z" fill="#fff" opacity=".2"/><path d="M40 31l5 13 13 6-13 6-5 14-5-14-13-6 13-6z" fill="#fff2dc" opacity=".95"/></svg>';
  const cord=charm.querySelector('.cord'),rope=cord.querySelector('path'),gem=charm.querySelector('.gem'),gleam=charm.querySelector('.gleam');
  surface.append(...document.body.children);motion.append(surface,charm);document.body.append(motion);
  document.documentElement.classList.add('native-shell');document.body.classList.add('native-shell');
  let prefs={gemSize:80,lineLength:72,sway:true,reducedMotion:false,moveEnabled:false};
  let layout,hidden=false,frame,last,y=0,velocity=0,target=0,open=false,activeMotion,drag,angle=0,lastReport=0,reported={y:-1,angle:-1,stretch:-1};
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduce=()=>prefs.reducedMotion||reduced.matches;
  const command=async value=>{try{return await bridge.command(value);}catch{charm.title='面板正在恢复连接，稍后可以再次点击';return {ok:false};}};
  const swaying=()=>prefs.sway&&!reduce()&&(!document.hidden||hidden);
  const notify=value=>bridge.shellReport({progress:layout?y/layout.panelHeight:0,angle,stretch:cordSpring.value,...value});
  function paint(){if(!layout)return;motion.style.transform='translate3d(0,'+(y-layout.panelHeight)+'px,0)';charm.style.rotate=angle+'deg';motion.dataset.offset=String(y);motion.dataset.angle=String(angle);
    const length=prefs.lineLength+cordSpring.value,bend=Math.sin(pendulum.angle)*7;
    cord.style.height=length+'px';cord.setAttribute('viewBox','0 0 20 '+length);rope.setAttribute('d',`M10 0Q${10+bend} ${length*.5} 10 ${length}`);
    gem.style.transform=`perspective(400px) rotateY(${angle*.65}deg) rotateZ(${-angle*.12}deg)`;gleam.style.opacity=String(.22+angle/100);
  }
  function schedule(){if(!frame){last=undefined;motion.dataset.resting='false';frame=requestAnimationFrame(step);}}
  function step(time){
    frame=undefined;const dt=Math.min(.04,(time-(last||time-16))/1000);last=time;
    let moving=!!activeMotion;
    if(moving&&!drag){
      if(reduce()){y=target;velocity=0;}
      else{panelSpring.value=y;panelSpring.velocity=velocity;panelSpring.target=target;panelSpring.step(dt);y=panelSpring.value;velocity=panelSpring.velocity;
        if(y<0||y>layout.panelHeight){y=Math.max(0,Math.min(layout.panelHeight,y));velocity=0;}}
      if(Math.abs(y-target)<.25&&Math.abs(velocity)<4){y=target;velocity=0;moving=false;}
    }
    pendulum.length=prefs.lineLength+prefs.gemSize*.6;
    const swinging=pendulum.step(dt,!swaying());angle=pendulum.angle*180/Math.PI;
    cordSpring.target=drag&&!drag.moving&&!reduce()?Math.min(8,Math.abs(velocity)*.004):0;
    const stretching=cordSpring.step(dt,reduce());
    paint();
    if(time-lastReport>50&&(Math.abs(y-reported.y)>.3||Math.abs(angle-reported.angle)>.15||Math.abs(cordSpring.value-reported.stretch)>.15)){
      notify({phase:drag?'drag':'frame'});lastReport=time;reported={y,angle,stretch:cordSpring.value};}
    if(activeMotion&&!moving){const id=activeMotion;activeMotion=undefined;delete document.body.dataset.transition;notify({phase:'done',id});}
    if(moving||swinging||stretching||drag)frame=requestAnimationFrame(step);else{last=undefined;motion.dataset.resting='true';notify({phase:'rest'});}
  }
  function configure(value){
    prefs={...prefs,...value};document.documentElement.style.setProperty('--gem',prefs.gemSize+'px');document.documentElement.style.setProperty('--rope',prefs.lineLength+'px');
    charm.title='点击切换开关，下拉展开，上推收起'+(prefs.moveEnabled?'；Alt+拖动调整横向位置':'');
    if(!swaying()){pendulum.step(0,true);angle=0;paint();}schedule();
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
      if(swaying())pendulum.kick(open?6:-6);
    }
  });
  void bridge.status().then(s=>{hidden=s.hidden;configure(s.settings);if(!layout){geometry(s.layout,s.visible);open=s.panelOpen;y=s.progress*s.layout.panelHeight;target=open?s.layout.panelHeight:0;paint();}}).catch(()=>{});
  charm.addEventListener('pointerenter',()=>{if(swaying()){pendulum.kick(18);schedule();}});
  charm.addEventListener('pointerdown',e=>{
    if(e.button!==0||!layout)return;charm.setPointerCapture(e.pointerId);
    activeMotion=undefined;drag={x:e.screenX,y:e.screenY,lastX:e.screenX,lastY:e.screenY,lastTime:e.timeStamp,base:y,open,anchor:window.screenX+layout.gemX,moving:prefs.moveEnabled&&e.altKey,dx:0,dy:0};
    void command({name:'motion-grab'});void command({name:'dock-drag',active:true});notify({phase:'drag'});
    schedule();
  });
  charm.addEventListener('pointermove',e=>{
    if(!drag)return;drag.dx=e.screenX-drag.x;drag.dy=e.screenY-drag.y;
    if(swaying())pendulum.kick((e.screenX-drag.lastX)*.35+(e.screenY-drag.lastY)*.035);
    if(drag.moving)charm.style.translate=drag.dx+'px 0';
    else{y=Math.max(0,Math.min(layout.panelHeight,drag.base+drag.dy));velocity=Math.max(-1400,Math.min(1400,(e.screenY-drag.lastY)/Math.max(.016,(e.timeStamp-drag.lastTime)/1000)));paint();notify({phase:'drag'});}
    drag.lastX=e.screenX;drag.lastY=e.screenY;drag.lastTime=e.timeStamp;schedule();
  });
  const end=async(e,cancel=false)=>{
    if(!drag)return;const d=drag;drag=null;charm.style.translate='';await command({name:'dock-drag',active:false});
    if(d.moving&&!cancel){await command({name:'dock-position',x:d.anchor+e.screenX-d.x,y:e.screenY});schedule();return;}
    const click=Math.max(Math.abs(d.dx),Math.abs(d.dy))<6;
    const desired=cancel?d.open:click?!d.open:Math.abs(d.dy)>=36?d.dy>0:Math.abs(d.dy)>8&&Math.abs(velocity)>450?velocity>0:d.open;
    await command({name:'settle',open:desired});
  };
  charm.addEventListener('pointerup',e=>void end(e));charm.addEventListener('pointercancel',e=>void end(e,true));
  charm.addEventListener('lostpointercapture',e=>{if(drag)void end(e,true);});
  window.addEventListener('blur',()=>{if(drag)void end({screenX:drag.lastX,screenY:drag.lastY},true);});
  charm.addEventListener('click',e=>{if(e.detail===0)void command({name:'toggle'});});
  document.addEventListener('visibilitychange',()=>{if(swaying())schedule();else if(!activeMotion){cancelAnimationFrame(frame);frame=undefined;}});
  reduced.addEventListener('change',()=>{configure({});});
})();
