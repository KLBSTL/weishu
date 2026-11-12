import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CompanionLibrary, companionLibrary } from '../server/companion/library.js';
import { compileKnowledge, knowledgeProblem, extensionProposals } from '../server/companion/knowledge.js';
import { ConversationEngine, validatedResearch } from '../server/companion/engine.js';
import { runGenerationJob, claimAttempt, generationJob, enableSearchBudget } from '../server/companion/broker.js';
import { withProviderSlot } from '../server/desktop/provider-queue.js';
import { StoryMemory } from '../server/desktop/idle-stories.js';
import { IdleChat, idleChatRoute } from '../server/desktop/idle-chat.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';
import { conversationStream } from '../server/desktop/conversation.js';

const card = { name: '小雨', description: '我是书店店员。小时候奶奶教过我揉面包。', personality: '自然温柔，从不喝咖啡。' };
test('research retries malformed model structure once, preserves progress and exposes no parser error', async () => fixture(async lib => {
  let calls = 0;
  const engine = new ConversationEngine(), deps = { getInput: async () => ({}), generate: async input => {
    calls++; if (calls === 1) return { ok: true, text: '请明确说明问题。' };
    return { ok: true, text: JSON.stringify(JSON.parse(input.userText).map(f => ({ factId: f.factId, quote: f.text.slice(0, 25), group: f.factId }))) };
  } };
  const result = await engine.research(lib, 'main', deps);
  assert.equal(calls, 2); assert.equal(result.count, result.total);
  const cached = await engine.research(lib, 'main', deps); assert.equal(cached.cached, true); assert.equal(calls, 2);
  await lib.importCard({ ...card, description: '新的公开资料：我在山边种花。' }, undefined, 'main', { updateExisting: true });
  let failures = 0;
  await assert.rejects(engine.research(lib, 'main', { getInput: async () => ({}), generate: async () => { failures++; return { ok: true, text: 'not-json' }; } }), error => {
    assert.match(error.message, /已完成的部分仍保留/); assert.doesNotMatch(error.message, /SyntaxError|Unexpected token|not-json/); return true;
  });
  assert.equal(failures, 2);
}));
async function fixture(task) {
  const dir = await mkdtemp(join(tmpdir(), 'companion-engine-')), lib = new CompanionLibrary(dir);
  try { await lib.importCard(card, Buffer.from('public-original')); await task(lib, dir); }
  finally { await lib.close(); assert.ok(dir.startsWith(join(tmpdir(), 'companion-engine-'))); await rm(dir, { recursive: true, force: true }); }
}
test('knowledge has source/time/ownership; daily extensions are allowed and major contradictions rejected', () => {
  const data = compileKnowledge(card); assert.ok(data.facts.every(f => f.sourceRef.sourceHash && f.factId && f.eventId));
  assert.equal(knowledgeProblem('我今天整理了一下书桌，读了几页小说。', card), null);
  assert.equal(extensionProposals('我今天整理了一下书桌。', card).length, 1);
  assert.equal(extensionProposals('我想试一种新的面包。', card).length, 0);
  assert.match(knowledgeProblem('奶奶去世后，我继承了整间店。', card), /major/);
  assert.match(knowledgeProblem('我每天喝咖啡，刚泡了一杯咖啡。', card), /conflict/);
  assert.match(knowledgeProblem('我现在还在等杯子开窑。', card, '小时候做过一个杯子。'), /past/);
});
test('optional research must quote a real owned source and cannot manufacture a fact or clear a condition', () => {
  const knowledge = compileKnowledge(card), fact = knowledge.facts.find(f => f.text.includes('揉面包'));
  assert.equal(validatedResearch(knowledge, [{ factId: fact.factId, quote: '奶奶教过我揉面包', group: '童年面包' }]).length, 1);
  assert.throws(() => validatedResearch(knowledge, [{ factId: fact.factId, quote: '奶奶把店交给我', group: '继承' }]), /引用/);
  assert.throws(() => validatedResearch(knowledge, [{ factId: 'fake', quote: '不存在的经历', group: '新人生' }]), /引用/);
});

test('repeated card paragraphs prepare across restart without duplicate fact keys or lost source locations', async () => fixture(async (lib, dir) => {
  const text = '小时候奶奶教过我揉面包，我记得厨房里暖暖的香气。';
  const repeated = { name: '小雨', description: '# 往事\n' + text + '\n\n# 往事\n' + text,
    character_book: { entries: [{ content: text, constant: true }] } };
  await lib.importCard(repeated);
  const context = await new ConversationEngine().prepare(lib, 'main');
  const facts = context.knowledge.facts, paragraph = facts.find(f => f.sourceRef.path === '/description');
  assert.equal(facts.length, 2, 'same text in a separate book remains a separate sourced fact');
  assert.equal(new Set(facts.map(f => f.factId)).size, facts.length);
  assert.equal(paragraph.sourceRefs.length, 2, 'both original paragraph locations are retained');
  assert.notEqual(paragraph.sourceRefs[0].start, paragraph.sourceRefs[1].start);
  for (const ref of paragraph.sourceRefs) assert.equal(repeated.description.slice(ref.start, ref.end).trim(), text);
  const database = new DatabaseSync(join(dir, 'companion.sqlite'), { readOnly: true });
  try { assert.equal(database.prepare('SELECT count(*) AS n FROM facts WHERE character_id=?').get(lib.actor().characterId).n, 2); }
  finally { database.close(); }
  assert.deepEqual(lib.snapshot().assets.at(-1).card.description, repeated.description, 'the imported original is unchanged');
  const restarted = new CompanionLibrary(dir);
  try { assert.equal((await new ConversationEngine().prepare(restarted, 'main')).knowledge.facts.length, 2); }
  finally { await restarted.close(); }
}));

test('idle route reports local context failures without exposing private card contents', async () => fixture(async (_lib, dir) => {
  const previous = process.env.DSH_HOME, warn = console.warn, logs = [], home = join(dir, 'route-home'), data = join(home, 'dsh-pet');
  await mkdir(data, { recursive: true }); process.env.DSH_HOME = home;
  console.warn = message => logs.push(message);
  try {
    const result = await idleChatRoute('POST', JSON.stringify({ pet: 'main', manual: true }), undefined,
      async () => { throw Object.assign(new Error('PRIVATE_CARD_AND_HISTORY'), { code: 'ERR_FIXTURE' }); },
      async () => { assert.fail('context failure must not send a model request'); });
    assert.equal(result.status, 500); assert.equal(result.obj.code, 'IDLE_CONTEXT_FAILED');
    assert.match(result.obj.error, /人物资料/); assert.match(logs[0], /ERR_FIXTURE/);
    assert.doesNotMatch(JSON.stringify([result, logs]), /PRIVATE_CARD_AND_HISTORY/);
  } finally {
    await companionLibrary(data).close(); console.warn = warn;
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
}));
test('SQLite remembers early Chinese phrases across restart, and correction/forgetting cannot revive old sources', async () => fixture(async (lib, dir) => {
  const actor = lib.actor('main');
  await lib.event(actor.id, 'direct:main', { id: 'scarf', type: 'user', text: '我很喜欢蓝色围巾。' });
  await lib.update(undefined, d => { for (let i = 0; i < 60; i++) d.events.push({ id: 'filler-' + i, actorId: actor.id, characterId: actor.characterId, cardId: actor.assetId, speakerKey: 'default', roomId: 'direct:main', type: 'user', text: '普通话题' + i, at: Date.now() + i }); });
  assert.ok(!lib.visibleHistory(actor.id).some(e => e.id === 'scarf'));
  const firstPage = await lib.store.call('history-page', { characterId: actor.characterId, roomId: 'direct:main', cursor: null });
  assert.equal(firstPage.messages.length, 40); assert.ok(firstPage.cursor);
  const recent = await lib.store.call('recent-history', { characterId: actor.characterId, roomId: 'direct:main' });
  assert.equal(recent.messages.length, 15); assert.equal(recent.messages[0].id, 'filler-59'); assert.equal(recent.messages.at(-1).id, 'filler-45');
  assert.equal((await lib.store.call('recent-history', { characterId: 'other-person', roomId: 'direct:main' })).messages.length, 0);
  const older = await lib.store.call('history-page', { characterId: actor.characterId, roomId: 'direct:main', cursor: firstPage.cursor });
  assert.equal(older.messages.length, 21); assert.ok(older.messages.some(e => e.id === 'scarf'));
  assert.equal(new Set([...firstPage.messages, ...older.messages].map(e => e.id)).size, 61);
  assert.equal((await lib.store.call('history-page', { characterId: 'other-person', roomId: 'direct:main', cursor: null })).messages.length, 0);
  let rows = await lib.recall('main', '围巾'); assert.equal(rows[0].sourceId, 'scarf');
  const restarted = new CompanionLibrary(dir); await restarted.ready();
  try {
    assert.equal((await restarted.recall('main', '围巾'))[0].text, '我很喜欢蓝色围巾。');
    await restarted.editMemory('main', rows[0].id, { text: '我现在喜欢红色围巾。' });
    rows = await restarted.recall('main', '围巾'); assert.ok(rows.every(r => r.text !== '我很喜欢蓝色围巾。'));
    assert.ok(rows.some(r => r.kind === 'correction' && r.text.includes('红色')));
    await restarted.editMemory('main', rows.find(r => r.kind === 'correction').id, { removeMessage: true });
    assert.equal((await restarted.recall('main', '围巾')).length, 0);
    await restarted.event(actor.id, 'direct:main', { id: 'erase-source', type: 'user', text: '这句原文需要永久删除。' });
    const erase = (await restarted.recall('main', '永久删除'))[0]; await restarted.editMemory('main', erase.id, { removeMessage: true });
    const exported = await restarted.exportLegacy();
    assert.ok(!exported.events.some(e => e.id === 'erase-source'));
    assert.ok(!exported.memoryArchive.some(e => e.source_id === 'erase-source'));
    await lib.update(undefined, d => { d.preset.style = '自然一些。'; });
    assert.equal((await lib.recall('main', '围巾')).length, 0);
    assert.equal((await readFile(join(dir, 'companion-assets', lib.snapshot().assets[0].originalPath))).toString(), 'public-original');
    assert.ok(!(await readFile(join(dir, 'companion-view.json'), 'utf8')).includes('cHVibGljLW9yaWdpbmFs'));
  } finally { await restarted.close(); }
}));
test('display receipt commits progress and extension once; drafts and invalidated deliveries are not memory', async () => fixture(async lib => {
  const actor = lib.actor('main'), text = '我今天整理了一下书桌。';
  await lib.event(actor.id, 'direct:main', { id: 'draft', type: 'assistant', sourceKind: 'chat', text, deliveryState: 'generated',
    extensionProposals: extensionProposals(text, card), topicId: 'desk', angleId: 'event', expectedRevision: lib.snapshot().revision, expectedContextEpoch: 'start' });
  assert.equal((await lib.recall('main', '书桌')).length, 0);
  assert.equal((await lib.acknowledgeChat('main', 'draft')).ok, true);
  assert.equal((await lib.acknowledgeChat('main', 'draft')).duplicate, true);
  assert.equal((await lib.progress('main')).length, 1);
  assert.equal((await lib.recall('main', '书桌')).filter(r => r.kind === 'extension').length, 1);
  await lib.stage('main', [{ id: 'late', text }]);
  const row = (await lib.recall('main', '书桌'))[0]; await lib.editMemory('main', row.id);
  await assert.rejects(lib.event(actor.id, 'direct:main', { id: 'late', type: 'assistant', text, deliveryState: 'displayed' }), /失效/);
}));
test('card changes are isolated; explicit revision updates and display renames preserve the same character', async () => fixture(async lib => {
  await lib.event('main', 'direct:main', { type: 'user', text: '只告诉你：我喜欢围巾。' });
  const original = lib.actor('main').characterId;
  await lib.update(undefined, d => { d.actors[0].name = '书桌旁的伙伴'; });
  assert.equal(lib.actor('main').characterId, original);
  const changed = { ...card, personality: '温柔开朗，从不喝咖啡。' };
  await lib.importCard(changed, undefined, 'main', { updateExisting: true });
  assert.equal(lib.actor('main').characterId, original); assert.ok((await lib.recall('main', '围巾')).length);
  await lib.importCard({ name: '小夏', description: '喜欢修理收音机。' });
  assert.notEqual(lib.actor('main').characterId, original); assert.equal((await lib.recall('main', '围巾')).length, 0);
  await lib.importCard(changed); assert.equal(lib.actor('main').characterId, original);
  assert.ok((await new ConversationEngine().prepare(lib, 'main', '围巾')).prompt.includes('喜欢围巾'));
}));
test('legacy migration preserves originals and separates different cards previously bound to main', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-migration-')); let lib;
  try {
    const legacy = { version: 1, revision: 1, actors: [{ id: 'main', name: '小雨', assetId: 'a', bookIds: [], overrides: {} }], assets: [{ id: 'a', card, originalBytes: Buffer.from('fixture').toString('base64') }], bindings: { main: 'main' }, rooms: [], states: {}, events: [
      { id: 'a-line', actorId: 'main', roomId: 'direct:main', cardId: 'a', type: 'user', text: '蓝色围巾', speakerKey: 'default', at: 1 },
      { id: 'b-line', actorId: 'main', roomId: 'direct:main', cardId: 'b', type: 'user', text: '不能给A看的秘密', speakerKey: 'default', at: 2 },
    ] };
    const file = join(dir, 'companion-library.json'); await writeFile(file, JSON.stringify(legacy));
    lib = new CompanionLibrary(dir); await lib.ready();
    assert.equal((await lib.recall('main', '围巾')).length, 1); assert.equal((await lib.recall('main', '秘密')).length, 0);
    assert.equal(await readFile(file, 'utf8'), JSON.stringify(legacy));
  } finally { await lib?.close(); await rm(dir, { recursive: true, force: true }); }
});
test('generation budget is shared across retries/repairs; creative topics rotate without clearing background coverage', async () => {
  await runGenerationJob('automatic', async () => {
    claimAttempt(); claimAttempt(); assert.throws(() => claimAttempt(), /budget/);
    assert.equal(generationJob().attempts, 2);
  });
  await runGenerationJob('chat', async () => { claimAttempt(); enableSearchBudget(); for (let i = 0; i < 4; i++) claimAttempt(); assert.throws(() => claimAttempt(), /budget/); });
  const memory = new StoryMemory(), entry = memory.entry('x', []); entry.used.background = true;
  for (let i = 0; i < 45; i++) { const row = memory.select(entry, [], false); assert.ok(row); memory.record(entry, row, row.text, []); }
  assert.equal(entry.used.background, true);
});
test('low-water prefetch keeps the last ready segment available while preparing the next event', async () => {
  let time = 0, calls = 0;
  const idle = new IdleChat({ now: () => time, stamp: () => 'x', random: () => .5, options: () => ({ ...DEFAULT_CHAT_OPTIONS, idleSeconds: 10 }) });
  const sources = ['我小时候在海边学会观察风向，后来一直记得那件事。', '我以前在旧书店找到一本日记，里面留着一张地图。'];
  const input = async () => ({ storyBatch: true, storySeeds: sources, requireDeliveryAck: true });
  const make = async () => { calls++; const parts = calls === 1 ? [
    '我小时候在海边学会观察风向，后来一直记得那件事。那时候总觉得海面很远，得站在那里看上好久，才能知道风会从哪边过来。我还记得那天的天气。',
    '我小时候在海边学会观察风向，后来一直记得那件事。如今想起那些海面上的旧画面，我还是觉得亲切，浪花和微风都是熟悉的样子。',
  ] : [
    '我以前在旧书店找到一本日记，里面留着一张地图。那些手写的字很细，我看了好多遍才认清楚，一个小本子也能藏住那么多事情。',
    '我以前在旧书店找到一本日记，里面留着一张地图。直到现在我也没有把那个本子丢掉，它提醒我，遇到不懂的东西，可以留下来慢慢看。',
  ]; return { ok: true, text: JSON.stringify({ segments: parts.map(text => ({ text })) }) }; };
  const first = await idle.run(input, make, undefined, { manual: true }); assert.ok(first.deliveryId, JSON.stringify(first)); await idle.acknowledge(first.deliveryId);
  time = 11000; const tail = await idle.run(input, make); assert.equal(tail.segmentIndex, 1);
  await idle.prefetch(input, make);
  assert.equal((await idle.run(input, make)).deliveryId, tail.deliveryId); assert.ok(idle.nextReady);
  await idle.acknowledge(tail.deliveryId); time += 11000;
  const next = await idle.run(input, make); assert.ok(next.text.includes('日记')); assert.equal(calls, 2);
});
test('foreground generation cancels the background network signal and the same account never overlaps', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-priority-')), previous = process.env.SP_DSH_PET_RUNTIME_FILE;
  process.env.SP_DSH_PET_RUNTIME_FILE = join(dir, 'runtime.json');
  const settings = { baseUrl: 'https://public.fixture/v1', apiKey: 'fixture' }; let entered, active = 0, maximum = 0;
  const started = new Promise(resolve => { entered = resolve; });
  try {
    const background = runGenerationJob('automatic', () => withProviderSlot(settings, AbortSignal.timeout(5000), async signal => {
      maximum = Math.max(maximum, ++active); entered();
      try { await new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }); } finally { active--; }
    }, { background: true }));
    const rejected = assert.rejects(background); await started;
    const result = await runGenerationJob('chat', () => withProviderSlot(settings, AbortSignal.timeout(1000), async () => { maximum = Math.max(maximum, ++active); active--; return 'foreground'; }));
    await rejected; assert.equal(result, 'foreground'); assert.equal(maximum, 1);
  } finally { if (previous === undefined) delete process.env.SP_DSH_PET_RUNTIME_FILE; else process.env.SP_DSH_PET_RUNTIME_FILE = previous; await rm(dir, { recursive: true, force: true }); }
});
test('identity-only questions repair an unsolicited game-service introduction before any text is shown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-focus-')), previous = process.env.SP_DSH_PET_RUNTIME_FILE;
  process.env.SP_DSH_PET_RUNTIME_FILE = join(dir, 'runtime.json'); let calls = 0, text = '';
  try {
    const fake = async () => { calls++; const content = calls === 1 ? '我是小雨，帮你看看卫戍的规则。' : '我是小雨，在旧城书店看店，闲时喜欢翻几页书。'; return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n'); };
    for await (const part of conversationStream({ protocol: 'openai-compatible', apiKey: 'fixture', baseUrl: 'https://public.fixture/v1', model: 'fixture' },
      { question: '你现在是谁？', messages: [{ role: 'user', content: '你现在是谁？' }], system: '你是小雨，书店店员。', chatOptions: DEFAULT_CHAT_OPTIONS }, AbortSignal.timeout(3000), fake)) if (part.text) text += part.text;
    assert.equal(calls, 2); assert.match(text, /旧城书店/); assert.doesNotMatch(text, /卫戍/);
  } finally { if (previous === undefined) delete process.env.SP_DSH_PET_RUNTIME_FILE; else process.env.SP_DSH_PET_RUNTIME_FILE = previous; await rm(dir, { recursive: true, force: true }); }
});
