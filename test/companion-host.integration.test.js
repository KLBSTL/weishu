import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { CompanionLibrary } from '../server/companion/library.js';
import { parsePersona } from '../server/desktop/persona.js';

const entry = fileURLToPath(new URL('../desktop-pet/node_modules/dsh-pet/lib/standalone.js', import.meta.url));
const chrome = process.env.CHROME_PATH;
async function until(fn, message) { for (let end = Date.now() + 15000; Date.now() < end; await delay(30)) { const value = await fn(); if (value) return value; } throw new Error(message); }

test('headless host manages materials, isolates two actors and commits bounded dialogue only after display', { timeout: 90000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-host-')), dataDir = join(dir, 'dsh-pet');
  let child, browser, origin, token, output = '';
  const requests = [];
  const model = http.createServer(async (req, res) => {
    let raw = ''; for await (const b of req) raw += b;
    const body = JSON.parse(raw); requests.push(body);
    const name = body.messages[0].content.includes('固定说话人物：小夏') ? '小夏' : '小雨';
    let content = `我是${name}，刚才想起书店门前的那场雨。`;
    if(body.messages.at(-1)?.content?.includes('正式面板公开测试，你好。')) content='晚上好！我刚送完最后一单。要不要一起吃块苹果派？';
    if (body.messages[0].content.includes('只整理下列虚构人物资料')) {
      const facts = JSON.parse(body.messages.at(-1).content);
      content = JSON.stringify(facts.map(f => ({ factId: f.factId, quote: f.text.slice(0, 30), group: f.factId })));
    }
    if (body.messages[0].content.includes('【连贯碎碎念批次】')) {
      const prompt = body.messages[0].content, source = prompt.includes('【唯一背景证据】') ? JSON.parse(prompt.split('【唯一背景证据】')[1].split('\n')[0]) : { id: 'creative', text: '' };
      // This fixture deliberately supplies a short but complete source, rather
      // than padding it to the requested eight parts with repeated test speech.
      const targets = Array.from({ length: 3 }, () => ({ maxChars: 100 }));
      content = JSON.stringify({ segments: targets.map((target, i) => ({ text: target.maxChars < 50 ? ['我一直保管着那封信，想到它时心里还有一点牵挂。', '这件事我一直放在心里，有时想起来也会静下来。', '现在说起这段小事，倒是比以前觉得轻松一些了。'][i]
        : ['我一直保管着那封信，想到它时心里还有一点牵挂。现在回想，这种牵挂未必需要立刻有个答案，把它放在心里，也是一种好好记住的方式。', '这件事我一直放在心里，有时想起来也会静下来。以前总觉得什么事情都该马上想明白，现在倒愿意留一点余地，让自己慢慢找到合适的说法。', '现在说起这段小事，倒是比以前觉得轻松一些了。它对我来说依然有意义，只是不用再把每一个念头都藏起来，能够这样自然地讲讲，也挺好的。'][i] })) });
      if (!source.text.includes('信')) content = JSON.stringify({ segments: targets.map((target, i) => ({ text: target.maxChars < 50
        ? ['我挺喜欢雨天的街角，不用赶路时，就想慢慢待一会儿。', '想象着那种下雨的街角，我就觉得整个人也能放松一点。', '所以现在只想把脚步放慢，不急着走过那个雨天的街角。'][i]
        : ['我挺喜欢雨天的街角，不用赶路时，就想慢慢待一会儿。其实也不用做什么特别的事，只要能把脚步放慢，留一点时间给自己，我就觉得挺舒服的。', '想象着那种下雨的街角，我就觉得整个人也能放松一点。平时太容易着急，连歇一会儿都像有事没做完；换个节奏想想，好像就没那么紧绷了。', '所以现在只想把脚步放慢，不急着走过那个雨天的街角。我也说不上有什么大道理，就是觉得偶尔这样停下来，看看自己的心情，也算没有白过一天。'][i] })) });
      assert.ok(source.id);
      const generated = JSON.parse(content); content = JSON.stringify({ text: generated.segments.map(p => p.text).join('') });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: ' + JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  const request = (path, body, method = body ? 'POST' : 'GET', auth = true) => fetch(origin + path, { method,
    headers: { ...(auth && { 'X-DSH-Pet-Token': token }), ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const call = async (path, body, method) => { const res = await request(path, body, method); const result = await res.json(); assert.equal(res.status, 200, JSON.stringify(result)); return result; };
  const api = (action, args = {}) => call('/dsh-pet-7340/stronghold/library', { action, ...args });
  try {
    await mkdir(dataDir);
    await writeFile(join(dataDir, 'main-config.jsonc'), JSON.stringify({ pets: ['main', 'partner-2'].map(id => ({ id, name: id, display: 'none', whisperEnabled: false, balanceEnabled: false })), chatImageEnabled: false }));
    model.listen(0, '127.0.0.1'); await once(model, 'listening');
    child = spawn(process.execPath, ['--import', new URL('../server/desktop/companion-adapter.js', import.meta.url).href, entry, '--port', '31970'], {
      env: { ...process.env, DSH_HOME: dir, SP_DSH_PET_RUNTIME_FILE: join(dataDir, 'standalone-runtime.json') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-4000).replace(/token=[A-Za-z0-9_-]+/gu, 'token=REDACTED'); });
    const runtime = await until(async () => { assert.equal(child.exitCode, null, output); return JSON.parse(await readFile(join(dataDir, 'standalone-runtime.json'), 'utf8').catch(() => 'null')); }, 'host failed to start');
    origin = 'http://127.0.0.1:' + runtime.port; token = runtime.token;
    await call('/standalone-ai/settings', { baseUrl: `http://127.0.0.1:${model.address().port}/v1`, protocol: 'openai-compatible', model: 'public-fixture', apiKey: 'public-fixture' });
    await call('/dsh-pet-7340/stronghold/chat-options', { effort: 'low', proactive: false });
    assert.ok([401, 403].includes((await request('/dsh-pet-7340/stronghold/library', { action: 'snapshot' }, 'POST', false)).status));
    assert.equal((await request('/dsh-pet-7340/stronghold/library', undefined, 'GET', false)).status, 405);
    const card = { name: '小雨', description: '# 书店\n小雨在旧城经营一家书店。\n\n# 书店\n小雨在旧城经营一家书店。', scenario: '雨天的街角。', extensions: { preserved: true }, character_book: { entries: [
      { id: 'secret', content: '小雨私下保管着一封蓝色的信。', constant: true, extensions: { ark_companion: { speakers: ['小雨'] } } },
      { id: 'code', comment: '[initvar]', content: '{"actor":{"mood":50}}', constant: true },
    ] } };
    await api('import-card', { file: Buffer.from(JSON.stringify(card)).toString('base64') });
    let s = await api('snapshot');
    assert.equal(s.petIds.length, 2); assert.equal(s.assets[0].card.extensions.preserved, true);
    const a = (await api('save-actor', { expectedRevision: s.revision, actorId: 'main', actor: { name: '小雨', assetId: s.assets[0].id, overrides: { name: '小雨', personality: '温柔简短。' } } })).result;
    s = await api('snapshot');
    const b = (await api('save-actor', { expectedRevision: s.revision, actor: { name: '小夏', assetId: s.assets[0].id, overrides: { name: '小夏', description: '小夏喜欢修理收音机。', personality: '爽快直率。' } } })).result;
    s = await api('snapshot'); await api('bind', { expectedRevision: s.revision, pet: 'partner-2', actorId: b.id });
    s = await api('snapshot'); assert.equal(s.actors[0].overrides.scenario, undefined);
    const badSave = await request('/dsh-pet-7340/stronghold/library', { action: 'save-persona', expectedRevision: 0, persona: { name: '错误覆盖' } }); assert.equal(badSave.status, 409);
    const inspect = await api('inspect', { actorId: b.id }); assert.ok(!inspect.units.some(u => u.text.includes('蓝色的信')));
    const researched = await api('research-card', { pet: 'main', actorId: a.id }); assert.ok(researched.count > 0);
    const researchCalls = requests.length;
    assert.equal((await api('research-card', { pet: 'main', actorId: a.id })).cached, true);
    assert.equal(requests.length, researchCalls, 'unchanged card research is cached instead of calling the model again');
    s = await api('snapshot');
    const book = (await api('save-book', { expectedRevision: s.revision, name: '旧城', book: { entries: { '4': { content: '旧城每逢周末举行集市。', key: ['集市'], disable: false, extensions: { custom: 9 } } } } })).result;
    assert.equal(book.book.entries[0].extensions.custom, 9);
    s = await api('snapshot'); await api('state-schema', { expectedRevision: s.revision, actorId: a.id, schema: { actor: { mood: { type: 'number', min: 0, max: 100 } } } });
    s = await api('snapshot'); const key = a.id + ':direct:' + a.id + ':' + s.actors.find(x => x.id === a.id).assetId;
    await api('state-patch', { expectedRevision: s.revision, actorId: a.id, stateRevision: s.states[key].revision, patch: [{ op: 'add', path: '/actor/mood', value: 50 }] });
    const preview = await api('preview', { actorId: a.id, html: '<style>p{color:blue}</style><p>{{char}}：{{state.actor.mood}}</p><script>parent.bad=true</script>' });
    assert.match(preview.html, /小雨：50/); assert.doesNotMatch(preview.html, /parent.bad/);
    s = await api('snapshot'); const room = (await api('save-room', { expectedRevision: s.revision, members: [a.id, b.id], name: '小客厅' })).result;
    await api('start-group', { roomId: room.id, topic: '聊聊雨天喜欢做的事。', limit: 2 });
    const first = await until(async () => (await api('delivery', { pet: 'main' })).delivery, 'first bubble');
    assert.equal((await api('snapshot')).events.filter(e => e.type === 'assistant').length, 0);
    assert.equal((await api('ack', { pet: 'partner-2', deliveryId: first.id })).ok, false);
    await api('ack', { pet: 'main', deliveryId: first.id });
    const second = await until(async () => (await api('delivery', { pet: 'partner-2' })).delivery, 'second bubble');
    assert.match(second.text, /小夏/);
    assert.ok(!requests.at(-1).messages[0].content.includes('蓝色的信'));
    await api('ack', { pet: 'partner-2', deliveryId: second.id });
    await until(async () => !(await api('snapshot')).group.running, 'bounded chain stopped');
    s = await api('snapshot'); assert.equal(s.events.filter(e => e.type === 'assistant').length, 2);
    assert.equal((await api('ack', { pet: 'partner-2', deliveryId: second.id })).ok, false);
    if (chrome && existsSync(chrome)) {
      const animation = await fetch(origin + '/dsh-pet-7340/stronghold/library-playing.webm');
      assert.equal(animation.status, 200); assert.equal(animation.headers.get('content-type'), 'video/webm');
      assert.deepEqual([...new Uint8Array(await animation.arrayBuffer()).slice(0, 4)], [26, 69, 223, 163], 'standalone host serves the actual WebM without a game server');
      const puppeteer = (await import('puppeteer-core')).default;
      browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const link = await api('open'); await page.goto(link.url);
      await page.waitForFunction(() => document.body.dataset.ready === 'true');
      await page.click('[data-page="world"]'); await page.click('[data-section="worldLibrary"]'); await page.click('[data-book="'+book.id+'"]'); await page.click('#editBook');
      assert.equal(await page.$eval('#entryContent', n => n.value), '旧城每逢周末举行集市。');
      await page.click('[data-page="settings"]'); await page.click('[data-section="advancedPage"]'); await page.click('[data-legacy="preview"]'); await page.$eval('#html', n => { n.value = '<p>静态预览</p><script>parent.__escaped=true</script>'; });
      await page.click('#previewHtml'); await until(async () => (await page.$eval('#frame', n => n.srcdoc)).includes('静态预览'), 'preview frame');
      assert.equal(await page.evaluate(() => window.__escaped), undefined); assert.deepEqual(errors, []);
      await page.click('[data-page="world"]'); await page.click('[data-section="worldLibrary"]'); await page.click('[data-book="embedded:main"]'); await page.click('#editBook');
      await page.$eval('#entryContent', n => { n.value += '\n这封信只属于小雨。'; });
      await page.type('#entryBroadcast','书店今天开门了。');
      await page.click('#saveBook'); await page.waitForSelector('#revisionDialog[open]'); await page.click('#revision-save');
      await page.waitForFunction(() => document.getElementById('notice').textContent.includes('世界书已保存'));
      await page.select('#entrySettingsPage', 'trigger'); await page.$eval('#ruleDepth', n => { n.value = '17'; n.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.select('#entrySettingsPage', 'matching'); await page.$eval('#ruleTags', n => { n.value = '童年,私人'; n.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.$eval('#notice', n => { n.textContent = ''; });
      await page.click('#saveBook'); await page.waitForSelector('#revisionDialog[open]'); await page.click('#revision-save');
      await page.waitForFunction(() => document.getElementById('notice').textContent.includes('世界书已保存'));
      const rules = (await api('snapshot')).actors.find(row => row.id === a.id).embeddedBook.entries[0].extensions;
      assert.equal(rules.scanDepth, 17); assert.deepEqual(rules.ark_companion.tags, ['童年', '私人']);
      assert.equal(rules.ark_companion.broadcastExcerpt,'书店今天开门了。');
      const originalText = await page.$eval('#entryContent', n => n.value);
      await page.$eval('#entryContent', n => { n.value += '\n这是还未保存的草稿。'; n.dispatchEvent(new Event('input', { bubbles: true })); });
      const draftSaved = page.waitForResponse(r => r.url().endsWith('/stronghold/library') && r.request().postData()?.includes('editor-draft'));
      await page.click('#keepBookDraft'); await draftSaved;
      await page.$eval('#entryContent', (n, value) => { n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); }, originalText);
      await page.click('#restoreBookDraft'); await page.waitForFunction(() => document.getElementById('entryContent').value.includes('未保存的草稿'));
      await page.$eval('#entryContent', (n, value) => { n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); }, originalText);
      await page.click('[data-section="worldInspect"]');
      const beforePreview = await api('snapshot'), beforeCalls = requests.length;
      await page.click('#previewLore'); await page.waitForFunction(() => document.getElementById('inspection').textContent.includes('尚未支持'));
      assert.equal((await api('snapshot')).revision, beforePreview.revision); assert.equal(requests.length, beforeCalls, 'preview stays local');
      await page.select('#loreProfile', 'legacy'); await page.click('#applyLoreProfile'); await page.waitForSelector('#revisionDialog[open]'); await page.click('#revision-apply');
      await page.waitForFunction(() => document.getElementById('notice').textContent.includes('世界书规则已更新'));
      assert.equal((await api('snapshot')).actors.find(row => row.id === a.id).ruleProfile, 'legacy');
      await page.$eval('#notice', n => { n.textContent = ''; });
      await page.select('#loreProfile', 'enhanced'); await page.click('#applyLoreProfile'); await page.waitForSelector('#revisionDialog[open]'); await page.click('#revision-apply');
      await page.waitForFunction(() => document.getElementById('loreProfile').value === 'enhanced' && document.getElementById('notice').textContent.includes('世界书规则已更新'));
      s = await api('snapshot'); assert.match(s.actors[0].embeddedBook.entries[0].content, /只属于小雨/);
      assert.equal(s.assets[0].card.character_book.entries[0].content, card.character_book.entries[0].content, 'embedded edits leave imported source untouched');
      if (process.env.SP_UI_CAPTURE) await page.screenshot({ path: process.env.SP_UI_CAPTURE, fullPage: true });
      await page.click('[data-page="people"]'); await page.click('[data-section="actors"]');
      const pngResponse = page.waitForResponse(r => r.url().endsWith('/stronghold/library') && r.request().postData()?.includes('"format":"png"'));
      await page.click('#exportPng'); const png = await (await pngResponse).json(); assert.ok(png.file);
      assert.equal(parsePersona(Buffer.from(png.file, 'base64')).extensions.ark_companion.ruleProfile, 'enhanced');
      const helper = new URL('../desktop-pet/node_modules/dsh-pet/runtime/electron-helper/', import.meta.url);
      await page.addScriptTag({ content: await readFile(new URL('shared-core.js', helper), 'utf8') });
      await page.addScriptTag({ content: `const BASE=${JSON.stringify(origin + '/dsh-pet-7340')};const strongholdPetConfig=${JSON.stringify({ origin: origin + '/no-game', token: 'T'.repeat(43) })};const S=window.PetShared;
        class PetSprite {pet={id:'main'};dragState={};switchTo(){}playOnce(){}onMenuAction(){}onContextMenu(){}inputBusy(){return false;}showWhisper(text){if(window.skipReplyRender)return;this.whisperText=text;this.whisperView={};window.shownReply=text;}}
        const sprites=[new PetSprite()];window.nativeTestSprite=sprites[0];` });
      await page.addScriptTag({ content: await readFile(new URL('../server/desktop/native.js', import.meta.url), 'utf8') });
      const spoken = await page.evaluate(async base => (await fetch(base + '/chat?pet=main&surface=any', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '你现在是谁？' }) })).json(), origin + '/dsh-pet-7340');
      assert.ok(spoken.deliveryId); const reader = new CompanionLibrary(dataDir);
      assert.ok(!reader.visibleHistory('main').some(e => e.id === spoken.deliveryId), 'a generated reply is not heard yet');
      assert.equal((await api('ack-chat', { pet: 'partner-2', deliveryId: spoken.deliveryId })).ok, false);
      await page.evaluate(text => { window.skipReplyRender = true; window.nativeTestSprite.showWhisper(text, undefined, undefined, 30000, false); }, spoken.text);
      assert.ok(!reader.visibleHistory('main').some(e => e.id === spoken.deliveryId), 'failed rendering is not a display receipt');
      await page.evaluate(text => { window.skipReplyRender = false; window.nativeTestSprite.showWhisper(text, undefined, undefined, 30000, false); }, spoken.text);
      await until(() => reader.visibleHistory('main').some(e => e.id === spoken.deliveryId), 'native display receipt');
      await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '你刚才说了什么？' });
      const followUp = requests.at(-1).messages.find(m => m.role === 'system' && m.content.includes('【本次接续对象：最后实际展示的台词】'));
      assert.ok(followUp?.content.includes(spoken.text));
      assert.ok(followUp.content.includes(spoken.deliveryId), 'transport binds the actual displayed ID, including when leading assistant history becomes a system quote');
      const chatter = await call('/dsh-pet-7340/stronghold/idle', { pet: 'main', manual: true });
      assert.equal(chatter.segmentIndex, 0, JSON.stringify(chatter));
      assert.ok(!reader.visibleHistory('main').some(e => e.id === chatter.deliveryId));
      await call('/dsh-pet-7340/stronghold/idle', { pet: 'main', deliveryId: chatter.deliveryId }, 'PATCH');
      assert.equal(reader.visibleHistory('main').at(-1).sourceKind, 'idle');
      await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '刚才主动讲的事呢？' });
      const idleFollowUp = requests.at(-1).messages.find(m => m.role === 'system' && m.content.includes('【本次接续对象：最后实际展示的台词】'));
      assert.ok(idleFollowUp?.content.includes(chatter.text), 'the shown idle segment enters the explicit follow-up context');
      assert.ok(idleFollowUp.content.includes(chatter.deliveryId));
      await page.click('[data-page="dialogue"]'); await page.click('[data-section="memories"]');
      await page.click('#searchMemory'); await page.waitForSelector('#memoryRows textarea');
      await page.$eval('#memoryRows textarea', n => { n.value = '现在我更喜欢在晴天整理书店。'; });
      await page.click('#memoryRows article button');
      await page.waitForFunction(() => document.getElementById('notice').textContent.includes('记忆已更新'));
      assert.ok((await api('memories', { actorId: a.id, question: '晴天' })).memories.some(row => row.kind === 'correction'));
      await page.$eval('#memoryQuery', n => { n.value = '晴天'; }); await page.click('#searchMemory');
      await page.waitForFunction(() => !document.getElementById('searchMemory').disabled);
      await page.waitForFunction(() => document.querySelector('#memoryRows textarea')?.value.includes('晴天'));
      const forgottenResponse = page.waitForResponse(r => r.url().endsWith('/stronghold/library') && r.request().postData()?.includes('memory-edit'));
      await page.click('#memoryRows article button:last-child');
      const forgotten = await forgottenResponse; assert.equal(forgotten.status(), 200, await forgotten.text());
      await page.waitForFunction(() => document.getElementById('memoryRows').textContent.includes('没有找到'), { timeout: 5000 }).catch(async () => {
        assert.fail(JSON.stringify(await page.evaluate(() => ({ notice: document.getElementById('notice').textContent, query: document.getElementById('memoryQuery').value, rows: document.getElementById('memoryRows').textContent }))));
      });
      assert.equal((await api('memories', { actorId: a.id, question: '晴天' })).memories.length, 0);
      assert.deepEqual(errors, []);
    }
    const multi = { name: '旧城生活计划', first_mes: '请选择实际人物。', character_book: { entries: [
      { comment: '角色-小雨', content: '姓名：小雨\n小雨在书店工作。' }, { comment: '角色-小夏', content: '姓名：小夏\n小夏喜欢修理收音机。' },
    ] } };
    await api('import-card', { pet: 'partner-2', file: Buffer.from(JSON.stringify(multi)).toString('base64') });
    s = await api('snapshot'); const partner = s.actors.find(a => a.id === s.bindings['partner-2']);
    await api('save-actor', { expectedRevision: s.revision, actorId: partner.id, actor: { name: '我的游戏伙伴', assetId: partner.assetId, speakerName: '', overrides: {} } });
    const automatic = await api('inspect', { actorId: partner.id });
    assert.equal(automatic.needsSpeaker, false, 'a scene is automatically assigned an evidenced speaker');
    assert.notEqual(automatic.speaker.name, partner.name, 'a display alias is not a scene speaker');
    s = await api('snapshot');
    await api('save-actor', { expectedRevision: s.revision, actorId: partner.id, actor: { name: '我的游戏伙伴', assetId: partner.assetId, speakerName: '小夏', overrides: { description: '小夏喜欢修理收音机。' } } });
    assert.equal((await api('inspect', { actorId: partner.id })).speaker.name, '小夏');
    const exported = await api('export', { actorId: partner.id, singleActor: true });
    assert.equal(exported.document.data.name, '小夏'); assert.match(exported.document.data.description, /修理收音机/);
    assert.equal(JSON.parse(await readFile(join(dataDir, 'stronghold-idle-start.json'), 'utf8')).version, 1, 'startup has prepared private local openings');
    const beforeFast = requests.length, fastStarted = Date.now();
    const fast = await call('/dsh-pet-7340/stronghold/idle', { pet: 'main', manual: true, warmStart: true });
    assert.equal(fast.origin, 'local'); assert.ok(fast.text); assert.equal(requests.length, beforeFast);
    assert.ok(Date.now() - fastStarted < 1500, 'first speech does not wait for the model');
    await call('/dsh-pet-7340/stronghold/idle', { pet: 'main', deliveryId: fast.deliveryId, warmStart: true }, 'PATCH');
    await until(() => requests.length > beforeFast, 'one background generation follows the local display receipt');
    assert.ok(new CompanionLibrary(dataDir).visibleHistory('main').some(e => e.id === fast.deliveryId && e.sourceKind === 'idle-local'));
    await until(async () => !(await call('/dsh-pet-7340/stronghold/idle-status?pet=main')).pending, 'background finishes');
    const timeline = await api('history', { actorId: a.id });
    assert.ok(timeline.messages.every(e => e.type === 'user' || e.deliveryState === 'displayed'));
    assert.ok(timeline.messages.some(e => e.id === fast.deliveryId));
    const ensemble = { name: '公开群像样例', first_mes: '请选择人物。', character_book: { entries: Array.from({ length: 20 }, (_, i) => ({
      comment: '角色-' + String.fromCharCode(65 + i), content: '姓名：' + String.fromCharCode(65 + i) + '\n这是第' + (i + 1) + '位人物的公开经历，在河边经营一家小店。' + (i===19 ? '\n'+Array.from({length:30},(_,n)=>'第'+n+'个雨天，我在小店整理书架，还想去看看河边的新桥。').join('\n') : ''),
    })) } };
    await api('import-card', { file: Buffer.from(JSON.stringify(ensemble)).toString('base64') });
    s = await api('snapshot'); const ensembleActor = s.actors.find(x => x.id === s.bindings.main);
    const all = await api('analyze-card', { assetId: ensembleActor.assetId }); assert.equal(all.candidates.length, 20);
    if (browser) {
      const panel = await browser.newPage(); const panelErrors = []; panel.on('pageerror', e => panelErrors.push(String(e)));
      await panel.setViewport({ width: 1100, height: 850 });
      await panel.goto(origin + '/dsh-pet-7340/stronghold/library-ui#token=' + token);
      await panel.waitForFunction(() => document.body.dataset.ready === 'true');
      assert.equal(await panel.$$eval('#mainNav [data-page]', nodes => nodes.length), 6);
      assert.equal(await panel.$eval('.panel-corner',n=>getComputedStyle(n).pointerEvents),'none');
      assert.equal((await request('/dsh-pet-7340/stronghold/library-themes/crystal/portrait.svg')).headers.get('content-type'),'image/svg+xml');
      assert.equal(await panel.evaluate(()=>document.documentElement.dataset.theme),'crystal');
      if (process.env.SP_UI_CAPTURE) await panel.screenshot({ path: process.env.SP_UI_CAPTURE.replace(/\.png$/u, '-overview.png'), fullPage: true });
      await panel.click('[data-page="people"]'); await panel.click('[data-section="cast"]');
      await panel.waitForFunction(() => document.querySelectorAll('#castList button').length === 21);
      await panel.$eval('[data-speaker="T"]', n => n.scrollIntoView()); await panel.click('[data-speaker="T"]');
      await panel.waitForFunction(() => Number(document.getElementById('castBiography').dataset.pages)>1);
      assert.ok(await panel.$eval('#castBiography',n=>n.scrollHeight<=n.clientHeight+1));
      const nextBio=await panel.$eval('#castBiography',n=>n.textContent);await panel.click('#castPager button:last-child');
      await panel.waitForFunction(t=>document.getElementById('castBiography').textContent!==t,{},nextBio);await panel.click('#castPager button:first-child');
      assert.match(await panel.$eval('#castDetail', n => n.textContent), /第20位/);
      const before = (await api('inspect', { actorId: ensembleActor.id })).speaker.name;
      assert.equal((await api('inspect', { actorId: ensembleActor.id })).speaker.name, before, 'inspection does not apply a character');
      await panel.click('#applyCast'); await panel.waitForFunction(() => document.querySelector('#notice').textContent.includes('已使用'));
      assert.equal((await api('inspect', { actorId: ensembleActor.id })).speaker.name, 'T');
      await panel.click('[data-section="actors"]');await panel.click('#newActor');await panel.waitForSelector('#createActorDialog[open]');await panel.click('#createActorCancel');
      await panel.waitForFunction(()=>document.querySelector('[data-person-name]')?.textContent==='T');
      await panel.click('[data-section="actorEditor"]');
      const draft=await panel.$eval('#description',n=>{n.value+='\n未保存的公开草稿。';return n.value;});
      await panel.click('[data-field="personality"]');await panel.click('[data-field="description"]');
      assert.equal(await panel.$eval('#description',n=>n.value),draft,'field tabs retain unsaved edits');
      assert.equal(await panel.$$eval('#actorEditor select',nodes=>nodes.filter(n=>n.getClientRects().length).length),0,'editor does not repeat actor and card selectors');
      await panel.click('[data-page="world"]');
      await panel.waitForSelector('#revisionDialog[open]'); await panel.click('#revision-keep');
      await panel.waitForSelector('#enabledBookList input',{visible:true});
      await panel.click('#enabledBookList input'); await panel.click('#bookBindings button');
      await panel.waitForFunction(() => document.querySelector('#notice').textContent.includes('世界书选择已应用'));
      assert.ok((await api('snapshot')).actors.find(x => x.id === ensembleActor.id).bookIds.includes(book.id));
      await panel.click('[data-page="people"]'); await panel.click('[data-section="cast"]');
      await panel.waitForFunction(() => { const b = document.querySelector('#castList [data-speaker="T"]'), list = document.querySelector('#castList'); if (!b) return false; const r = b.getBoundingClientRect(), p = list.getBoundingClientRect(); return r.top >= p.top - 1 && r.bottom <= p.bottom + 1 && r.bottom <= innerHeight && r.left >= p.left - 1 && r.right <= p.right + 1; }, { timeout: 5000 });
      if (process.env.SP_UI_CAPTURE) { await panel.evaluate(() => window.scrollTo(0, 0)); await panel.screenshot({ path: process.env.SP_UI_CAPTURE.replace(/\.png$/u, '-cast.png'), fullPage: false }); }
      await panel.click('[data-page="settings"]'); await panel.click('[data-section="apiSettings"]');
      await panel.waitForFunction(() => document.querySelector('#apiModel')?.value === 'public-fixture', { timeout: 5000 }).catch(async () => {
        throw new Error('Connection panel not ready: ' + JSON.stringify(await panel.evaluate(() => ({
          model: document.querySelector('#apiModel')?.value, notice: document.querySelector('#notice').textContent,
          dialogs: [...document.querySelectorAll('dialog[open]')].map(n => n.id), sections: [...document.querySelectorAll('main>section:not([hidden])')].map(n => n.id),
          status: document.querySelector('#connectionStatus')?.textContent,
        }))));
      });
      assert.equal(await panel.$eval('#apiKey', n => n.value), '', 'saved keys are never placed in the form');
      await panel.$eval('#apiModel', n => { n.value = 'public-fixture-panel'; }); await panel.click('#apiForm button[type="submit"], #apiForm button.primary');
      await panel.waitForFunction(() => document.querySelector('#connectionStatus').textContent.includes('连接已保存并生效'));
      const connection = await call('/standalone-ai/settings'); assert.equal(connection.model, 'public-fixture-panel'); assert.equal(connection.hasKey, true, 'an empty new-key field preserves the configured key');
      await panel.click('[data-section="appearanceSettings"]');await panel.waitForFunction(()=>document.getElementById('optionBubble').value==='20');
      await panel.$eval('#fontSize',n=>{n.value='22';});await panel.$eval('#backgroundOpacity',n=>{n.value='13';});await panel.click('#appearanceForm button.primary');
      await panel.waitForFunction(()=>getComputedStyle(document.documentElement).fontSize==='22px');
      await panel.reload();await panel.waitForFunction(()=>document.body.dataset.ready==='true');
      assert.equal(await panel.evaluate(()=>getComputedStyle(document.documentElement).fontSize),'22px','font preference survives reload');
      assert.equal(await panel.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--panel-background-opacity').trim()),'0.13');
      await panel.click('[data-page="settings"]');
      await panel.click('[data-section="dialogueSettings"]');
      await panel.waitForFunction(() => document.querySelector('#optionChars').value === '60');
      await panel.select('#optionEffort', 'medium'); await panel.click('#chatSettingsForm button');
      await panel.waitForFunction(() => document.querySelector('#notice').textContent.includes('对话设置已保存'));
      assert.equal((await call('/dsh-pet-7340/stronghold/chat-options')).effort, 'medium');
      const recentRows=Array.from({length:15},(_,i)=>({id:'recent-'+i,type:i%2?'user':'assistant',speakerName:'T',at:Date.now()-i*1000,text:'第'+i+'条：'+('下雨时，我喜欢和你聊聊街角的书店。👩🏽‍💻'+i+'。').repeat(i===2?100:2+i%4)}));
      await panel.setRequestInterception(true);panel.on('request',r=>{let body;try{body=JSON.parse(r.postData()||'null');}catch{/* non-JSON */}
        if(body?.action==='recent-history')void r.respond({status:200,contentType:'application/json',body:JSON.stringify({messages:recentRows})});else void r.continue();});
      await panel.click('[data-page="dialogue"]');await panel.click('[data-section="historyPage"]');await panel.waitForFunction(()=>document.getElementById('historyCount').textContent==='最近 15 条');
      async function collectPages(){
        await panel.waitForFunction(()=>Number(document.getElementById('chatHistory').dataset.pages)>0);
        const gathered={};let count=0;
        while(true){
          const page=await panel.evaluate(()=>{const body=document.getElementById('chatHistory'),r=body.getBoundingClientRect();return {page:body.dataset.page,fit:body.scrollHeight<=body.clientHeight+1&&[...body.children].every(n=>n.getBoundingClientRect().bottom<=r.bottom+1),rows:[...body.querySelectorAll('article')].map(n=>({id:n.dataset.messageId,text:n.querySelector('p').textContent})),last:document.querySelector('#historyPager button:last-child').disabled};});
          assert.ok(page.fit,'messages must fit available page height');for(const row of page.rows)gathered[row.id]=(gathered[row.id]||'')+row.text;count++;
          if(page.last)break;assert.ok(count<100);await panel.click('#historyPager button:last-child');
          await panel.waitForFunction(p=>document.getElementById('chatHistory').dataset.page!==p,{},page.page);
        }
        assert.equal(Object.keys(gathered).length,15);for(const row of recentRows)assert.equal(gathered[row.id],row.text,'pagination preserves every grapheme, including long replies');return count;
      }
      await panel.setViewport({width:960,height:640});await panel.click('#refreshHistory');await delay(150);const compactPages=await collectPages();
      await panel.setViewport({width:1440,height:900});await panel.click('#refreshHistory');await delay(150);const largePages=await collectPages();
      assert.ok(largePages<compactPages,'larger window fits more messages per page');
      await panel.click('#refreshHistory');await delay(150);
      if(process.env.SP_UI_CAPTURE)await panel.screenshot({path:process.env.SP_UI_CAPTURE.replace(/\.png$/u,'-history.png')});
      await panel.click('[data-page="world"]');
      await panel.click('[data-section="worldLibrary"]');
      await panel.waitForSelector('#bookShelf button',{visible:true});
      await panel.click('#bookShelf button');
      await panel.click('#editBook');
      await panel.waitForSelector('#books:not([hidden])',{visible:true});
      for(const [width,height]of [[960,640],[1200,800],[1440,900]]){
        await panel.setViewport({width,height});
        assert.ok(await panel.evaluate(()=>{const panes=[...document.querySelectorAll('#books .book-editor> *')].map(n=>n.getBoundingClientRect()),button=document.getElementById('saveBook').getBoundingClientRect();return Math.max(...panes.map(r=>r.height))-Math.min(...panes.map(r=>r.height))<2&&button.bottom<innerHeight&&document.documentElement.scrollHeight<=innerHeight+1;}),'worldbook columns align and save remains visible');
      }
      await panel.setViewport({width:960,height:640});await panel.click('[data-page="settings"]');await panel.click('[data-section="appearanceSettings"]');
      await panel.$eval('#fontSize',n=>{n.value='28';});await panel.click('#appearanceForm button.primary');await panel.waitForFunction(()=>getComputedStyle(document.documentElement).fontSize==='28px');
      await panel.click('[data-page="dialogue"]');await panel.click('[data-section="historyPage"]');await panel.waitForFunction(()=>document.getElementById('historyCount').textContent==='最近 15 条');await delay(120);await collectPages();
      await panel.click('[data-page="people"]');await panel.click('[data-section="actorEditor"]');
      assert.ok(await panel.$eval('#saveActor',n=>n.getBoundingClientRect().bottom<innerHeight),'large-font editor keeps save reachable');
      await panel.click('[data-page="settings"]');await panel.click('[data-section="appearanceSettings"]');await panel.$eval('#fontSize',n=>{n.value='22';});await panel.click('#appearanceForm button.primary');await panel.waitForFunction(()=>getComputedStyle(document.documentElement).fontSize==='22px');
      await panel.click('[data-page="status"]');
      assert.equal(await panel.$('[data-section="moodPage"]'),null,'unimplemented mood controls are not shown as an empty page');
      assert.ok(await panel.$('[data-section="runtimePage"]'));
      await panel.setViewport({ width: 560, height: 800 }); await panel.click('[data-page="people"]'); await panel.click('[data-section="cast"]');
      assert.ok(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'small-screen panel does not overflow');
      if (process.env.SP_UI_CAPTURE) await panel.screenshot({ path: process.env.SP_UI_CAPTURE.replace(/\.png$/u, '-mobile.png'), fullPage: true });
      panel.removeAllListeners('request');await panel.setRequestInterception(false);
      const resetFixture=new CompanionLibrary(dataDir);
      try{await resetFixture.ready();await resetFixture.event(ensembleActor.id,'direct:'+ensembleActor.id,{type:'user',text:'这条公开合成记录用于测试清空确认。'});}finally{await resetFixture.close();}
      await panel.setViewport({width:1200,height:800});await panel.click('[data-page="settings"]');await panel.click('[data-section="dataSettings"]');
      await panel.click('#clearHistory');await panel.waitForSelector('#clearHistoryDialog[open]');
      assert.equal((await api('recent-history',{actorId:ensembleActor.id})).messages.length,1,'opening the confirmation does not delete history');
      await panel.click('#cancelClearHistory');
      assert.equal((await api('recent-history',{actorId:ensembleActor.id})).messages.length,1,'cancel retains history');
      await panel.click('#clearHistory');await panel.waitForSelector('#clearHistoryDialog[open]');await panel.click('#confirmClearHistory');
      await panel.waitForFunction(()=>document.getElementById('notice').textContent.includes('记忆和历史记录已清空'));
      assert.equal((await api('recent-history',{actorId:ensembleActor.id})).messages.length,0);
      await panel.click('[data-page="dialogue"]');await panel.click('[data-section="historyPage"]');await panel.waitForFunction(()=>document.getElementById('historyCount').textContent==='最近 0 条');

      const coverFile=process.env.SP_UI_CARD;
      const original=coverFile
        ? (await readFile(coverFile)).toString('base64')
        : (await api('export',{actorId:ensembleActor.id,format:'png',singleActor:true})).file;
      await api('import-card',{file:original});
      await panel.reload();
      await panel.waitForFunction(()=>document.querySelector('#companionPortrait img')?.naturalWidth>0);
      assert.equal(await panel.$eval('#companionPortrait img',img=>img.src.slice('data:image/png;base64,'.length)),original);
      await panel.click('#companionPortrait');await panel.waitForSelector('#portraitDialog[open]');
      await panel.click('#portraitClose');
      async function checkPortraitRatios(){
        const sizing=await panel.$eval('#companionPortrait',async frame=>{
          const image=frame.querySelector('img'),src=image.src;
          const measure=()=>[frame.offsetWidth,frame.offsetHeight];
          const original=measure(),results=[];
          try{
            for(const [width,height]of [[96,640],[640,96],[250,250]]){
              const preview=document.createElement('canvas');
              preview.width=width;preview.height=height;
              image.src=preview.toDataURL('image/png');
              await image.decode();
              results.push({frame:measure(),fits:image.offsetLeft>=0&&image.offsetTop>=0
                &&image.offsetLeft+image.offsetWidth<=frame.clientWidth+1
                &&image.offsetTop+image.offsetHeight<=frame.clientHeight+1
                &&getComputedStyle(image).objectFit==='contain'});
            }
          }finally{image.src=src;await image.decode();}
          return {original,results};
        });
        for(const {frame,fits}of sizing.results){assert.deepEqual(frame,sizing.original);assert.ok(fits);}
      }
      async function checkPanelTools(){
        await panel.hover('#deskMore');
        await panel.waitForSelector('#panelTooltip:popover-open');
        assert.equal(await panel.$eval('#panelTooltip',n=>n.textContent),'面板工具');
        assert.ok(await panel.$eval('#panelTooltip',n=>getComputedStyle(n).backgroundColor
          ===getComputedStyle(document.querySelector('#notice')).backgroundColor),'tooltip uses the current theme surface');
        await panel.click('#deskMore');
        await panel.waitForSelector('#deskShortcuts:popover-open');
        assert.ok(await panel.evaluate(()=>{
          const anchor=document.querySelector('#deskMore').getBoundingClientRect();
          const menu=document.querySelector('#deskShortcuts').getBoundingClientRect();
          return menu.top>=anchor.bottom&&menu.top-anchor.bottom<=9&&menu.left>=0&&menu.right<=innerWidth
            &&menu.bottom<=innerHeight&&!document.querySelector('dialog[open]');
        }),'panel tools stay next to their trigger without a modal');
        await panel.keyboard.press('ArrowDown');
        assert.ok(await panel.evaluate(()=>document.activeElement===document.querySelectorAll('#deskShortcuts button')[1]));
        await panel.keyboard.press('Escape');
        assert.equal(await panel.$('#deskShortcuts:popover-open'),null);
        assert.equal(await panel.evaluate(()=>document.activeElement.id),'deskMore');
        await panel.click('#deskMore');
        await panel.evaluate(()=>[...document.querySelectorAll('#deskShortcuts button')].find(n=>n.textContent==='外观与主题').click());
        await panel.waitForSelector('#appearanceSettings:not([hidden]) #panelTheme',{visible:true});
      }
      await checkPortraitRatios();
      await checkPanelTools();
      await panel.click('[data-page="dialogue"]');
      await panel.evaluate(()=>document.documentElement.style.setProperty('--panel-background-opacity','0.08'));
      const message='正式面板公开测试，你好。';
      await panel.type('#liveMessage',message);
      await panel.click('#liveSend');
      await panel.waitForFunction(()=>!!document.querySelector('#liveChat article[data-role="assistant"]'));
      assert.match(await panel.$eval('#liveChat',n=>n.textContent),/苹果派/u);
      await until(async()=>(await api('recent-history')).messages.some(row=>row.type==='assistant'),'visible panel acknowledges its reply');
      assert.equal(await panel.$eval('#liveMessage',n=>n.value),'');
      assert.equal((await api('recent-history')).messages.filter(row=>row.text===message).length,1);
      if(process.env.SP_UI_CAPTURE)await panel.screenshot({path:process.env.SP_UI_CAPTURE.replace(/\.png$/u,'-dialogue.png')});

      await panel.type('#liveMessage','换主题时保留这条草稿');
      await panel.click('[data-page="settings"]');
      await panel.click('[data-section="appearanceSettings"]');
      await panel.select('#panelTheme','parchment');
      await panel.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--pendant-art').includes('/parchment/'));
      await checkPortraitRatios();
      await checkPanelTools();
      await panel.click('[data-page="dialogue"]');
      assert.equal(await panel.$eval('#liveMessage',n=>n.value),'换主题时保留这条草稿');
      await panel.waitForFunction(()=>document.querySelector('#liveChat').textContent.includes('苹果派'));
      if(process.env.SP_UI_PARCHMENT_CAPTURE)await panel.screenshot({path:process.env.SP_UI_PARCHMENT_CAPTURE});
      await panel.reload();
      await panel.waitForFunction(()=>document.body.dataset.ready==='true'&&document.documentElement.dataset.theme==='parchment');
      await panel.click('[data-page="dialogue"]');

      await panel.click('[data-page="settings"]');
      await panel.click('[data-section="appearanceSettings"]');
      assert.deepEqual(await panel.$$eval('#panelTheme option',nodes=>nodes.map(n=>n.value)),['crystal','parchment','desk','book','broadcast']);
      await panel.select('#panelTheme','broadcast');
      const arc=selector=>'#broadcastPanel >>> '+selector;
      await panel.waitForSelector(arc('.stage-card img'),{visible:true});
      assert.equal(await panel.$eval(arc('.stage-card img'),img=>img.src.split(',')[1]),original);
      await panel.click(arc('.choose-stage-card'));await panel.waitForSelector('#actors:not([hidden])');
      const chosenAsset=await panel.$eval('#cardShelf [aria-current=true]',n=>n.dataset.asset);
      const textAsset=a.assetId;
      await panel.click('#cardShelf [data-asset="'+textAsset+'"]');
      await panel.click(arc('.choose-stage-card'));
      assert.equal(await panel.$eval('#cardShelf [aria-current=true]',n=>n.dataset.asset),chosenAsset);
      await panel.waitForFunction(()=>document.querySelector('#cardPreview img')?.src===document.querySelector('#broadcastPanel').shadowRoot.querySelector('.stage-card img')?.src);
      const tools=await panel.$$eval('.card-preview .actions button',nodes=>nodes.map(b=>({
        name:b.getAttribute('aria-label'),visible:b.querySelector('svg')?.getBoundingClientRect().width>0,
        compact:getComputedStyle(b.querySelector('.card-action-label')).display==='none'
      })));
      assert.equal(tools.length,6);assert.ok(tools.every(b=>b.name&&b.visible&&b.compact));
      if(process.env.SP_UI_BROADCAST_CAPTURE)await panel.screenshot({path:process.env.SP_UI_BROADCAST_CAPTURE.replace(/\.png$/u,'-library.png')});
      await panel.click('#cardShelf [data-asset="'+textAsset+'"]');await panel.click('#applyCard');
      await panel.waitForFunction(()=>document.querySelector('#broadcastPanel').shadowRoot.querySelector('.stage-card').disabled);
      assert.equal(await panel.$(arc('.stage-card img')),null);
      await panel.click('#cardShelf [data-asset="'+chosenAsset+'"]');await panel.click('#applyCard');
      await panel.waitForFunction(()=>document.querySelector('#broadcastPanel').shadowRoot.querySelector('.stage-card img')?.naturalWidth>0);
      await panel.click(arc('[data-page="dialogue"]'));
      await panel.waitForSelector('#chatPage:not([hidden])');
      await panel.click(arc('#open-stage-card'));
      await panel.waitForFunction(()=>document.querySelector('#portraitDialog[open] img')?.naturalWidth>0);
      assert.equal(await panel.$eval('#portraitDialog img',img=>img.src.split(',')[1]),original);
      await panel.keyboard.press('Escape');
      await panel.click(arc('.stops [data-mode="listen"]'));
      await panel.waitForSelector('#broadcastListen:not([hidden])');
      if(coverFile?.includes('能天使')){
        assert.equal(await panel.$eval('#broadcastListen h3',n=>n.textContent),'角色卡开场');
        assert.match(await panel.$eval('#broadcastListen p',n=>n.textContent),/送完/u);
      }
      await panel.click(arc('.stops [data-mode="quiet"]'));
      await panel.waitForFunction(()=>document.querySelector('#broadcastPanel').shadowRoot.querySelector('.shell').dataset.mode==='quiet'&&!document.querySelector('#chatPage').hidden);
      assert.equal((await call('/dsh-pet-7340/stronghold/chat-options')).proactive,false);
      await panel.type('#liveMessage','正式面板公开测试，你好。');await panel.click('#liveSend');
      await panel.waitForFunction(()=>!document.querySelector('#liveMessage').value&&document.querySelector('#liveChat').textContent.includes('苹果派'));
      await panel.setViewport({width:1360,height:900});
      const stageSize=await panel.$eval(arc('.portrait'),n=>[n.clientWidth,n.clientHeight]);
      const extent=await panel.$eval(arc('.shell'),n=>{const a=n.getBoundingClientRect(),b=n.getRootNode().host.getBoundingClientRect();return [b.width-a.width,b.height-a.height];});
      assert.ok(extent.every(gap=>Math.abs(gap)<=2),'broadcast uses the available panel: '+extent);
      assert.ok(stageSize[0]>=450&&stageSize[1]>=480,'responsive cover at 1360px: '+stageSize);
      if(coverFile?.includes('能天使')){
        const framing=await panel.$eval(arc('.portrait'),frame=>{
          const stage=frame.querySelector('.stage-card'),art=stage.querySelector('img'),name=frame.querySelector('.artist-name strong');
          return {fills:art.offsetWidth===stage.clientWidth&&art.offsetHeight===stage.clientHeight&&getComputedStyle(art).objectFit==='cover',
            name:name.textContent,wholeName:name.scrollWidth<=name.clientWidth+1};
        });
        assert.deepEqual(framing,{fills:true,name:'能天使',wholeName:true});
      }
      if(process.env.SP_UI_BROADCAST_PORTRAIT)await (await panel.$(arc('.portrait'))).screenshot({path:process.env.SP_UI_BROADCAST_PORTRAIT});
      assert.equal(await panel.$eval('#liveChat .chat-record',n=>getComputedStyle(n).borderImageSource),'none');
      const platterLayout=await panel.$eval(arc('.tuner'),n=>{
        const frame=n.getBoundingClientRect(),disc=n.querySelector('#platter img').getBoundingClientRect(),label=n.querySelector('#platter span').getBoundingClientRect();
        return [label.top-disc.bottom,(disc.top-frame.top)-(frame.bottom-label.bottom)];
      });
      assert.ok(platterLayout[0]>=8&&Math.abs(platterLayout[1])<=1);
      const cursorStyles=await panel.evaluate(()=>{
        const root=document.querySelector('#broadcastPanel').shadowRoot;
        return [root.querySelector('.desk'),document.querySelector('#liveMessage'),root.querySelector('.nav button'),root.querySelector('#platter'),root.querySelector('#tuning')].map(n=>getComputedStyle(n).cursor);
      });
      assert.ok(cursorStyles.every(cursor=>cursor.includes('url(')));
      assert.match(cursorStyles[0],/%23fff46b/);
      assert.equal(new Set(cursorStyles.slice(0,3)).size,1);
      assert.equal(cursorStyles[3],cursorStyles[4]);assert.notEqual(cursorStyles[0],cursorStyles[3]);
      if(process.env.SP_UI_BROADCAST_CAPTURE)await panel.screenshot({path:process.env.SP_UI_BROADCAST_CAPTURE});
      await panel.setViewport({width:390,height:850});
      assert.ok(await panel.$eval('#liveComposer',n=>n.getBoundingClientRect().bottom<=innerHeight),'composer fits on the first screen');
      if(process.env.SP_UI_BROADCAST_CAPTURE)await panel.screenshot({path:process.env.SP_UI_BROADCAST_CAPTURE.replace(/\.png$/u,'-narrow.png')});
      await panel.click(arc('[data-page="settings"]'));await panel.waitForSelector('#panelTheme',{visible:true});
      assert.ok(await panel.$eval('#broadcastPanel',n=>n.scrollWidth<=n.clientWidth+1));
      await panel.reload();await panel.waitForSelector(arc('.stage-card'),{visible:true});
      await panel.click(arc('[data-page="settings"]'));
      assert.equal(await panel.$eval('#panelTheme',n=>n.value),'broadcast');
      await panel.setViewport({width:1100,height:850});
      await panel.click(arc('[data-page="overview"]'));
      const contained=await panel.$$eval('#overview > .summary-card',nodes=>nodes.every(n=>{
        const b=n.querySelector('button').getBoundingClientRect(),r=n.getBoundingClientRect();
        return b.height>0&&b.bottom<=r.bottom&&b.right<=r.right;
      }));
      assert.ok(contained,'overview actions stay inside their cards');
      await panel.click(arc('[data-page="world"]'));await panel.click('#subNav [data-section="worldLibrary"]');
      await panel.click('#bookShelf button');await panel.click('#editBook');
      for(const [width,height] of [[1200,800],[860,650],[390,850]]){
        await panel.setViewport({width,height});
        const metrics=await panel.evaluate(()=>({
          title:document.querySelector('#entryName').getBoundingClientRect().width,
          body:document.querySelector('#entryContent').getBoundingClientRect().width,
          overflow:document.querySelector('#books').scrollWidth-document.querySelector('#books').clientWidth
        }));
        assert.ok(metrics.title>=175&&metrics.body>=175&&metrics.overflow<=2,JSON.stringify({width,...metrics}));
      }
      await panel.setViewport({width:1100,height:850});
      if(process.env.SP_UI_BROADCAST_CAPTURE)await panel.screenshot({path:process.env.SP_UI_BROADCAST_CAPTURE.replace(/\.png$/u,'-world.png')});
      await panel.click(arc('[data-page="settings"]'));
      await panel.select('#panelTheme','desk');
      await panel.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--sheet').includes('/desk/'));
      await panel.setViewport({width:1586,height:992});
      await checkPortraitRatios();
      await checkPanelTools();
      await panel.click('[data-page="dialogue"]');
      await panel.waitForFunction(()=>document.querySelector('#liveChat').textContent.includes('苹果派')&&document.querySelector('#liveChat').hasAttribute('data-speaker-art'));
      await panel.evaluate(async()=>{
        const image=new Image();
        image.src='library-themes/desk/study.png';
        await image.decode();
        await document.fonts.ready;
      });
      const ledger=await panel.evaluate(()=>{
        const page=document.querySelector('main').getBoundingClientRect();
        const input=document.querySelector('#liveComposer').getBoundingClientRect();
        return {left:page.left/innerWidth,top:page.top/innerHeight,bottom:page.bottom/innerHeight,below:input.top>page.bottom,visible:input.bottom<=innerHeight};
      });
      assert.ok(Math.abs(ledger.left-.365)<.015&&Math.abs(ledger.top-.06)<.018&&Math.abs(ledger.bottom-.778)<.015&&ledger.below&&ledger.visible,JSON.stringify(ledger));
      if(process.env.SP_UI_DESK_CAPTURE)await panel.screenshot({path:process.env.SP_UI_DESK_CAPTURE});
      await panel.click('#deskAdd');await panel.waitForSelector('#deskShortcuts:popover-open');
      assert.ok(await panel.evaluate(()=>document.querySelector('#deskShortcuts').getBoundingClientRect().bottom
        <document.querySelector('#deskAdd').getBoundingClientRect().top),'composer tools open above the button');
      await panel.keyboard.press('Escape');
      await panel.click('#deskMore');
      await panel.evaluate(()=>[...document.querySelectorAll('#deskShortcuts button')].find(n=>n.textContent==='聊天回看').click());
      await panel.waitForSelector('#historyPage:not([hidden])');
      await panel.click('[data-page="dialogue"]');
      if(coverFile){
        const before=await panel.$eval('#deskExcerpt p',node=>node.textContent);
        assert.ok(before);
        await panel.click('#excerptLater');
        assert.notEqual(await panel.$eval('#deskExcerpt p',node=>node.textContent),before);
      }
      await panel.reload();
      await panel.waitForFunction(()=>document.body.dataset.ready==='true'&&document.documentElement.dataset.theme==='desk');
      await panel.setViewport({width:1200,height:800});
      await panel.click('[data-page="dialogue"]');

      // Delay or fail the panel's own HTTP request without reaching the provider.
      let chatRequest;
      let intercept='failure';
      await panel.setRequestInterception(true);
      panel.on('request',r=>{
        if(!r.url().includes('/dsh-pet-7340/chat?')||r.method()!=='POST')return void r.continue();
        if(intercept==='failure')return void r.respond({status:503,contentType:'application/json',body:'{"ok":false}'});
        chatRequest=r;
      });
      const draftMessage='失败或取消时保留这段输入。';
      await panel.type('#liveMessage',draftMessage);
      await panel.click('#liveSend');
      await panel.waitForFunction(()=>document.querySelector('#liveFeedback').textContent.includes('输入已保留'));
      assert.equal(await panel.$eval('#liveMessage',n=>n.value),draftMessage);
      intercept='hold';
      await panel.click('#liveSend');
      await until(()=>chatRequest,'panel chat request intercepted');
      await panel.click('[data-page="settings"]');
      await panel.click('[data-section="appearanceSettings"]');
      await panel.select('#panelTheme','crystal');
      await panel.waitForFunction(()=>document.documentElement.dataset.theme==='crystal');
      await panel.click('[data-page="dialogue"]');
      assert.equal(await panel.$eval('#chatPage',n=>n.getAttribute('aria-busy')),'true');
      await panel.click('#liveCancel');
      await panel.waitForFunction(()=>document.querySelector('#liveCancel').hidden);
      await chatRequest.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,text:'取消后的迟到回复'})}).catch(()=>{});
      assert.equal(await panel.$eval('#liveMessage',n=>n.value),draftMessage);
      assert.ok(!(await panel.$eval('#liveChat',n=>n.textContent)).includes('迟到回复'));
      chatRequest=null;
      await panel.click('#liveSend');
      await until(()=>chatRequest,'chat request held before switching characters');
      await panel.evaluate(()=>{
        const other=data.actors.find(a=>a.id!==actorId);
        document.getElementById('actor').value=other.id;
        document.getElementById('actor').dispatchEvent(new Event('change'));
      });
      await chatRequest.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,text:'上一人物的迟到回复'})}).catch(()=>{});
      await panel.waitForFunction(()=>document.querySelector('#liveCancel').hidden&&document.querySelector('#liveSend').disabled);
      assert.ok(!(await panel.$eval('#liveChat',n=>n.textContent)).includes('迟到回复'));
      panel.removeAllListeners('request');await panel.setRequestInterception(false);
      await panel.click('[data-page="settings"]');
      await panel.click('[data-section="appearanceSettings"]');
      await panel.select('#panelTheme','desk');
      await panel.waitForFunction(()=>document.documentElement.dataset.theme==='desk');
      for(const [width,height] of [[1366,760],[960,520],[760,430],[390,680]]){
        await panel.setViewport({width,height});
        await panel.click('[data-page="dialogue"]');
        assert.ok(await panel.$eval('#liveComposer',n=>{const r=n.getBoundingClientRect();return r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));
      }
      await panel.mouse.move(2,2);
      await panel.keyboard.press('Tab');
      await panel.focus('#deskMore');
      await panel.waitForSelector('#panelTooltip:popover-open');
      assert.equal(await panel.$eval('#panelTooltip',n=>n.textContent),'面板工具');
      await panel.keyboard.press('Escape');
      assert.equal(await panel.$('#panelTooltip:popover-open'),null);
      await checkPanelTools();
      await panel.click('#deskMore');await panel.waitForSelector('#deskShortcuts:popover-open');
      await panel.click('[data-page="overview"]');
      assert.equal(await panel.$('#deskShortcuts:popover-open'),null);
      await panel.setViewport({width:1200,height:800});
      await panel.evaluate(()=>{
        const selected=document.getElementById('actor');
        selected.value=data.bindings.main;
        selected.dispatchEvent(new Event('change'));
      });
      await panel.waitForFunction(()=>document.querySelector('#companionPortrait img')?.naturalWidth>0);
      await panel.click('[data-page="settings"]');
      await panel.select('#panelTheme','book');
      await panel.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--book-frame').includes('frame-paper.svg'));
      await panel.evaluate(async()=>{
        for(const name of ['shell.webp','rail.webp','rim.webp','seal.webp','flowers.svg']){
          const image=new Image();
          image.src='library-themes/book/'+name;
          await image.decode();
        }
      });
      for(const [width,height] of [[1200,800],[390,680]]){
        await panel.setViewport({width,height});
        const rail=await panel.$$eval('#mainNav button',(buttons,wide)=>buttons.map((button,index)=>{
          if(wide){
            const left=29*innerWidth/1536, right=141*innerWidth/1536;
            const y=[125,240,351,466,570,682][index]*innerHeight/1024;
            const gapY=[190,302,414,522,628,745][index]*innerHeight/1024;
            return [left,right].every(x=>document.elementFromPoint(x,y)?.closest('button')===button)
              &&!document.elementFromPoint(left,gapY)?.closest('#mainNav button');
          }
          const box=button.getBoundingClientRect(),y=box.top+box.height/2;
          return [box.left+4,box.right-4].every(x=>document.elementFromPoint(x,y)?.closest('button')===button);
        }),width>760);
        assert.deepEqual(rail,Array(6).fill(true),'the artwork is clickable and the gaps are inactive');
        const checks=await panel.evaluate(async()=>{
          const strip=document.querySelector('#subNav'),main=document.querySelector('main');
          const sections=[];
          for(const page of document.querySelectorAll('#mainNav button')){
            page.click();
            for(const tab of strip.querySelectorAll('button')){
              tab.click();
              const pane=main.querySelector('section:not([hidden])');
              for(let frame=0;frame<2;frame++){
                await new Promise(requestAnimationFrame);
                const box=strip.getBoundingClientRect();
                const animated=getComputedStyle(pane);
                const dx=animated.transform==='none'?0:new DOMMatrix(animated.transform).m41;
                if(dx!==0||animated.overflowX==='auto'||strip.offsetHeight-strip.clientHeight>1
                  ||box.bottom>innerHeight||document.documentElement.scrollWidth>innerWidth+1){
                  return {width:innerWidth,section:pane.id,dx,overflowX:animated.overflowX,stripHeight:strip.offsetHeight,stripClientHeight:strip.clientHeight,stripBottom:box.bottom,rootWidth:document.documentElement.scrollWidth};
                }
              }
              sections.push(pane.id);
            }
          }
          return sections;
        });
        assert.equal(checks.length,26,JSON.stringify(checks));
      }
      await panel.click('[data-page="people"]');
      await panel.click('[data-section="actors"]');
      await panel.evaluate(()=>{
        const asset=data.actors.find(actor=>actor.id===data.bindings.main).assetId;
        [...document.querySelectorAll('#cardShelf button')].find(button=>button.dataset.asset===asset).click();
      });
      await panel.waitForFunction(()=>document.querySelector('#cardPreview .card-cover')?.naturalWidth>0);
      const selectedCard=await panel.$eval('#cardShelf [aria-current="true"]',button=>[
        getComputedStyle(button).color,getComputedStyle(button,'::before').backgroundImage,
      ]);
      assert.equal(selectedCard[0],'rgb(255, 249, 233)');
      assert.match(selectedCard[1],/rgb\(45, 97, 90\)/u);
      for(const [width,height] of [[390,680],[1200,800]]){
        await panel.setViewport({width,height});
        const cardLayout=await panel.$eval('#cardPreview .card-cover',async image=>{
          const original=image.src, results=[];
          try{
            for(const [w,h] of [[140,600],[600,140],[280,280]]){
              const fixture=document.createElement('canvas');fixture.width=w;fixture.height=h;
              image.src=fixture.toDataURL('image/png');await image.decode();
              const cover=image.getBoundingClientRect(),frame=image.closest('article').getBoundingClientRect();
              const title=image.closest('article').querySelector('h2').getBoundingClientRect();
              const strip=document.querySelector('#subNav').getBoundingClientRect();
              results.push(cover.height>90&&cover.top>=frame.top&&cover.bottom<=title.top&&cover.left>=frame.left
                &&cover.right<=frame.right&&frame.bottom<strip.top&&getComputedStyle(image).objectFit==='contain');
            }
          }finally{image.src=original;await image.decode();}
          return results;
        });
        assert.deepEqual(cardLayout,[true,true,true],width+'px covers fit the visible area');
      }
      const controls=await panel.$$eval('#actors .card-preview .actions button',buttons=>buttons.map(button=>({
        width:button.offsetWidth,label:button.getAttribute('aria-label'),icon:!!button.querySelector('svg'),
      })));
      assert.equal(controls.length,6);
      assert.ok(controls.every(button=>button.width<=39&&button.label&&button.icon));
      await panel.hover('#applyCard');
      await panel.waitForFunction(()=>document.querySelector('#panelTooltip:popover-open')?.textContent==='使用这张卡');
      await panel.mouse.move(5,5);
      if(process.env.SP_UI_CARD_CAPTURE)await panel.screenshot({path:process.env.SP_UI_CARD_CAPTURE});
      await panel.click('#cardPreview .card-preview-zoom');
      await panel.waitForSelector('#portraitDialog[open]');
      assert.ok(await panel.evaluate(()=>document.querySelector('#portraitDialog img').src===document.querySelector('#cardPreview img').src));
      await panel.keyboard.press('Escape');
      await panel.click('[data-page="settings"]');
      await panel.setViewport({width:1536,height:1024});
      await panel.evaluate(()=>document.documentElement.style.setProperty('--book-font-scale','1'));
      await panel.click('[data-section="promptSettings"]');
      await panel.waitForSelector('.prompt-field-toggle',{visible:true});
      const expanded=await panel.$eval('#promptVoice',voice=>{
        const field=voice.querySelector('[aria-controls="promptVoice-register"]');
        if(field.getAttribute('aria-expanded')==='true')voice.querySelector('button').click();
        field.click();
        return Array.from(voice.querySelectorAll('[aria-expanded=true]'),node=>node.getAttribute('aria-controls'));
      });
      assert.deepEqual(expanded,['promptVoice-register']);
      await panel.waitForFunction(()=>!document.querySelector('#promptSettings').getAnimations().length);
      if(process.env.SP_UI_BOOK_CAPTURE)await panel.screenshot({path:process.env.SP_UI_BOOK_CAPTURE});
      const anchors=await panel.evaluate(()=>{
        const position=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
        return {main:position('main'),portrait:position('#companionPortrait'),
          rail:position('#mainNav'),excerpt:position('#deskExcerpt'),tabs:position('#subNav')};
      });
      for(const [id,expected] of Object.entries({
        main:[582,131,880,777],portrait:[188,47,372,474],rail:[0,0,172,1024],
        excerpt:[242,631,268,138],tabs:[654,752,736,70],
      })){
        assert.ok(anchors[id].every((value,index)=>Math.abs(value-expected[index])<3),id+' '+anchors[id]);
      }
      const promptLayout=await panel.evaluate(()=>{
        const rect=id=>document.getElementById(id).getBoundingClientRect();
        return {fieldsEnd:rect('promptVoice').bottom,tabsTop:rect('subNav').top,tabsEnd:rect('subNav').bottom,
          saveTop:rect('promptSave').top,nameLabel:getComputedStyle(document.getElementById('promptPerson')).display};
      });
      assert.ok(promptLayout.fieldsEnd<=promptLayout.tabsTop+1&&promptLayout.tabsEnd<=promptLayout.saveTop+12
        &&promptLayout.nameLabel==='none',JSON.stringify(promptLayout));
      await panel.click('#deskMore');
      await panel.waitForSelector('#deskShortcuts:popover-open');
      await panel.waitForFunction(()=>[...document.querySelectorAll('#deskShortcuts button')].some(button=>button.textContent==='导出提示预设'));
      await panel.keyboard.press('Escape');
      await panel.hover('#companionPortrait');
      await panel.waitForFunction(()=>document.querySelector('#companionPortrait').style.getPropertyValue('--book-card-turn')==='-2.8deg');
      await panel.mouse.move(5,5);
      await panel.waitForFunction(()=>document.querySelector('#companionPortrait').style.getPropertyValue('--book-card-turn')==='0deg');
      await panel.click('#companionPortrait');
      await panel.waitForSelector('#portraitDialog[open]');
      assert.ok(await panel.$eval('#portraitDialog',n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
      await panel.keyboard.press('Escape');
      await panel.click('[data-page="dialogue"]');
      await panel.click('[data-section="chatPage"]');
      await panel.waitForSelector('#liveChat [data-role="user"]');
      assert.ok(await panel.$eval('#bookSceneTitle',title=>title.scrollWidth<=title.clientWidth));
      assert.match(await panel.$eval('#liveChat [data-role="user"]',row=>getComputedStyle(row,'::after').backgroundImage),/rgb\(141, 128, 85\)/u);
      await panel.click('#deskAdd');await panel.waitForSelector('#deskShortcuts:popover-open');
      assert.equal(await panel.$$eval('#deskShortcuts button',nodes=>nodes.map(n=>n.textContent).join('、')),'插入摘录、清空输入');
      await panel.keyboard.press('Escape');
      if(process.env.SP_UI_BOOK_CAPTURE)await panel.screenshot({path:process.env.SP_UI_BOOK_CAPTURE.replace(/\.png$/u,'-chat.png')});
      const excerptText='这里是用于验证滚动手感的长段文本。'.repeat(85);
      await api('import-card',{file:Buffer.from(JSON.stringify({
        name:'摘录滚动样例',personality:'回答简短。',
        character_book:{entries:[{keys:['摘录'],content:excerptText,enabled:true,extensions:{ark_companion:{broadcastExcerpt:'书店今天开门了。'}}},
          ...[{knowledge:'author_only'},{subject:'另一位人物'},{speakers:['另一位人物']},{conditions:[{path:'closed',value:true}]}]
            .map(rule=>({keys:['备注'],content:'限定资料不能出现在阅读区。',extensions:{ark_companion:{...rule,broadcastExcerpt:'限定频道。'}}}))]},
      })).toString('base64')});
      await panel.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
      await panel.click('#mainNav [data-page="settings"]');
      await panel.click('#subNav [data-section="appearanceSettings"]');
      await panel.$eval('#appearanceForm',form=>{
        form.querySelector('#reduceMotion').checked=false;
        form.requestSubmit();
      });
      await panel.waitForFunction(()=>document.querySelector('#notice').textContent==='显示设置已保存');
      await panel.reload();
      await panel.waitForFunction(text=>document.querySelector('#deskExcerpt .excerpt-copy')?.textContent===text,{},excerptText);
      const program=await panel.evaluate(()=>selectedActor().panelExcerpts);
      assert.ok(program.reading.includes(excerptText)&&!program.reading.some(text=>text.includes('限定资料')));
      assert.deepEqual(program.broadcast,['书店今天开门了。']);
      assert.equal(await panel.evaluate(()=>window.ArkMotion.reduced()),false);
      await panel.mouse.move(5,5);
      try{
        await panel.waitForFunction(()=>!document.querySelector('#deskExcerpt .excerpt-scroll-layer').hidden,{timeout:9000});
      }catch(error){
        const state=await panel.$eval('#deskExcerpt',excerpt=>{
          const scroller=excerpt.querySelector('p'),rect=excerpt.getBoundingClientRect();
          return {theme:document.documentElement.dataset.theme,hidden:document.hidden,reduced:window.ArkMotion.reduced(),
            appReduced:document.body.classList.contains('reduce-motion'),systemReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
            hover:excerpt.matches(':hover'),focused:excerpt.matches(':focus-within'),dialog:document.querySelector('#portraitDialog').open,
            top:rect.top,height:rect.height,client:scroller.clientHeight,scroll:scroller.scrollHeight,
            textLength:scroller.textContent.length,visibility:getComputedStyle(excerpt).display};
        });
        throw new Error('Excerpt did not start: '+JSON.stringify(state),{cause:error});
      }
      const scroll=await panel.$eval('#deskExcerpt .excerpt-scroll-layer > span',async copy=>{
        const positions=[];
        for(let i=0;i<12;i++){
          await new Promise(requestAnimationFrame);
          const transform=getComputedStyle(copy).transform;
          positions.push(transform==='none'?null:-new DOMMatrix(transform).m42);
        }
        return positions;
      });
      assert.ok(scroll.every((value,i)=>value!==null&&(!i||value>=scroll[i-1])));
      assert.ok(scroll.some(value=>Math.abs(value-Math.round(value))>.05),'the painted scroll follows fractional offsets');
      assert.ok(scroll.at(-1)-scroll[0]>2,'the excerpt visibly advances across frames');
      await panel.hover('#deskExcerpt');
      const paused=await panel.$eval('#deskExcerpt p',excerpt=>excerpt.scrollTop);
      await delay(220);
      assert.equal(await panel.$eval('#deskExcerpt p',excerpt=>excerpt.scrollTop),paused);
      assert.equal(await panel.$eval('#deskExcerpt .excerpt-scroll-layer',layer=>layer.hidden),true);
      await panel.mouse.wheel({deltaY:180});
      await panel.waitForFunction(top=>document.querySelector('#deskExcerpt p').scrollTop>top,{},paused);
      await panel.mouse.move(5,5);
      await panel.waitForFunction(()=>!document.querySelector('#deskExcerpt .excerpt-scroll-layer').hidden,{timeout:9000});
      await panel.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      await panel.waitForFunction(()=>window.ArkMotion.reduced()&&document.querySelector('#deskExcerpt .excerpt-scroll-layer').hidden);
      await panel.reload();
      await panel.waitForFunction(()=>document.body.dataset.ready==='true'&&document.documentElement.dataset.theme==='book');
      assert.equal(await panel.$eval('#deskExcerpt .excerpt-scroll-layer',layer=>layer.hidden),true);
      await panel.click('#mainNav [data-page="settings"]');
      await panel.click('#subNav [data-section="appearanceSettings"]');
      await panel.select('#panelTheme','broadcast');
      await panel.waitForSelector(arc('.stops [data-mode="listen"]'),{visible:true});
      await panel.click(arc('.stops [data-mode="listen"]'));
      await panel.waitForSelector('#broadcastListen:not([hidden])');
      assert.equal(await panel.$eval('#broadcastListen p',n=>n.textContent),'书店今天开门了。');
      assert.equal(await panel.$eval('#broadcastListen button',n=>n.disabled),true);
      assert.deepEqual(panelErrors, []); await panel.close();
    }
  } finally {
    await browser?.close();
    if (child?.exitCode === null) { try { await call('/shutdown', {}); await once(child, 'exit'); } catch { child.kill(); await once(child, 'exit').catch(() => {}); } }
    await new Promise(resolve => model.close(resolve));
    assert.ok(dir.startsWith(join(tmpdir(), 'companion-host-'))); await rm(dir, { recursive: true, force: true });
  }
});
