import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { compileKnowledge, materialType, StoryPlanner } from '../server/companion/knowledge.js';
import { reconcileFactProgress } from '../server/companion/fact-index.js';
import { characterContext } from '../server/companion/materials.js';
import { CompanionLibrary, companionLibrary } from '../server/companion/library.js';
import { ConversationEngine } from '../server/companion/engine.js';
import { buildPrompt } from '../server/companion/prompts.js';
import { batchPrompt } from '../server/companion/batches.js';
import { StoryMemory, storyCatalog } from '../server/desktop/idle-stories.js';
import { extractStorySeeds } from '../server/desktop/idle-chat.js';
import { generatePetChat } from '../server/desktop/chat-options.js';
import { conversationStream } from '../server/desktop/conversation.js';
import { isFollowUp, explicitFollowUpTopic } from '../server/companion/follow-up.js';

test('named earlier topics use retrieval while generic last-line questions retain their display anchor', () => {
  assert.equal(explicitFollowUpTopic('你刚才说的海边呢？'),'海边');assert.equal(isFollowUp('你刚才说的海边呢？'),false);
  for(const question of ['你刚才说了什么？','接着说那件事。','你最后说的那件事后来怎样？'])assert.equal(isFollowUp(question),true);
});

const text = '小雨曾经在海边捡到一张旧地图，后来一直保存在书店里。';
const card = { name: '小雨', description: text, extensions: { ark_companion: { speaker: { name: '小雨', background: text.replace('小雨', '{{char}}') } } } };
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'facts-anchor-')); let lib = new CompanionLibrary(dir);
  try { await lib.importCard(card); await run(lib, dir, async () => { await lib.close(); lib = new CompanionLibrary(dir); await lib.ready(); return lib; }); }
  finally { await lib.close(); await rm(dir, { recursive: true, force: true }); }
}
const show = (lib, id, text, more = {}, room = 'direct:main') => lib.event('main', room, { id, type: 'assistant', text, sourceKind: 'idle', deliveryState: 'displayed', ...more });

test('exact cross-field facts retain all original sources, stable identity and only one narratable source', () => {
  const before = JSON.stringify(card), k = compileKnowledge(card);
  assert.equal(k.facts.length, 1); assert.equal(k.facts[0].sourceRefs.length, 2); assert.equal(k.index.merges.length, 1);
  assert.deepEqual(k.facts[0].sourceRefs.map(r => r.path), ['/description', '/speaker/background']);
  assert.equal(k.facts[0].sourceIds.length, 2);
  const removed = compileKnowledge({ ...card, description: '' });
  assert.equal(k.facts[0].canonicalId, removed.facts[0].canonicalId); assert.equal(k.facts[0].eventId, removed.facts[0].eventId);
  assert.equal(extractStorySeeds(card).length, 1); assert.equal(JSON.stringify(card), before);
  const sameBody = { name: '小雨', description: text, extensions: { ark_companion: { speaker: { name: '小雨', description: text } } } };
  assert.equal(characterContext(sameBody, '聊聊海边地图').split(text).length - 1, 1);
});

test('different people, negation and worldbook gates stay separate; examples and author comments are not canon', () => {
  const c = { name: '小雨', description: '我喜欢喝茶。\n\n我不喜欢喝茶。\n\n# 声部四·作者\n笔筒这个设定到底要不要留，我犹豫了很久。',
    mes_example: '{{char}}：我曾经结婚又离婚。', character_book: { entries: [
      { id: 'a', content: text, keys: ['海边'], extensions: { ark_companion: { subject: '小雨' } } },
      { id: 'b', content: text, keys: ['地图'], extensions: { ark_companion: { subject: '小雨' } } },
      { id: 'c', content: text, constant: true, extensions: { ark_companion: { subject: '小夏' } } },
    ] } };
  const k = compileKnowledge(c);
  assert.equal(k.facts.filter(f => f.text === text).length, 3);
  assert.equal(new Set(k.facts.filter(f => f.text === text).map(f => f.canonicalId)).size, 3);
  assert.equal(k.facts.filter(f => /我(?:不)?喜欢喝茶/u.test(f.text)).length, 2);
  assert.ok(!k.facts.some(f => /笔筒|结婚/u.test(f.text))); assert.ok(k.index.excluded.some(s => s.role === 'examples'));
  assert.ok(!extractStorySeeds(c).some(s => /笔筒|结婚/u.test(s)));
  for (const label of ['居住地', '家庭成员', '体系与来源', '短板']) assert.equal(materialType(label + '：未记载。'.replace('。', '')), 'attribute');
  assert.deepEqual(extractStorySeeds({ name: '小雨', description: '【居住地】\n海岸边的旧书店\n【身材】\n没有记载。\n【外貌特征】\n深蓝色头发，灰色眼睛。' }), []);
  const catalog = new StoryPlanner().catalog(c, storyCatalog([text]), k);
  assert.equal(catalog.length, 2, 'other character is never offered; each eligible book retains its own gate');
  assert.notEqual(catalog[0].factPoints[0].id, catalog[1].factPoints[0].id);
});

test('old partial/used IDs migrate additively; fully covered paused topics cannot restart their opening', async () => fixture(async lib => {
  const k = compileKnowledge(card), fact = k.facts[0], alias = fact.eventAliases[0], actor = lib.actor();
  await lib.store.call('story-ledger', { characterId: actor.characterId, seed: { used: { [alias]: true }, progress: {
    [alias]: { ids: ['heard'], heard: ['我以前在海边捡到过地图。'], completed: true } }, recent: [] } });
  await new ConversationEngine().prepare(lib, 'main');
  const ledger = await lib.store.call('story-ledger', { characterId: actor.characterId });
  assert.equal(ledger.used[alias], true); assert.equal(ledger.used[fact.eventId], true);
  assert.deepEqual(ledger.progress[fact.eventId].ids, ['heard']);
  assert.equal(lib.inspect('main').factIndex.merges.length, 1);
  const catalog = new StoryPlanner().catalog(card, storyCatalog(extractStorySeeds(card)), k), row = catalog[0], stories = new StoryMemory();
  const entry = stories.entry('one', catalog); stories.recordPart(entry, row, row.text, { id: 'prefix', final: false, informationPoints: row.factPoints });
  assert.equal(entry.progress[row.topic].status, 'paused'); assert.equal(stories.select(entry, catalog, true), null);
  const oldCoverage = { coverage: { [row.factPoints[0].legacyId]: { deliveryId: 'legacy' } } };
  reconcileFactProgress(oldCoverage, catalog); assert.equal(oldCoverage.coverage[row.factPoints[0].id].deliveryId, 'legacy');
}));

test('a continuation prompt receives only the uncovered source points', () => {
  const prompt = batchPrompt({ id: 'one', text: '已讲的茶和未讲的地图。', remainingPoints: [{ text: '那张地图一直保存在旧书店里' }] }, [],
    { grounded: true, heard: ['茶水放凉了。'], contracts: false });
  const evidence = JSON.parse(prompt.split('【唯一背景证据】')[1].split('\n')[0]);
  assert.equal(evidence.text, '那张地图一直保存在旧书店里'); assert.match(prompt, /这是接续/);
});

test('last displayed anchor survives restart and a history window full of user messages; generated tails are excluded', async () => fixture(async (lib, _dir, restart) => {
  await show(lib, 'tea', '苦茶让人皱脸的样子，比委托单有意思。');
  await show(lib, 'guild', '那些公会的委托，以前都是我的分身处理的。', { sourceEvidence: { text: '小雨曾在公会处理委托。', timeState: 'past' } });
  await lib.event('main', 'direct:main', { id: 'unheard', type: 'assistant', text: '这段地图故事没有展示。', sourceKind: 'idle', deliveryState: 'generated' });
  const actor = lib.actor();
  await lib.update(undefined, data => {
    for (let i = 0; i < 45; i++) data.events.push({ id: 'filler-' + i, actorId: actor.id, characterId: actor.characterId, roomId: 'direct:main', type: 'user', text: '普通测试消息。', at: Date.now() + i });
  }, { configuration: false });
  assert.ok(!lib.visibleHistory('main').some(e => e.id === 'guild'));
  const again = await restart(), engine = new ConversationEngine();
  assert.equal((await again.lastDisplayed()).id, 'guild');
  const before = again.snapshot(), context = await engine.prepare(again, 'main', '接着聊聊你刚才说的最后那件事，后来有什么感受？', { preview: true });
  assert.equal(context.anchor.id, 'guild'); assert.equal(context.plan.displayAnchorId, 'guild');
  assert.match(context.prompt, /本次接续对象：最后实际展示/); assert.match(context.prompt, /分身处理/);
  assert.doesNotMatch(context.prompt, /苦茶让人皱脸|地图故事没有展示/); assert.deepEqual(again.snapshot(), before);
  assert.ok(context.prompt.lastIndexOf('最后实际展示') > context.prompt.indexOf('【本次任务】'));
  const ordinary = await engine.prepare(again, 'main', '蓝风铃是什么意思？'); assert.equal(ordinary.anchor, undefined);
  assert.ok(!ordinary.prompt.includes('本次接续对象'));
}));

test('actual receipt order, repeated ACK, forgotten sources, room isolation and clearing all preserve anchor boundaries', async () => fixture(async lib => {
  const actor = lib.actor(), revision = lib.snapshot().revision, epoch = lib.contextEpoch(actor.id);
  for (const id of ['created-first', 'created-later']) await lib.event('main', 'direct:main', { id, type: 'assistant', text: id + '的公开台词。', sourceKind: 'chat', deliveryState: 'generated', expectedRevision: revision, expectedContextEpoch: epoch });
  await lib.acknowledgeChat('main', 'created-later'); await lib.acknowledgeChat('main', 'created-first');
  const latest = await lib.lastDisplayed(); assert.equal(latest.id, 'created-first');
  await lib.acknowledgeChat('main', 'created-later'); assert.deepEqual(await lib.lastDisplayed(), latest);
  await assert.rejects(lib.lastDisplayed('main', 'direct:other'), /不能读取/);
  const memory = (await lib.recall('main', 'created-first')).find(row => row.sourceId === latest.id);
  await lib.editMemory('main', memory.id, {}); assert.equal((await lib.lastDisplayed()).id, 'created-later');
  const snapshot = lib.snapshot(); await lib.clearHistory(actor.id, { characterId: actor.characterId, revision: snapshot.revision,
    memoryRevision: snapshot.memoryRevision || 0, eventRevision: snapshot.eventRevision || 0 });
  assert.equal(await lib.lastDisplayed(), null);
  assert.match(buildPrompt({ card }, { question: '接着说。' }).system, /没有可核对的上一条/);
}));

test('editing a source creates a new fact while retaining raw/manual dialogue and the unaffected source', async () => fixture(async lib => {
  await show(lib, 'heard-before-edit', '我还留着那张地图。');
  const engine = new ConversationEngine(), first = await engine.prepare(lib, 'main'), original = first.knowledge.facts[0];
  await lib.update(undefined, data => { data.actors[0].overrides.description = '小雨曾经在城里修好一台收音机。'; });
  const next = await engine.prepare(lib, 'main');
  assert.equal(next.knowledge.facts.length, 2); assert.ok(next.knowledge.facts.some(f => f.canonicalId === original.canonicalId));
  assert.ok(next.knowledge.facts.some(f => f.text.includes('收音机') && f.canonicalId !== original.canonicalId));
  assert.equal((await lib.lastDisplayed()).id, 'heard-before-edit');
}));

test('last display lookup cannot borrow another character or an excluded audience in a shared room', async () => fixture(async lib => {
  await show(lib, 'main-line', '这句话只在我自己的窗口里讲过。');
  await lib.update(undefined, data => {
    data.actors.push({ ...structuredClone(data.actors[0]), id: 'other', identities: {} });
    data.bindings.partner = 'other'; data.rooms.push({ id: 'shared', members: ['main', 'other'] });
  });
  await lib.event('other', 'direct:other', { id: 'other-private', type: 'assistant', text: '另一人物的私聊。', deliveryState: 'displayed' });
  assert.equal((await lib.lastDisplayed('main')).id, 'main-line'); assert.equal((await lib.lastDisplayed('partner')).id, 'other-private');
  await show(lib, 'shared-public', '这句话是一起聊天时说的。', {}, 'shared');
  await show(lib, 'shared-hidden', '这句话的接收者没有主桌宠。', { audience: ['other'] }, 'shared');
  assert.equal((await lib.lastDisplayed('main', 'shared')).id, 'shared-public');
}));

test('normal chat sends the last displayed guild line to a local HTTP model, with no older tea history or unheard tail', async () => {
  const home = await mkdtemp(join(tmpdir(), 'anchor-wire-')), previous = process.env.DSH_HOME; process.env.DSH_HOME = home;
  const lib = companionLibrary(join(home, 'dsh-pet')); let server, wire, inputHistory;
  try {
    await lib.importCard({ name: '小雨', description: '我是书店店员。\n\n曾经我在公会处理委托。', personality: '自然口语。' });
    await show(lib, 'old-tea', '苦茶让人皱脸的样子，比委托单有意思。');
    await show(lib, 'last-guild', '那些公会的委托，以前都是我的分身处理的。', { sourceEvidence: { text: '曾经在公会处理委托。', timeState: 'past' } });
    await lib.event('main', 'direct:main', { id: 'pending-map', type: 'assistant', text: '下一段准备讲未展示的地图。', sourceKind: 'chat', deliveryState: 'generated' });
    server = createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk; wire = JSON.parse(raw);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '那些委托做完以后，我倒是更喜欢现在能慢慢聊几句的日子。' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const reply = await generatePetChat(async input => {
      inputHistory = input.history; let text = '';
      for await (const part of conversationStream({ protocol: 'openai-compatible', baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', apiKey: 'public-fixture', model: 'public-fixture' },
        { question: input.userText, system: input.system, messages: input.history }, AbortSignal.timeout(10000))) text += part.text || '';
      return { ok: true, text };
    }, { companionPetId: 'main', userText: '接着聊你刚才说的最后那件事，后来有什么感受？', system: '' });
    assert.equal(reply.ok, true); assert.match(reply.text, /那些委托/); assert.equal(inputHistory.length, 1); assert.match(inputHistory[0].content, /分身/);
    assert.match(JSON.stringify(wire.messages), /本次接续对象：最后实际展示/);
    assert.doesNotMatch(JSON.stringify(wire.messages), /苦茶让人皱脸|未展示的地图/);
    assert.equal((await lib.lastDisplayed()).id, 'last-guild', 'generated response remains unheard until ACK');
    assert.equal((await lib.acknowledgeChat('main', reply.deliveryId)).ok, true);
    assert.equal((await lib.lastDisplayed()).id, reply.deliveryId);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await lib.close(); if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});
