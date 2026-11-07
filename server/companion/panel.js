/* global document, window, ResizeObserver, requestAnimationFrame, $, data, pet, actorId, candidates, candidateInfo, bookId, bookDraft, entryIndex, api, reload, notice, selectedActor, token, showBook */
(() => {
  const initial = new URLSearchParams(window.location.search), main = document.querySelector('main'), nav = $('mainNav'), subnav = $('subNav');
  const gem = '<svg viewBox="0 0 40 52" aria-hidden="true"><path class="chain" d="M20 0v10m-5 6v-4a5 5 0 0110 0v4"/><path class="gem-body" d="M20 13L6 24v9l14 16 14-16v-9z"/><path class="facets" d="M6 24l14 7 14-7M20 13v36M6 33l14-2 14 2"/></svg>';
  const pages = {
    overview:['总览',[['overview','人物摘要']]],
    people:['人物',[['actors','角色卡'],['cast','卡内角色'],['actorEditor','人设编辑'],['persona','我的身份']]],
    world:['世界书',[['worldBindings','已启用'],['worldLibrary','世界书库'],['books','条目编辑'],['worldInspect','触发预览']]],
    dialogue:['对话',[['historyPage','聊天回看'],['memories','记忆管理'],['sourcePage','引用来源']]],
    status:['状态',[['runtimePage','运行状态'],['gamePage','卫戍信息'],['moodPage','心情']]],
    settings:['设置',[['roleSettings','角色扮演'],['dialogueSettings','对话与碎碎念'],['appearanceSettings','字体与气泡'],['windowSettings','窗口大小'],['dockSettings','吊坠'],['apiSettings','API连接'],['dataSettings','记忆与历史'],['advancedPage','其他工具']]],
  };
  const bridge=()=>window.arkDesktop;
  const node=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value||'';if(cls)n.className=cls;return n;};
  const section=(id,html)=>{const s=document.createElement('section');s.id=id;s.hidden=true;s.innerHTML=html;main.append(s);return s;};
  let currentSection='overview', inspectedName='', inspectedPerson, previewAsset, historyRows=[], nativeState={}, historyBusy=false, cardRequest=0;
  let prefs={width:1200,height:800,fontFamily:'Microsoft YaHei',fontSize:18,gemSize:80,lineLength:72,sway:true,reducedMotion:false,moveEnabled:false};
  try{prefs={...prefs,...JSON.parse(window.localStorage.getItem('ark-panel-prefs')||'{}')};}catch{/* defaults */}
  for(const [key,[label]] of Object.entries(pages)){const b=node('button');b.dataset.page=key;b.innerHTML=gem;b.append(node('span',label));b.onclick=()=>open(key);nav.append(b);}
  section('overview','<article id="profileSummary" class="character-frame"></article><article class="summary-card"><h3>当前人物</h3><dl id="configSummary" class="card-facts"></dl><button data-open="people">选择人物</button></article><article class="summary-card"><h3>最近的对话</h3><p id="latestSpeech"></p><button data-open="dialogue">回看</button></article>');
  section('cast','<div class="cast-layout"><nav id="castList" class="item-list" aria-label="卡内角色"></nav><article id="castDetail" class="character-frame cast-detail"><div id="castHeading" class="profile-heading"></div><div id="castBiography" class="paged-body"></div><div class="actions"><div id="castPager"></div><button id="applyCast" class="primary">使用这个角色</button></div></article></div>');
  section('historyPage','<div class="toolbar"><input id="historyFilter" placeholder="搜索最近对话"><button id="refreshHistory" title="刷新" aria-label="刷新对话">↻</button></div><div id="chatHistory" class="paged-body"></div><div class="page-footer"><span id="historyCount"></span><div id="historyPager"></div></div>');
  section('sourcePage','<div id="sourceList"></div>');
  section('runtimePage','<div id="runtimeView"></div><button id="refreshRuntime" title="刷新状态">刷新</button>');
  section('gamePage','<p id="gameInfo"></p>');
  section('moodPage','<div class="character-frame"><h2>心情</h2><p>暂未开启</p></div>');
  section('roleSettings','<div class="choice-grid"><button id="startRole">开启角色扮演</button><button id="stopRole">停止角色扮演</button><button id="openComposer">打开输入栏</button></div><p id="desktopHint" class="note"></p>');
  section('dialogueSettings','<form id="chatSettingsForm"><div class="form-grid"><label>回复模式<select id="optionMode"><option value="daily">日常模式</option><option value="unlimited">无限制模式</option></select></label><label>请求强度<select id="optionEffort"><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label><label>回复字数<input id="optionChars" type="number" min="1" max="2000"></label><label>主动聊天<select id="optionProactive"><option value="true">开启</option><option value="false">关闭</option></select></label><label>碎碎念间隔<select id="optionIdle"><option>10</option><option>15</option><option>20</option><option>30</option><option>45</option><option>60</option></select></label></div><div class="actions"><button class="primary">保存</button></div></form>');
  section('appearanceSettings','<form id="appearanceForm"><div class="form-grid"><label>字体<select id="fontFamily"><option value="Microsoft YaHei">微软雅黑</option><option value="DengXian">等线</option><option value="Source Han Sans SC">思源黑体</option><option value="SimSun">宋体</option><option value="KaiTi">楷体</option><option value="system-ui">系统默认</option><option value="custom">自定义</option></select></label><label>字号<input id="fontSize" type="number" min="14" max="28"></label><label id="customFontLabel" hidden>本机字体名称<input id="customFont" maxlength="64"></label><label>气泡时长<select id="optionBubble"><option>15</option><option>20</option><option>30</option><option>60</option><option>120</option></select></label><label class="check"><input id="reduceMotion" type="checkbox">减少动效</label></div><div class="actions"><button class="primary">保存</button></div></form>');
  section('windowSettings','<form id="windowForm" class="settings-page"><div class="form-grid"><label class="wide">窗口大小<select id="windowPreset"><option value="960x640">960 × 640</option><option value="1200x800">1200 × 800</option><option value="1440x900">1440 × 900</option><option value="custom">自定义</option></select></label><label>宽度<input id="windowWidth" type="number" min="760" max="2400"></label><label>高度<input id="windowHeight" type="number" min="560" max="1600"></label></div><div class="actions"><button class="primary">应用</button></div></form>');
  section('dockSettings','<form id="dockForm" class="settings-page"><div class="form-grid"><label>宝石大小<select id="gemSize"><option>64</option><option>80</option><option>96</option><option>104</option></select></label><label>线长<input id="lineLength" type="number" min="24" max="160"></label><label class="check"><input id="dockSway" type="checkbox">轻微摆动</label><label class="check"><input id="dockMove" type="checkbox">允许调整位置（Alt+拖动）</label></div><div class="toolbar"><button type="button" id="showDock">显示</button><button type="button" id="hideDock">隐藏</button><button type="button" id="resetDock">重置位置</button></div><div class="actions"><button class="primary">保存</button></div></form>');
  section('apiSettings','<form id="apiForm"><div class="form-grid"><label>协议<select id="apiProtocol"><option value="openai-compatible">OpenAI兼容</option><option value="anthropic">Anthropic</option></select></label><label>模型<input id="apiModel" required></label><label class="wide">服务地址<input id="apiBase" type="url" required></label><label class="wide">密钥<input id="apiKey" type="password" autocomplete="new-password" placeholder="留空保留已有密钥"></label></div><p id="apiKeyState" class="note"></p><div class="actions"><button type="button" id="testApi">测试连接</button><button class="primary">保存</button></div></form>');
  section('advancedPage','<div class="toolbar"><button data-legacy="preview">卡面预览</button><button data-legacy="rooms">角色对话</button><button id="openResearch">整理背景</button></div>');
  section('dataSettings','<div class="context-name" data-person-name></div><p>清空当前人物的聊天、记忆和碎碎念进度。角色卡、世界书和连接设置会保留。</p><button id="clearHistory">清空记忆和历史记录</button>');
  const clearDialog=document.createElement('dialog');clearDialog.id='clearHistoryDialog';
  clearDialog.innerHTML='<p id="clearHistoryQuestion"></p><div class="actions"><button id="confirmClearHistory">确认清空</button><button id="cancelClearHistory">取消</button></div>';
  document.body.append(clearDialog);
  let clearPreview;
  $('clearHistory').onclick=async()=>{
    try{const target=actorId;const preview=await api('clear-history-preview',{actorId:target});clearPreview={...preview,actorId:target};
      $('clearHistoryQuestion').textContent=`清空「${preview.name}」的全部记忆和历史记录？删除后无法恢复。`;
      clearDialog.showModal();$('cancelClearHistory').focus();}catch(e){error(e);}
  };
  $('cancelClearHistory').onclick=()=>{clearPreview=null;clearDialog.close();};
  clearDialog.addEventListener('cancel',()=>{clearPreview=null;});
  $('confirmClearHistory').onclick=async()=>{
    if(!clearPreview||$('confirmClearHistory').disabled)return;$('confirmClearHistory').disabled=true;
    try{await api('clear-history',{actorId:clearPreview.actorId,confirmation:clearPreview.confirmation});clearPreview=null;clearDialog.close();await reload();historyRows=[];chatPages.set([]);notice('记忆和历史记录已清空。');}
    catch(e){error(e);}finally{$('confirmClearHistory').disabled=false;}
  };
  const bioPages=new window.FittedPages($('castBiography'),$('castPager'),r=>node('p',r.text,'cast-biography'));
  const chatPages=new window.FittedPages($('chatHistory'),$('historyPager'),renderChat);
  function avatar(p){const a=node('span','','portrait');if(typeof p.portrait==='string'&&p.portrait.length<350000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(p.portrait)){const i=document.createElement('img');i.src=p.portrait;i.alt=p.name;a.append(i);}else{a.textContent=Array.from(p.name||'未')[0];a.title='暂无独立头像';}return a;}
  function heading(target,p){target.replaceChildren(avatar(p),node('h2',p.name));}
  function showSection(id){for(const s of document.querySelectorAll('main>section'))s.hidden=s.id!==id;currentSection=id;for(const b of subnav.querySelectorAll('button'))b.setAttribute('aria-current',String(b.dataset.section===id));bioPages.refresh();chatPages.refresh();}
  function open(key,target){
    if(!pages[key])key='overview';document.body.classList.toggle('overview-page',key==='overview');
    for(const b of nav.querySelectorAll('button'))b.setAttribute('aria-current',String(b.dataset.page===key));
    subnav.replaceChildren();for(const [id,label] of pages[key][1]){const b=node('button',label);b.dataset.section=id;b.onclick=()=>navigate(id);subnav.append(b);}
    navigate(target||pages[key][1][0][0]);
  }
  function navigate(id){
    showSection(id);
    if(id==='cast')renderCast();
    if(id==='historyPage')void loadHistory().catch(error);
    if(id==='sourcePage')void sources().catch(error);
    if(['runtimePage','gamePage','roleSettings'].includes(id))void runtime();
    if(['dialogueSettings','appearanceSettings'].includes(id))void loadOptions().catch(error);
    if(id==='apiSettings')void loadApi().catch(error);
    if(['windowSettings','dockSettings','appearanceSettings'].includes(id))paintPreferences();
  }
  function error(e){notice(e.message||'操作未完成',true);}
  async function request(path,body,method=body?'POST':'GET'){
    const r=await fetch(path,{method,headers:{...(body&&{'Content-Type':'application/json'}),...(token&&{'X-DSH-Pet-Token':token})},...(body&&{body:JSON.stringify(body)})});
    const value=await r.json();if(!r.ok)throw new Error(value.error||'操作未完成');return value;
  }
  async function command(name,values={}){
    if(!bridge()){notice('此操作请在桌面面板中使用');return;}
    const result=await bridge().command({name,pet,...values});if(result?.ok===false)throw new Error('操作未完成');return result;
  }
  function applyPreferences(){
    const root=document.documentElement;
    root.style.setProperty('--font-family','"'+prefs.fontFamily.replace(/["\\]/gu,'')+'",system-ui,sans-serif');root.style.setProperty('--font-size',prefs.fontSize+'px');
    document.body.classList.toggle('reduce-motion',prefs.reducedMotion);bioPages.refresh();chatPages.refresh();
  }
  async function savePreferences(patch){
    const next={...prefs,...patch};
    if(bridge()){const r=await command('panel-settings',{settings:next});prefs={...prefs,...r.settings};}
    else prefs=next;
    window.localStorage.setItem('ark-panel-prefs',JSON.stringify(prefs));applyPreferences();paintPreferences();
  }
  function paintPreferences(){
    $('fontSize').value=prefs.fontSize;$('gemSize').value=prefs.gemSize;$('lineLength').value=prefs.lineLength;$('dockSway').checked=prefs.sway;$('dockMove').checked=prefs.moveEnabled;$('reduceMotion').checked=prefs.reducedMotion;
    const known=[...$('fontFamily').options].some(o=>o.value===prefs.fontFamily);
    $('fontFamily').value=known?prefs.fontFamily:'custom';$('customFont').value=known?'':prefs.fontFamily;$('customFontLabel').hidden=known;
    $('windowWidth').value=prefs.width;$('windowHeight').value=prefs.height;
    const size=prefs.width+'x'+prefs.height;$('windowPreset').value=[...$('windowPreset').options].some(o=>o.value===size)?size:'custom';
  }
  async function runtime(){
    try{nativeState=await bridge()?.status()||{};const info=nativeState.pets?.[pet];$('toggleRole').setAttribute('aria-pressed',String(!!info?.roleplay));$('toggleRole').title=info?.roleplay?'停止角色扮演':'开启角色扮演';
      const pending=await request('idle-status?pet='+encodeURIComponent(pet));$('runtimeView').replaceChildren(node('p',pending.pending?'正在准备话题':'空闲'));
      $('gameInfo').textContent=info?.game?'回合 '+(info.round||'—')+' · '+(info.phase||'—'):'当前没有卫戍对局';$('desktopHint').textContent='';
    }catch{$('runtimeView').textContent='暂时无法读取状态';}
  }
  function fill(){
    if(!data)return;document.body.dataset.ready='true';
    const actor=selectedActor(), p=actor?.resolvedSpeaker||actor?.speaker||{name:actor?.name||'默认人物'}, raw=data.assets.find(a=>a.id===actor?.assetId)?.card||{},card=raw.data||raw;
    for(const n of document.querySelectorAll('[data-person-name]'))n.textContent=p.name;
    const summary=$('profileSummary');summary.replaceChildren();const top=node('div','','profile-heading');heading(top,p);summary.append(top,node('p',cleanBiography(p.description||card.personality||'',p.name).slice(0,220)));
    $('configSummary').replaceChildren(node('dt','角色卡'),node('dd',card.name||'默认'),node('dt','世界书'),node('dd',String((actor?.bookIds?.length||0)+(card.character_book?1:0))));
    $('latestSpeech').textContent=data.events.filter(e=>e.characterId===actor?.characterId&&e.type==='assistant'&&e.deliveryState==='displayed').at(-1)?.text||'暂无对话';
    if(!previewAsset||!data.assets.some(a=>a.id===previewAsset))previewAsset=actor?.assetId;
    renderCards();renderBooks();renderBindings();renderCast();if(currentSection==='historyPage')void loadHistory().catch(error);
    $('createActorDialog').close();
  }
  function renderCards(){
    const shelf=$('cardShelf');shelf.replaceChildren();
    for(const card of data.assets.filter(a=>a.kind==='card')){const b=node('button',card.name);b.dataset.asset=card.id;b.setAttribute('aria-current',String(card.id===previewAsset));b.onclick=()=>{previewAsset=card.id;renderCards();};shelf.append(b);}
    void previewCard();
  }
  async function previewCard(){
    const asset=data.assets.find(a=>a.id===previewAsset),target=$('cardPreview'),seq=++cardRequest;
    if(!asset){target.replaceChildren(node('p','导入一张角色卡'));return;}
    const raw=asset.card.data||asset.card;target.replaceChildren(node('h2',raw.name||asset.name));
    const info=await api('analyze-card',{assetId:asset.id}).catch(()=>null);if(seq!==cardRequest||!info)return;
    const facts=node('dl','','card-facts');facts.append(node('dt','人物'),node('dd',info.candidates.length?info.candidates.map(c=>c.name).join('、'):info.speaker?.name||'我'),node('dt','世界书'),node('dd',String(raw.character_book?.entries?.length||0)+' 条'));
    target.append(facts);
  }
  function people(){
    if(candidateInfo.assetId!==selectedActor()?.assetId)return[];
    if(candidates.length)return candidates;
    return candidateInfo.speaker&&!candidateInfo.sceneCard?[candidateInfo.speaker]:[];
  }
  function renderCast(){
    if(!data)return;const list=$('castList'),all=people();list.replaceChildren();
    const automatic=node('button','自动选择');automatic.dataset.speaker='';automatic.onclick=()=>inspectPerson(null);list.append(automatic);
    for(const p of all){const b=node('button');b.dataset.speaker=p.name;b.append(avatar(p),node('span',p.name));b.onclick=()=>inspectPerson(p);list.append(b);}
    inspectPerson(all.find(p=>p.name===inspectedName)||all.find(p=>p.name===selectedActor()?.resolvedSpeaker?.name)||all[0]||null);
    requestAnimationFrame(()=>{const b=[...list.children].find(b=>b.dataset.speaker===inspectedName);if(b&&!$('cast').hidden)list.scrollTop+=b.getBoundingClientRect().top-list.getBoundingClientRect().top-40;});
  }
  function cleanBiography(value,name){
    const seen=new Set();
    return String(value||'').split('\n').map(x=>x.trim()).filter(line=>{
      if(!line)return true;
      if(/^【[^】]+】$/u.test(line)&&line.includes(name))return false;
      if(/^(?:#{1,4}\s*)?(?:姓名|人物名|角色名)\s*[:：]/u.test(line))return false;
      if(line.length<55&&seen.has(line))return false;seen.add(line);return true;
    }).join('\n').replace(/\n{3,}/gu,'\n\n').trim();
  }
  function inspectPerson(p){
    inspectedPerson=p;inspectedName=p?.name||'';for(const b of $('castList').children)b.setAttribute('aria-current',String(b.dataset.speaker===inspectedName));
    heading($('castHeading'),p||{name:'自动选择'});
    bioPages.set([{id:p?.name||'automatic',text:p?cleanBiography(p.description,p.name):'自动选择资料较丰富的人物。'}]);
    $('applyCast').textContent=p?'使用这个角色':'使用自动选择';
  }
  function renderBooks(){
    const all=[...(data.embeddedBooks||[]),...data.assets.filter(a=>a.kind==='lorebook')];
    $('bookShelf').replaceChildren(...all.map(book=>{const b=node('button',book.name);b.dataset.book=book.id;b.setAttribute('aria-current',String(book.id===bookId));b.onclick=()=>{showBook(book.id);renderBooks();};return b;}));
    const selected=all.find(b=>b.id===bookId);$('bookContext').textContent=selected?.name||'新世界书';$('bookSummary').textContent=(selected?.book.entries?.length||0)+' 个条目';
    renderEntries();
  }
  function renderEntries(){
    const list=$('entryList');list.replaceChildren(...(bookDraft?.entries||[]).map((entry,i)=>{const b=node('button',entry.comment||entry.name||'条目 '+(i+1));b.setAttribute('aria-current',String(i===entryIndex));b.onclick=()=>{$('entry').value=String(i);$('entry').dispatchEvent(new Event('change'));};return b;}));
    $('entrySubjectLabel').hidden=$('entryKnowledge').value!=='self';
  }
  function renderBindings(){
    const actor=selectedActor(), all=data.assets.filter(a=>a.kind==='lorebook');$('enabledBookList').replaceChildren();
    for(const book of all){const label=node('label','','check'),input=document.createElement('input');input.type='checkbox';input.value=book.id;input.checked=actor?.bookIds?.includes(book.id)||false;label.append(input,node('span',book.name));$('enabledBookList').append(label);}
    const source=data.assets.find(a=>a.id===actor?.assetId)?.card,embedded=(source?.data||source)?.character_book;
    if(embedded)$('enabledBookList').prepend(node('p','卡内世界书 · 已启用','note'));
    if(!all.length&&!embedded)$('enabledBookList').append(node('p','暂无世界书','empty'));
  }
  async function loadHistory(){
    if(!actorId||historyBusy)return;historyBusy=true;const expected=actorId;
    try{const r=await api('recent-history',{actorId});if(actorId!==expected)return;historyRows=r.messages;renderHistory();}
    finally{historyBusy=false;}
  }
  function renderChat(r){
    const article=node('article','','chat-record');article.dataset.messageId=r.id;article.dataset.part=String(r.part||0);
    article.append(node('small',(r.type==='user'?data.userPersona.name:r.speakerName||'角色')+' · '+new Date(r.at).toLocaleString()+(r.part?' · 续':'')),node('p',r.text));return article;
  }
  function renderHistory(){
    const query=$('historyFilter').value.trim(),rows=historyRows.filter(r=>!query||r.text?.includes(query));
    $('historyCount').textContent='最近 '+historyRows.length+' 条';chatPages.set(rows);
  }
  async function sources(){const r=await request('sources?pet='+encodeURIComponent(pet));$('sourceList').replaceChildren(...(r.sources||[]).map(s=>node('p',s.title||s.url)));if(!r.sources?.length)$('sourceList').append(node('p','暂无引用','empty'));}
  async function loadOptions(){
    const o=await request('chat-options');for(const[id,value]of Object.entries({optionMode:o.mode,optionEffort:o.effort,optionChars:o.maxChars,optionProactive:String(o.proactive),optionIdle:o.idleSeconds,optionBubble:o.bubbleSeconds}))$(id).value=value;
  }
  async function loadApi(){const v=await request('/standalone-ai/settings');$('apiProtocol').value=v.protocol||'openai-compatible';$('apiBase').value=v.baseUrl||'';$('apiModel').value=v.model||'';$('apiKey').value='';$('apiKeyState').textContent=v.hasKey?'已保存密钥':'尚未配置密钥';}
  function action(id,fn){$(id).addEventListener('click',()=>{void Promise.resolve().then(fn).catch(error);});}
  function submit(id,fn){$(id).addEventListener('submit',e=>{e.preventDefault();void Promise.resolve().then(fn).catch(error);});}
  action('applyCast',async()=>{const expectedName=inspectedName;$('applyCast').disabled=true;try{await api('choose-speaker',{expectedRevision:data.revision,actorId,assetId:selectedActor().assetId,name:expectedName});await reload();notice('已使用'+(inspectedPerson?.name||'自动选择'));}finally{$('applyCast').disabled=false;}});
  action('applyCard',async()=>{if(!previewAsset)throw new Error('请先选择角色卡');await api('choose-speaker',{expectedRevision:data.revision,actorId,assetId:previewAsset,name:''});await reload();notice('角色卡已应用');});
  action('resetPersona',async()=>{await request('persona',{pet,reset:true});await reload();notice('已恢复默认');});
  submit('bookBindings',async()=>{await api('bind-books',{expectedRevision:data.revision,actorId,bookIds:[...$('enabledBookList').querySelectorAll('input:checked')].map(n=>n.value)});await reload();notice('世界书选择已应用');});
  action('editBook',async()=>open('world','books'));
  action('refreshHistory',loadHistory);$('historyFilter').addEventListener('input',renderHistory);
  action('refreshRuntime',runtime);
  submit('chatSettingsForm',async()=>{await request('chat-options',{mode:$('optionMode').value,effort:$('optionEffort').value,maxChars:Number($('optionChars').value),proactive:$('optionProactive').value==='true',idleSeconds:Number($('optionIdle').value)});notice('对话设置已保存');});
  submit('appearanceForm',async()=>{
    const font=$('fontFamily').value==='custom'?$('customFont').value.trim():$('fontFamily').value,size=Number($('fontSize').value);
    if(!/^[\p{L}\p{N} _-]{1,64}$/u.test(font)||!Number.isInteger(size)||size<14||size>28)throw new Error('请检查字体和字号');
    await savePreferences({fontFamily:font,fontSize:size,reducedMotion:$('reduceMotion').checked});await request('chat-options',{bubbleSeconds:Number($('optionBubble').value)});notice('显示设置已保存');
  });
  $('fontFamily').onchange=()=>{$('customFontLabel').hidden=$('fontFamily').value!=='custom';};
  $('windowPreset').onchange=()=>{if($('windowPreset').value!=='custom'){const[w,h]=$('windowPreset').value.split('x');$('windowWidth').value=w;$('windowHeight').value=h;}};
  for(const id of ['windowWidth','windowHeight'])$(id).oninput=()=>{$('windowPreset').value='custom';};
  submit('windowForm',async()=>{await savePreferences({width:Number($('windowWidth').value),height:Number($('windowHeight').value)});notice('窗口大小已应用');});
  submit('dockForm',async()=>{await savePreferences({gemSize:Number($('gemSize').value),lineLength:Number($('lineLength').value),sway:$('dockSway').checked,moveEnabled:$('dockMove').checked});notice('吊坠设置已保存');});
  submit('apiForm',async()=>{const key=$('apiKey').value.trim();await request('/standalone-ai/settings',{protocol:$('apiProtocol').value,baseUrl:$('apiBase').value.trim(),model:$('apiModel').value.trim(),...(key&&{apiKey:key})});await loadApi();notice('模型连接已保存');});
  action('testApi',async()=>{$('testApi').disabled=true;try{const r=await request('/standalone-ai/test',{});notice(r.ok?'连接成功':r.message||'连接未成功',!r.ok);}finally{$('testApi').disabled=false;}});
  action('startRole',()=>command('roleplay',{enabled:true}).then(runtime));action('stopRole',()=>command('roleplay',{enabled:false}).then(runtime));action('openComposer',()=>command('composer'));
  action('toggleRole',async()=>{await runtime();await command('roleplay',{enabled:!nativeState.pets?.[pet]?.roleplay});await runtime();});
  action('showDock',()=>command('dock',{visible:true}));action('hideDock',()=>command('dock',{visible:false}));action('resetDock',()=>command('dock-reset'));
  for(const id of ['closePanel','collapsePanel'])action(id,()=>bridge()?bridge().close():Promise.resolve());
  action('openResearch',async()=>{$('researchCard').click();});
  action('createActorConfirm',async()=>{$('saveActor').click();});
  const cancelCreate=()=>{void reload().catch(error);};
  $('createActorCancel').onclick=()=>{$('createActorDialog').close();cancelCreate();};$('createActorDialog').addEventListener('cancel',cancelCreate);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-open],[data-legacy],[data-field]');if(b?.dataset.open)open(b.dataset.open);else if(b?.dataset.legacy)showSection(b.dataset.legacy);else if(b?.dataset.field){for(const n of document.querySelectorAll('[data-field-box]'))n.hidden=n.dataset.fieldBox!==b.dataset.field;for(const n of document.querySelectorAll('[data-field]'))n.setAttribute('aria-current',String(n===b));}});
  document.querySelector('[data-field=description]').setAttribute('aria-current','true');
  document.addEventListener('companion:loaded',fill);document.addEventListener('companion:candidates',()=>{if(previewAsset===selectedActor()?.assetId)renderCast();});document.addEventListener('companion:book',renderBooks);document.addEventListener('companion:entry',renderEntries);
  $('actor').addEventListener('change',()=>{inspectedName='';fill();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('createActorDialog').open&&!clearDialog.open)void bridge()?.close();});
  bridge()?.onNavigate(({page})=>open(page));
  bridge()?.onSettings?.(value=>{prefs={...prefs,...value};applyPreferences();paintPreferences();});
  if(bridge())for(const edge of ['n','s','w','e','nw','ne','sw','se']){
    const handle=node('div','','resize-edge');handle.dataset.edge=edge;$('resizeEdges').append(handle);
    let dragging=false;
    handle.onpointerdown=e=>{if(e.button!==0)return;dragging=true;handle.setPointerCapture(e.pointerId);void command('resize-start',{edge,x:e.screenX,y:e.screenY});};
    handle.onpointermove=e=>{if(dragging)void command('resize-move',{x:e.screenX,y:e.screenY});};
    const end=()=>{if(dragging){dragging=false;void command('resize-end');}};handle.onpointerup=end;handle.onpointercancel=end;
  }
  applyPreferences();paintPreferences();open(initial.get('page')||'overview');if(typeof data!=='undefined')fill();
  if(bridge())void bridge().status().then(v=>{nativeState=v;if(v.settings){prefs={...prefs,...v.settings};applyPreferences();paintPreferences();}}).catch(()=>{});
  void document.fonts?.ready.then(()=>{bioPages.refresh();chatPages.refresh();});
  new ResizeObserver(()=>{if(document.body.dataset.transition!=='active'){bioPages.refresh();chatPages.refresh();}}).observe(main);
})();
