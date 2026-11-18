/* global document, $, api, actorId, selectedActor, data, reload, notice */
(() => {
  const tasks = { chat:'玩家问答', background:'背景回忆', smalltalk:'即兴闲聊', continue:'接着讲', game:'游戏问答' };
  const fields = { address:'自称与称呼', register:'用词与正式程度', rhythm:'句子节奏', emotion:'表达情绪', response:'回应习惯' };
  const section = document.createElement('section'); section.id = 'promptSettings'; section.hidden = true;
  section.innerHTML = `<div class="book-prompt-content"><div class="toolbar prompt-scope-row"><h2 class="book-prompt-title">提示词</h2><span class="prompt-scope"><span id="bookScopeName" aria-hidden="true"></span><select id="promptScope" aria-label="设置范围"><option value="character">当前人物</option><option value="room">当前聊天</option><option value="global">全局默认</option></select></span><span id="promptPerson" class="context-name"></span></div>
    <nav class="toolbar" id="promptTabs"><button data-tab="voice">表达方式</button><button data-tab="tasks">场景预设</button><button data-tab="blocks">附加提示</button><button data-tab="preview">查看与预览</button></nav>
    <div class="prompt-content" id="promptVoice"></div><div class="prompt-content" id="promptTasks" hidden></div>
    <div class="prompt-content" id="promptBlocks" hidden><div class="toolbar"><select id="promptBlockList" aria-label="附加提示"></select><button id="promptAddBlock">新增</button><button id="promptRemoveBlock">删除</button></div><div id="promptBlockEditor"></div></div>
    <div class="prompt-content" id="promptPreview" hidden><div class="toolbar"><select id="promptKind" aria-label="预览场景"></select><input id="promptQuestion" placeholder="试填一个问题"><button id="promptCompile">预览</button><button id="promptActual">最近请求</button><label class="check"><input id="promptDetails" type="checkbox">高级详情</label></div><textarea id="promptOutput" readonly aria-label="提示词预览"></textarea></div></div>
    <div class="actions"><button id="bookPromptPreview" type="button">预览</button><button id="promptSave" class="primary">保存</button><button id="promptDiff">查看改动</button><button id="promptReset">恢复本层默认</button><button id="promptVoiceActor">编辑人物</button></div>`;
  document.querySelector('main').append(section);
  let loaded, scope = 'character', owner, activeBlock, serial = 0, previewValue;
  function displayPreview(value) {
    previewValue=value;
    $('promptOutput').value=$('promptDetails').checked?JSON.stringify(value,null,2):value.blocks
      ? value.blocks.map(b=>b.content).join('\n\n')+(value.examples?'\n\n'+value.examples:'')
      : (value.requests||[]).map(r=>'—— 最近请求 ——\n'+(r.payload.system||'')+'\n'+(r.payload.messages||[]).map(m=>m.role+'：'+(typeof m.content==='string'?m.content:JSON.stringify(m.content))).join('\n')).join('\n')||'暂时没有本次启动后的请求。';
  }
  const drafts = new Map(), key = () => (selectedActor()?.characterId || actorId) + ':' + scope;
  const fail = e => notice(e.message || '设置未完成', true);
  const characterLabel = name => {
    $('promptPerson').textContent=name;
    const select=$('promptScope');
    select.options[0].textContent=document.documentElement.dataset.theme==='book'&&name?name:'当前人物';
    const label=select.selectedOptions[0]?.label||'';
    $('bookScopeName').textContent=label;
    select.title=document.documentElement.dataset.theme==='book'?label:'';
  };
  const scopeTheme=new MutationObserver(()=>characterLabel($('promptPerson').textContent||''));
  scopeTheme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  window.addEventListener('pagehide',()=>scopeTheme.disconnect(),{once:true});
  const make = (tag, value) => { const n = document.createElement(tag); n.textContent = value; return n; };
  function controls(parent, entries, values, defaults) {
    const expanded=parent.querySelector('button[aria-expanded=true]')?.getAttribute('aria-controls');
    parent.replaceChildren();
    for (const [id, name] of Object.entries(entries)) {
      const field=make('div',''),label=make('label',''), title=make('span',name), toggle=make('button',name);
      const input = document.createElement('textarea'); input.dataset.field = id;
      input.id=parent.id+'-'+id;
      field.className='prompt-field';title.className='prompt-field-label';toggle.className='prompt-field-toggle';
      toggle.type='button';
      toggle.setAttribute('aria-controls',input.id);
      toggle.setAttribute('aria-expanded',String(expanded?expanded===input.id:!parent.firstChild));
      toggle.onclick=()=>{
        const open=toggle.getAttribute('aria-expanded')!=='true';
        for(const button of parent.querySelectorAll('.prompt-field-toggle'))button.setAttribute('aria-expanded',String(button===toggle&&open));
      };
      input.maxLength = parent.id === 'promptVoice' ? 1000 : 3000; input.value = values?.[id] ?? '';
      input.placeholder = defaults?.[id] || '沿用人物资料与上层设置';
      input.setAttribute('aria-label',name);
      label.append(title,input);field.append(toggle,label);parent.append(field);
    }
  }
  function readBlocks() {
    if (!activeBlock) return;
    activeBlock.content = $('promptBlockText').value; activeBlock.enabled = $('promptBlockEnabled').checked;
    activeBlock.order = Number($('promptBlockOrder').value);
    activeBlock.appliesTo = [...$('promptBlockEditor').querySelectorAll('[data-kind]:checked')].map(n => n.dataset.kind);
  }
  function collect() {
    readBlocks();
    const read = id => Object.fromEntries([...$(id).querySelectorAll('textarea[data-field]')].filter(n => n.value.trim()).map(n => [n.dataset.field,n.value]));
    return { voice:read('promptVoice'), tasks:read('promptTasks'), blocks:structuredClone(loaded?.settings?.blocks || []) };
  }
  function drawBlock(id) {
    const blocks = loaded.settings.blocks ||= []; activeBlock = blocks.find(b => b.id === id);
    $('promptBlockList').replaceChildren(...blocks.map((b,i) => { const o=make('option','提示 '+(i+1));o.value=b.id;return o; }));
    if(activeBlock)$('promptBlockList').value=activeBlock.id;
    const editor=$('promptBlockEditor');editor.replaceChildren();if(!activeBlock)return;
    const toggle=make('label','启用'),enabled=document.createElement('input');enabled.type='checkbox';enabled.id='promptBlockEnabled';enabled.checked=activeBlock.enabled;toggle.prepend(enabled);
    const order=make('label','排列位置'),number=document.createElement('input');number.type='number';number.min=30;number.max=85;number.id='promptBlockOrder';number.value=activeBlock.order;order.append(number);
    const kinds=document.createElement('div');kinds.className='toolbar';
    for(const [k,v] of Object.entries(tasks)){const l=make('label',v),c=document.createElement('input');c.type='checkbox';c.dataset.kind=k;c.checked=activeBlock.appliesTo.includes(k);l.prepend(c);kinds.append(l);}
    const text=document.createElement('textarea');text.id='promptBlockText';text.maxLength=3000;text.value=activeBlock.content;text.setAttribute('aria-label','附加提示内容');editor.append(toggle,order,kinds,text);
  }
  async function load() {
    const target = actorId, n = ++serial; owner=null;section.dispatchEvent(new Event('companion:prompt-ready'));
    const response = await api('prompt-settings',{actorId:target,scope});
    if(n!==serial||actorId!==target)return;owner=target;loaded=response;
    if(drafts.has(key()))loaded.settings=drafts.get(key());
    characterLabel(selectedActor()?.resolvedSpeaker?.name||selectedActor()?.name||'');
    controls($('promptVoice'),fields,loaded.settings.voice,loaded.resolved.voice);
    controls($('promptTasks'),tasks,loaded.settings.tasks,{...loaded.defaults,...loaded.resolved.tasks});drawBlock(loaded.settings.blocks?.[0]?.id);
    $('promptOutput').value='';
    section.dispatchEvent(new Event('companion:prompt-ready'));
  }
  async function run(action) {
    if(!loaded||owner!==actorId)return;
    const target=actorId,settings=collect(),values={actorId:target,scope,expectedRevision:data.revision,expectedPromptRevision:loaded.resolved.revision,settings};
    if(action==='preview'){
      const response=await api('prompt-preview',{...values,kind:$('promptKind').value,question:$('promptQuestion').value});
      if(target===actorId)displayPreview(response);return;
    }
    if(action==='actual'){
      const response=await api('prompt-request',{actorId:target});
      if(target===actorId)displayPreview(response);return;
    }
    await api('prompt-save',{...values,...(action==='reset'?{reset:true}:{})});drafts.delete(key());await reload();await load();notice('已保存。');
  }
  for(const [k,v] of Object.entries(tasks)){const o=make('option',v);o.value=k;$('promptKind').append(o);}
  function promptTab(tab){
    for(const button of $('promptTabs').querySelectorAll('button'))button.setAttribute('aria-current',String(button.dataset.tab===tab));
    for(const [id,k] of [['promptVoice','voice'],['promptTasks','tasks'],['promptBlocks','blocks'],['promptPreview','preview']])$(id).hidden=tab!==k;
  }
  promptTab('voice');
  $('bookPromptPreview').onclick=()=>promptTab('preview');
  $('promptTabs').onclick=e=>{const button=e.target.closest('[data-tab]');if(button)promptTab(button.dataset.tab);};
  $('promptDetails').onchange=()=>{if(previewValue)displayPreview(previewValue);};
  $('promptScope').onchange=()=>{if(loaded&&owner===actorId)drafts.set(key(),collect());scope=$('promptScope').value;characterLabel($('promptPerson').textContent);void load().catch(fail);};
  $('promptBlockList').onchange=()=>{readBlocks();drawBlock($('promptBlockList').value);};
  $('promptAddBlock').onclick=()=>{if(!loaded)return;readBlocks();const blocks=loaded.settings.blocks||=[];if(blocks.length>=12)return notice('最多12项。',true);const b={id:'custom-'+Date.now(),content:'',enabled:true,order:60,appliesTo:Object.keys(tasks)};blocks.push(b);drawBlock(b.id);};
  $('promptRemoveBlock').onclick=()=>{if(!loaded)return;loaded.settings.blocks=(loaded.settings.blocks||[]).filter(b=>b!==activeBlock);drawBlock(loaded.settings.blocks[0]?.id);};
  for(const [id,action] of [['promptSave','save'],['promptReset','reset'],['promptCompile','preview'],['promptActual','actual']])$(id).onclick=async()=>{if($(id).disabled)return;$(id).disabled=true;try{await run(action);}catch(e){fail(e);}finally{$(id).disabled=false;}};
  $('promptDiff').onclick=()=>{if(!loaded)return;const output=$('promptOutput');output.value='当前层设置\n'+JSON.stringify(loaded.settings,null,2)+'\n修改后\n'+JSON.stringify(collect(),null,2);promptTab('preview');};
  $('promptVoiceActor').onclick=()=>{document.querySelector('[data-page="people"]')?.click();document.querySelector('[data-section="actorEditor"]')?.click();};
  const voiceLink=make('button','表达方式');voiceLink.type='button';voiceLink.onclick=()=>{document.querySelector('[data-page="settings"]')?.click();document.querySelector('[data-section="promptSettings"]')?.click();};document.querySelector('#actorEditor .actions')?.append(voiceLink);
  document.addEventListener('companion:prompts',()=>{void load().catch(fail);});
  document.addEventListener('companion:actor',()=>{serial++;owner=null;if(!section.hidden)void load().catch(fail);});
  document.addEventListener('companion:loaded',()=>{if(!section.hidden)void load().catch(fail);});
  void import('./library-prompt-transfer.js').then(({ installPromptTransfer }) => installPromptTransfer(section, {
    request: api, notice,
    current: () => loaded && owner === actorId ? { key: key(), actorId, scope, name: selectedActor()?.name || '', settings: collect() } : null,
    apply: async (target, settings) => {
      if (!loaded || owner !== actorId || target !== key()) return false;
      drafts.set(key(), settings); await load(); return true;
    },
  })).catch(fail);
})();
