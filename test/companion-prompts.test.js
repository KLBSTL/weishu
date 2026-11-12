import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { CompanionLibrary, companionLibrary } from '../server/companion/library.js';
import { memoryClaims } from '../server/companion/memory-claims.js';
import { buildPrompt, compilePromptBlocks, setPromptLayer, resolvePromptSettings, validatePromptSettings, rememberPromptRequest, lastPromptRequests, importPromptPreset, exportPromptPreset } from '../server/companion/prompts.js';
import { exampleDialogues, contextualExamples, SPOKEN_CONTRACT } from '../server/companion/speech.js';
import { renderReadOnlyTemplate } from '../server/companion/template.js';
import { compileKnowledge, StoryPlanner, utteranceKey } from '../server/companion/knowledge.js';
import { extractStorySeeds, IdleChat } from '../server/desktop/idle-chat.js';
import { IdleCache } from '../server/desktop/idle-cache.js';
import { StoryMemory, storyCatalog } from '../server/desktop/idle-stories.js';
import { expressionProblem } from '../server/companion/expression.js';
import { libraryRoute } from '../server/companion/routes.js';
import { conversationStream, withConversationScope } from '../server/desktop/conversation.js';
import { CHROME, hasChrome } from './e2e/client.mjs';

const card = { name:'小雨', description:'姓名：小雨\n\n# 往事\n小时候奶奶教我揉面包，第一次做出来的面包有点硬。', personality:'用词朴素，关心别人时不会说很多大道理。',
  mes_example:'<START>\n{{user}}: 今天有点累。\n{{char}}: 那就歇会儿吧。\n不急着做完所有事。\n<START>\n{{user}}: 那本书后来呢？\n{{char}}: 我把书放回架子了。' };
async function fixture(run) {
  const dir=await mkdtemp(join(tmpdir(),'prompt-rounds-')),lib=new CompanionLibrary(dir);
  try{await lib.importCard(card);await run(lib,dir);}finally{await lib.close();assert.ok(dir.startsWith(join(tmpdir(),'prompt-rounds-')));await rm(dir,{recursive:true,force:true});}
}
test('portable prompt presets validate version and bounded declarative fields without importing runtime data',()=>{
  const settings={voice:{register:'轻快自然'},tasks:{chat:'先回答问题'},blocks:[{id:'custom-example',content:'保持已播状态一致。',enabled:true,order:60,appliesTo:['chat']}]};
  const preset=exportPromptPreset(settings,'公开样例');
  assert.deepEqual(importPromptPreset({...preset,apiKey:'not-a-real-key',history:['private'],actorId:'foreign'}),{name:'公开样例',settings});
  assert.deepEqual(Object.keys(preset),['format','version','name','settings']);
  assert.throws(()=>importPromptPreset({...preset,version:2}));
  assert.throws(()=>importPromptPreset({...preset,settings:{voice:'not-an-object'}}));
  assert.throws(()=>importPromptPreset({...preset,settings:{blocks:[...settings.blocks,...settings.blocks]}}));
  assert.throws(()=>importPromptPreset({...preset,settings:{voice:{register:'x'.repeat(1001)}}}));
  assert.throws(()=>importPromptPreset({...preset,extra:'x'.repeat(65536)}));
});
test('embedded prompt defaults follow the active card and yield to saved character and room settings', () => {
  const preset = exportPromptPreset({
    voice: { register: '卡内口吻' },
    blocks: [{ id: 'custom-card', content: '卡内提示', enabled: true, order: 60, appliesTo: ['chat'] }],
  }, '卡内预设');
  const actor = { id: 'a', characterId: 'c', assetId: 'with-preset' };
  const data = { assets: [
    { id: 'with-preset', card: { extensions: { ark_companion: { prompt_preset: preset } } } },
    { id: 'invalid', card: { extensions: { ark_companion: { prompt_preset: { ...preset, version: 2 } } } } },
  ] };
  setPromptLayer(data, actor, 'global', { voice: { register: '全局口吻' } });
  assert.equal(resolvePromptSettings(data, actor).origins['voice.register'], 'card');
  assert.deepEqual(resolvePromptSettings(data, actor).blocks, preset.settings.blocks);
  for (const assetId of ['invalid', 'old-card']) {
    assert.equal(resolvePromptSettings(data, { ...actor, assetId }).voice.register, '全局口吻');
    assert.deepEqual(resolvePromptSettings(data, { ...actor, assetId }).blocks, []);
  }
  setPromptLayer(data, actor, 'character', { voice: { register: '个人口吻' }, blocks: [] });
  assert.equal(resolvePromptSettings(data, actor).voice.register, '个人口吻');
  assert.deepEqual(resolvePromptSettings(data, actor).blocks, []);
  setPromptLayer(data, actor, 'room', { voice: { register: '本聊天口吻' } }, 'room:example');
  assert.equal(resolvePromptSettings(data, actor, 'room:example').voice.register, '本聊天口吻');
  setPromptLayer(data, actor, 'character', null);
  assert.equal(resolvePromptSettings(data, actor).voice.register, '卡内口吻');
  assert.deepEqual(resolvePromptSettings(data, actor).blocks, preset.settings.blocks);
});
test('examples retain question/answer groups and multiline speech; scene selection does not become real history',()=>{
  const groups=exampleDialogues(card.mes_example,'小雨');assert.equal(groups.length,2);assert.equal(groups[0].turns[0].role,'user');
  assert.match(groups[0].turns[1].content,/不急着/);assert.match(contextualExamples(card.mes_example,'小雨','那本书后来呢？'),/示例玩家：那本书/);
  assert.ok(contextualExamples(card.mes_example,'小雨','书后来','background').indexOf('放回架子')>=0);
});
test('one compiler deduplicates contracts, applies scoped voice/templates, and leaves immutable sources untouched',()=>{
  const data={promptSettings:{}},actor={id:'a',characterId:'c'},other={id:'b',characterId:'d'};
  setPromptLayer(data,actor,'global',{voice:{register:'朴素'},tasks:{chat:'只回答当前问题'}});
  setPromptLayer(data,actor,'character',{voice:{rhythm:'短句'}});
  setPromptLayer(data,actor,'room',{voice:{rhythm:'短句中带一点犹豫'}},'direct:a');
  const settings=resolvePromptSettings(data,actor),built=buildPrompt({card,promptSettings:settings},{question:'你好'});
  assert.equal(built.system.split(SPOKEN_CONTRACT).length-1,1);assert.match(built.system,/短句中带一点犹豫/);assert.ok(!resolvePromptSettings(data,other).voice.rhythm);
  assert.ok(!resolvePromptSettings(data,actor,'room:other').voice.rhythm.includes('犹豫'));
  assert.equal(compilePromptBlocks([{id:'x',order:1,content:'old'},{id:'x',order:1,content:'new'}],'chat').system,'new');
  assert.throws(()=>validatePromptSettings({blocks:[{id:'contract.speech',content:'override'}]}));
  assert.equal(renderReadOnlyTemplate('{{#if state.ready}}你好{{char}}{{else}}等等{{/if}}',{char:'小雨',state:{ready:true}}),'你好小雨');
  assert.equal(renderReadOnlyTemplate('{{state.constructor}}',{}),'（未设置）');
  assert.equal(renderReadOnlyTemplate('<% dangerous() %>',{}),'<% dangerous() %>');
});
test('natural test questions create independent facts, preserve negation scope, survive long history/restart and individual forgetting',async()=>fixture(async(lib,dir)=>{
  assert.equal(memoryClaims('你还记得我叫什么，喜欢什么颜色的围巾吗？').length,0);
  const claims=memoryClaims('我叫阿澄，我喜欢蓝色围巾。你能记住这两件事吗？');assert.equal(claims.length,2);assert.ok(claims.every(c=>!c.ambiguous));
  assert.equal(memoryClaims('她喜欢红色围巾。').length,0);
  await lib.event('main','direct:main',{id:'two-facts',type:'user',text:'我叫阿澄，我喜欢蓝色围巾。你能记住这两件事吗？'});
  await lib.event('main','direct:main',{type:'user',text:'我现在改成喜欢红色围巾，不再喜欢蓝色围巾。'});
  await lib.event('main','direct:main',{type:'user',text:'你还记得我叫什么，喜欢什么颜色的围巾吗？'});
  for(let i=0;i<25;i++)await lib.event('main','direct:main',{type:'user',text:'普通闲聊第'+i+'句。'});
  const again=new CompanionLibrary(dir);try{await again.ready();const rows=await again.recall('main','你还记得我叫什么，喜欢什么颜色的围巾吗？');
    assert.ok(rows.some(r=>r.claim?.slot==='name:player'&&r.claim.value==='阿澄'));
    assert.ok(rows.some(r=>r.claim?.slot==='color:围巾'&&r.claim.value==='红色'&&r.claim.polarity==='positive'));
    assert.ok(!rows.some(r=>r.claim?.value.includes('什么')));
    const name=rows.find(r=>r.claim?.slot==='name:player');await again.editMemory('main',name.id,{});
    assert.ok((await again.recall('main','围巾')).some(r=>r.claim?.value==='红色'));
  }finally{await again.close();}
}));
test('schema4 reindex repairs legacy whole-message rows without changing raw messages or forgotten/manual sources',async()=>fixture(async(lib,dir)=>{
  await lib.event('main','direct:main',{id:'legacy',type:'user',text:'我叫阿澄，我喜欢蓝色围巾。你能记住这两件事吗？'});
  await lib.close();let db=new DatabaseSync(join(dir,'companion.sqlite'));const event=JSON.parse(db.prepare("SELECT value FROM events WHERE id='legacy'").get().value);
  db.exec("DELETE FROM memory_fts;DELETE FROM memories;PRAGMA user_version=4");
  db.prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?,?,?,?)').run('legacy:user_statement',event.characterId,'main','direct:main','legacy','user_statement','pending',event.text,event.at,JSON.stringify({sourceId:'legacy',claim:{slot:'color:围巾',value:'蓝色',ambiguous:true},preferenceSlot:'color:围巾',preferenceValue:'蓝色'}));db.close();
  const again=new CompanionLibrary(dir);try{await again.ready();const rows=await again.recall('main','记得我的名字吗');assert.ok(rows.some(r=>r.claim?.value==='阿澄'));assert.ok(rows.some(r=>r.claim?.value==='蓝色'));
    db=new DatabaseSync(join(dir,'companion.sqlite'));assert.equal(JSON.parse(db.prepare("SELECT value FROM events WHERE id='legacy'").get().value).text,event.text);assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);db.close();
  }finally{await again.close();}
}));
test('local heard ledger survives question epochs, restart, and the short visible-history window; failed displays do not consume',async()=>fixture(async(lib,dir)=>{
  const actor=lib.actor(),cache=new IdleCache(join(dir,'cache.json')),input={storyCard:card,companionPetId:'main',cacheActor:actor.characterId,cacheEpoch:'one',clearEpoch:'first'};
  const local=cache.warm(input)[0];assert.ok(local);assert.ok(cache.warm(input).some(r=>r.id===local.id),'no ACK leaves text available');
  await lib.event('main','direct:main',{id:local.id,type:'assistant',text:local.text,sourceKind:'idle-local',deliveryState:'displayed'});cache.consume(input,local.id,local.text);
  const ledger=await lib.store.call('story-ledger',{characterId:actor.characterId});assert.ok(ledger.heard['direct:main'][utteranceKey(local.text).slice(0,24)]);
  const restarted=new IdleCache(join(dir,'cache.json'));assert.ok(restarted.warm({...input,cacheEpoch:'new-question',history:[]}).every(r=>r.text!==local.text));
  const dbOnly=new IdleCache(join(dir,'other-cache.json'));assert.ok(dbOnly.warm({...input,heardTextHashes:Object.keys(ledger.heard['direct:main'])}).every(r=>r.text!==local.text));
}));
test('confirming an uncertain withdrawal cannot remove a different current value in the same slot',async()=>fixture(async lib=>{
  await lib.event('main','direct:main',{type:'user',text:'我喜欢蓝色围巾。'});
  await lib.event('main','direct:main',{type:'user',text:'我现在改成喜欢红色围巾。'});
  await lib.event('main','direct:main',{type:'user',text:'我也许不再喜欢蓝色围巾。'});
  const pending=await lib.store.call('memory-pending',{characterId:lib.actor().characterId});assert.equal(pending.length,1);
  await lib.store.call('memory-decide',{characterId:lib.actor().characterId,id:pending[0].id,accept:true});
  assert.ok((await lib.recall('main','围巾')).some(r=>r.claim?.operation==='assert'&&r.claim.value==='红色'&&r.claim.polarity==='positive'));
}));
test('material classification removes profile attributes, shares point coverage and tolerates necessary names in a continuing story',()=>{
  const c={name:'小雨',description:'性别：女\n\n发色：蓝色\n\n# 往事\n小时候奶奶教我揉面包。'};
  const seeds=extractStorySeeds(c);assert.ok(!seeds.some(t=>t.includes('性别：')||t.includes('发色：')));
  const catalog=new StoryPlanner().catalog(c,storyCatalog(seeds),compileKnowledge(c));assert.ok(catalog[0].factPoints.length);
  const stories=new StoryMemory(),entry=stories.entry('fixture',catalog);entry.coverage=Object.fromEntries(catalog.flatMap(r=>r.factPoints.map(p=>[p.id,true])));
  assert.equal(stories.select(entry,catalog,true),null);
  assert.equal(expressionProblem('我把那本书放回书架了。',[{topic:'same',text:'我把那本书放回书架了。'}],{topic:'same',anchors:['书架']}),null);
  assert.equal(expressionProblem('这会儿正好能歇一歇，我还想说点别的。',[{text:'这会儿正好能歇一歇，先喝口水。'},{text:'这会儿正好能歇一歇，聊聊天吧。'}]),'opening');
});
test('idle batch uses the same compiler and does not repeat contracts or a stack of previous utterances',async()=>{
  let system='';const idle=new IdleChat({stamp:()=> 'stable',options:()=>({proactive:true,idleSeconds:30}),random:()=>0,read:()=>[],save:()=>{},stories:new StoryMemory()});
  await idle.run(async()=>({storyCard:card,storyBatch:true,history:[],profile:{card,promptSettings:{voice:{register:'朴素'}}}}),async input=>{
    system=input.system;return{ok:true,text:JSON.stringify({segments:[{text:'小时候奶奶教我揉面包，第一次做出来的面包很硬，我就想着下次少放一点面粉，先试试能不能让它软一些，哪怕进步一点也好。'}]})};
  },undefined,{manual:true});
  assert.equal(system.split(SPOKEN_CONTRACT).length-1,1);assert.equal(system.split('【互动经历规则】').length-1,1);assert.ok(!system.includes('其他话题仅作去重'));
});
test('request viewer is bounded, omits credentials/reasoning and never writes settings or user history',()=>{
  rememberPromptRequest('test',{key:'secret',messages:[{role:'assistant',reasoning_content:'hidden',content:'公开台词'}],stream:true});
  const rows=lastPromptRequests('test');assert.equal(rows[0].payload.key,undefined);assert.equal(rows[0].payload.messages[0].reasoning_content,undefined);
  rows[0].payload.messages[0].content='changed';assert.equal(lastPromptRequests('test')[0].payload.messages[0].content,'公开台词');
});
test('request viewer captures the provider-adapted messages and actual effort sent to the transport',async()=>{
  let wire;
  const fetcher=async(_url,options)=>{wire=JSON.parse(options.body);return new Response('data: '+JSON.stringify({choices:[{delta:{content:'你好。'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});};
  await withConversationScope(async()=>{for await(const _part of conversationStream({protocol:'openai-compatible',baseUrl:'https://public-fixture.invalid/v1',apiKey:'fixture-only',model:'fixture'},
    {question:'你好',system:buildPrompt({card},{question:'你好'}).system,messages:[{role:'user',content:'你好'}]},AbortSignal.timeout(5000),fetcher)){ /* Consume the public fixture stream. */ }return{ok:true};},
  {petId:'wire-pet',plan:{characterId:'wire-character'},chatOptions:{mode:'daily',effort:'low',maxChars:60}});
  const saved=lastPromptRequests('wire-character').at(-1).payload;assert.deepEqual(saved.messages,wire.messages);assert.equal(saved.thinking.type,'disabled');assert.ok(!JSON.stringify(saved).includes('fixture-only'));
});

test('real settings/preview endpoints and headless editor save, compare, preview and restore without model requests',
  {skip:process.env.SP_E2E!=='1'||!hasChrome(),timeout:45000},async()=>{
    const original=process.env.DSH_HOME,home=await mkdtemp(join(tmpdir(),'prompt-panel-'));process.env.DSH_HOME=home;
    const lib=companionLibrary(join(home,'dsh-pet'));let browser,server;
    try{await lib.importCard(card);const post=async action=>libraryRoute({},'stronghold/library','POST',JSON.stringify({pet:'main',...action}),undefined,{});
      await lib.event('main','direct:main',{type:'user',text:'我叫阿澄。'});const before=lib.snapshot(),db=new DatabaseSync(join(home,'dsh-pet','companion.sqlite'),{readOnly:true});
      const count=()=>db.prepare('SELECT count(*) AS n FROM generation_plans').get().n;const n=count();
      const preview=await post({action:'prompt-preview',settings:{},question:'你好',kind:'chat'});assert.equal(preview.status,200);assert.equal(count(),n);assert.deepEqual(lib.snapshot(),before);db.close();
      const settings=await post({action:'prompt-settings'});assert.equal(settings.status,200);
      server=createServer(async(req,res)=>{try{let raw='';for await(const b of req)raw+=b;const rest=new URL(req.url,'http://localhost').pathname.replace(/^\/dsh-pet-7340\//u,'');
        const r=await libraryRoute({},rest,req.method,raw,undefined,{});res.statusCode=r.status||200;res.setHeader('Content-Type',r.contentType||'application/json');res.end(r.kind==='file'?readFileSync(r.file):JSON.stringify(r.obj));
      }catch{res.statusCode=500;res.end('{}');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const puppeteer=(await import('puppeteer-core')).default;browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--no-proxy-server']});
      const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1200,height:800});
      await page.goto('http://127.0.0.1:'+server.address().port+'/dsh-pet-7340/stronghold/library-ui#token=public-test');await page.waitForFunction(()=>document.body.dataset.ready==='true');
      await page.click('[data-page="settings"]');await page.click('[data-section="promptSettings"]');await page.waitForFunction(()=>document.querySelector('#promptVoice textarea'));
      await page.type('#promptVoice [data-field="register"]','简洁朴素');await page.click('#promptSave');await page.waitForFunction(()=>document.getElementById('notice').textContent==='已保存。');
      assert.equal(resolvePromptSettings(lib.snapshot(),lib.actor()).voice.register,'简洁朴素');
      const presetFile=join(home,'public.prompt.json');await writeFile(presetFile,JSON.stringify(exportPromptPreset({voice:{register:'轻快但不过分热闹'},tasks:{chat:'先回答当前问题'},blocks:[]},'公开预设')));
      await page.waitForSelector('#promptPresetFile');await (await page.$('#promptPresetFile')).uploadFile(presetFile);
      await page.waitForFunction(()=>document.querySelector('#promptVoice [data-field="register"]').value==='轻快但不过分热闹');
      assert.equal(resolvePromptSettings(lib.snapshot(),lib.actor()).voice.register,'简洁朴素','import must not persist or invalidate current prompts');
      const exportResponse=page.waitForResponse(r=>r.request().postData()?.includes('prompt-export'));
      await page.click('#promptExport');const exported=await (await exportResponse).json();
      assert.equal(exported.preset.settings.voice.register,'轻快但不过分热闹');assert.ok(!JSON.stringify(exported).includes('public-test'));
      await writeFile(presetFile,'{"format":"not-our-preset","version":1}');await (await page.$('#promptPresetFile')).uploadFile(presetFile);
      await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('请选择有效'));
      assert.equal(await page.$eval('#promptVoice [data-field="register"]',n=>n.value),'轻快但不过分热闹','invalid import preserves the current draft');
      await page.click('#promptSave');await page.waitForFunction(()=>document.getElementById('notice').textContent==='已保存。');
      assert.equal(resolvePromptSettings(lib.snapshot(),lib.actor()).voice.register,'轻快但不过分热闹');
      await page.evaluate(()=>{const fetcher=window.fetch;window.fetch=async(...args)=>{if(String(args[1]?.body).includes('prompt-settings'))await new Promise(resolve=>setTimeout(resolve,300));return fetcher(...args)};});
      await page.select('#promptScope','global');
      assert.equal(await page.$eval('#promptImport',n=>n.disabled),true,'import waits for the selected scope');
      assert.equal(await page.$eval('#promptExport',n=>n.disabled),true,'export cannot use the previous scope during loading');
      await page.select('#promptScope','room');
      await page.waitForFunction(()=>!document.getElementById('promptImport').disabled);
      assert.equal(await page.$eval('#promptVoice [data-field="register"]',n=>n.value),'','rapid switching does not copy character settings into a different layer');
      await page.select('#promptScope','character');await page.waitForFunction(()=>!document.getElementById('promptImport').disabled);
      assert.equal(await page.$eval('#promptVoice [data-field="register"]',n=>n.value),'轻快但不过分热闹');
      await page.screenshot({path:join(process.env.TEMP||tmpdir(),'prompt-voice.png')});
      await page.click('#promptDiff');assert.ok(await page.$eval('#promptOutput',n=>n.value.includes('轻快但不过分热闹')));
      await page.type('#promptQuestion','你好');await page.click('#promptCompile');await page.waitForFunction(()=>document.getElementById('promptOutput').value.includes('直接台词'));
      await page.click('#promptDetails');assert.ok(await page.$eval('#promptOutput',n=>n.value.includes('contract.speech')));
      await page.screenshot({path:join(process.env.TEMP||tmpdir(),'prompt-editor.png')});
      await page.click('#promptReset');await page.waitForFunction(()=>document.querySelector('#promptVoice [data-field="register"]').value==='');
      assert.ok((await lib.recall('main','名字')).some(r=>r.claim?.value==='阿澄'));assert.deepEqual(errors,[]);
    }finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await lib.close();if(original===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=original;await rm(home,{recursive:true,force:true});}
  });
