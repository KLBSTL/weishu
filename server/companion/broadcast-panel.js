/* global document, window, MutationObserver */
import './library-broadcast-view.js';

export function createBroadcastPanel({main,open,request,notice,liveChat,petName}) {
  const {t}=window.ArkPanelUI;
  const host=document.createElement('div');
  host.id='broadcastPanel';
  const shadow=host.attachShadow({mode:'open'});
  const base='library-themes/broadcast/';
  for(const name of ['cursors.css','skin.css','panel.css']){
    const sheet=document.createElement('link');
    sheet.rel='stylesheet';sheet.href=base+name;shadow.append(sheet);
  }
  const radio=document.createElement('div');
  radio.className='shell';
  radio.innerHTML=window.ArkBroadcastView.layout(base);
  const tools=document.createElement('slot');tools.name='tools';
  radio.querySelector('.shell-header').append(tools);
  const page=document.createElement('div');
  page.className='page';
  page.innerHTML='<header class="page-heading"><div><h2></h2><small></small></div>'+window.ArkBroadcastView.meterMarkup+'</header><slot name="subnav"></slot><slot name="content"></slot>';
  radio.querySelector('.desk').append(page);
  shadow.append(radio);
  const heading=page.querySelector('h2'), caption=page.querySelector('small');
  const stage=radio.querySelector('.stage-card'), artist=radio.querySelector('.artist-name strong');
  const portrait=document.getElementById('companionPortrait');
  const chooseCard=()=>open('people','actors');
  radio.querySelector('.choose-stage-card').onclick=chooseCard;
  let displayedCover;
  function syncCover(){
    const name=petName()||t('选择角色卡'), image=portrait.querySelector('img');
    artist.textContent=name;artist.title=name;
    radio.querySelector('.choose-stage-card').textContent=t('更换角色卡');
    radio.querySelector('.artist-name small').textContent=t('当前角色');
    if(displayedCover!==image){
      displayedCover=image;
      stage.replaceChildren(...(image ? [image.cloneNode(false)] : []));
    }
    stage.disabled=!image;
    stage.setAttribute('aria-label',t('查看完整卡面')+' · '+name);
    radio.querySelector('.stage-hint').hidden=!image;
  }
  const coverObserver=new MutationObserver(syncCover);
  const section=document.createElement('section');
  section.id='broadcastListen';section.hidden=true;
  section.innerHTML='<article class="summary-card"><h3>世界书摘录</h3><p></p><button type="button">换一条</button></article>';
  main.append(section);
  let index=0,mode='talk',proactive,pending=false,mounted=false,revision=0;
  const getSection=()=>document.body.dataset.section;
  const positions=[];
  const controls=radio.querySelectorAll('.stops button,#tuning');
  function lockControls(locked){for(const control of controls)control.disabled=locked;}
  function showExcerpt(){
    const {title,entries}=liveChat.broadcastProgram();
    index=entries.length?index%entries.length:0;
    section.querySelector('h3').textContent=t(title);
    section.querySelector('p').textContent=entries[index]||t('可以在「世界书 → 条目编辑」填写公开播出的摘录。');
    section.querySelector('button').disabled=entries.length<2;
  }
  section.querySelector('button').onclick=()=>{index++;showExcerpt();};
  const view=window.ArkBroadcastView.install(radio,{
    onPage:key=>open(key,key==='dialogue'&&mode==='listen'?'broadcastListen':undefined),
    onCover:image=>liveChat.showCover(image),
    onMode:selectMode,
    reduced:()=>document.body.classList.contains('reduce-motion'),
  });
  function paint(){
    if(!mounted)return;
    const key=document.body.dataset.page||'overview', id=getSection();
    if(id==='chatPage'&&mode==='listen')mode=proactive===false?'quiet':'talk';
    view.setMode(mode);view.setPage(key);
    radio.dataset.reduced=String(document.body.classList.contains('reduce-motion'));
    heading.textContent=id==='chatPage'?'直播间':id==='broadcastListen'?'收听台':
      document.querySelector('#subNav [aria-current=true]')?.getAttribute('aria-label')||'总览';
    caption.textContent=id==='chatPage'?(mode==='quiet'?'主动碎碎念已暂停 · ':'文字连线 · ')+(petName()||'尚未选择人物'):
      id==='broadcastListen'?(petName()||'当前人物')+' · 收听':'';
    if(id==='chatPage'){
      const name=petName()||'当前人物';
      main.querySelector('#liveMessage').placeholder='发送给'+name+'…';
    }
    if(id==='broadcastListen')showExcerpt();
  }
  function setProactive(value){
    if(typeof value!=='boolean')return;
    revision++;
    proactive=value;
    mode=value?(mode==='quiet'?'talk':mode):'quiet';
    if(mounted&&mode==='quiet'&&getSection()==='broadcastListen')open('dialogue','chatPage');
    paint();
  }
  async function refreshOptions(){
    const version=++revision;
    try{
      const options=await request('chat-options');
      if(mounted&&version===revision)setProactive(options.proactive);
    }catch(e){if(mounted&&version===revision)notice(e.message,true);}
  }
  async function selectMode(next){
    if(pending)return;
    pending=true;lockControls(true);
    const active=++revision;
    try{
      const enabled=next!=='quiet';
      if(proactive!==enabled){
        const saved=await request('chat-options',{proactive:enabled});
        if(saved.proactive!==enabled)throw new Error('频道设置未保存');
      }
      if(!mounted||active!==revision){if(mounted)void refreshOptions();return;}
      proactive=enabled;mode=next;
      open('dialogue',next==='listen'?'broadcastListen':'chatPage');
    }catch(e){if(mounted)notice(e.message,true);}
    finally{pending=false;lockControls(false);paint();}
  }
  function slot(node,name){
    const marker=document.createElement('span');
    marker.hidden=true;node.before(marker);
    node.slot=name;host.append(node);positions.push([marker,node]);
  }
  const observer=new MutationObserver(paint);
  function sync(){
    const active=document.documentElement.dataset.theme==='broadcast';
    if(active===mounted){paint();return;}
    mounted=active;
    document.documentElement.classList.toggle('broadcast-mounted',active);
    if(active){
      (document.getElementById('panelSurface')||document.body).append(host);
      slot(main,'content');slot(document.getElementById('subNav'),'subnav');slot(document.querySelector('.window-tools'),'tools');
      syncCover();coverObserver.observe(portrait,{childList:true});
      observer.observe(document.body,{attributes:true,attributeFilter:['class','data-page','data-section','data-ready']});
      paint();void refreshOptions();
    }else{
      revision++;proactive=undefined;
      observer.disconnect();coverObserver.disconnect();
      for(const [marker,node] of positions.splice(0)){node.removeAttribute('slot');marker.replaceWith(node);}
      host.remove();
      main.querySelector('#liveMessage').removeAttribute('placeholder');
      if(getSection()==='broadcastListen')open('dialogue','chatPage');
    }
  }
  main.querySelector('#liveComposer').addEventListener('submit',()=>{if(mounted)view.transmit();});
  function refreshActor(){index=0;if(mounted){syncCover();paint();}}
  document.addEventListener('companion:loaded',refreshActor);
  document.addEventListener('companion:actor',refreshActor);
  document.addEventListener('companion:language',refreshActor);
  return {sync,setProactive};
}
