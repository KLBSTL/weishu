import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import { compileCard } from '../server/companion/materials.js';
import { evaluateLore, assembleLore } from '../server/companion/lore.js';
import { createPlan, planDraw } from '../server/companion/plan.js';
import { defaultCover, exportCardPng, pngChunks, crc32 } from '../server/companion/card-png.js';
import { currentDocument } from '../server/companion/card-export.js';
import { parsePersona } from '../server/desktop/persona.js';
import { CompanionLibrary } from '../server/companion/library.js';
import { ConversationEngine } from '../server/companion/engine.js';
import { knowledgeProblem } from '../server/companion/knowledge.js';
import { extendedSchema } from '../server/companion/persistence.js';
import { inspectCharx } from '../server/companion/charx.js';
import { StoryMemory } from '../server/desktop/idle-stories.js';
import { IdleChat } from '../server/desktop/idle-chat.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';
import { summarizeJobs } from '../server/companion/metrics.js';

const card = entries => ({ name: '小雨', description: '我在旧城书店工作。', character_book: { recursive_scanning: true, entries } });
const entry = (id, content, more = {}) => ({ id, comment: id, content, keys: [id], enabled: true, ...more });
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'companion-rounds-')), lib = new CompanionLibrary(dir);
  try { await lib.importCard(card([])); await run(lib, dir); }
  finally { await lib.close(); await rm(dir, { recursive: true, force: true }); }
}

test('lore probability is fixed per plan, zero never activates, and budget selection differs from presentation order', async () => {
  const c = compileCard(card([entry('half', '这是一段随机背景。', { constant: true, probability: 50 }), entry('zero', '永不出现的背景。', { constant: true, probability: 0 })]));
  const id = c.lore[0].id, p = createPlan({ id: 'same' }); p.decisions['lore:' + id] = .75;
  assert.equal((await evaluateLore(c, { plan: p })).selected.length, 0);
  assert.equal((await evaluateLore(c, { plan: p })).selected.length, 0);
  p.decisions['lore:' + id] = .25; assert.equal((await evaluateLore(c, { plan: p })).selected.length, 1);
  assert.equal(planDraw(p, 'other'), planDraw(p, 'other'));
  const ordered = compileCard(card([entry('low', '低优先级资料。', { constant: true, insertion_order: 1 }), entry('high', '高优先级资料。', { constant: true, insertion_order: 100 })]));
  assert.deepEqual((await evaluateLore(ordered, { maxChars: 9 })).selected.map(r => r.title), ['high']);
  assert.deepEqual((await evaluateLore(ordered)).selected.map(r => r.title), ['low', 'high']);
});

test('lore uses bounded history, four selective logics, recursion guards and real message positions', async () => {
  const c = compileCard(card([entry('码头', '码头线索指向白塔。'), entry('白塔', '白塔与码头互相关联。'), entry('秘密', '秘密只在另一个条件满足时出现。', { secondary_keys: ['雨天'], selective: true, extensions: { selectiveLogic: 3 } })]));
  const r = await evaluateLore(c, { question: '继续', history: [{ role: 'user', content: '码头' }] });
  assert.deepEqual(new Set(r.selected.map(x => x.title)), new Set(['码头', '白塔']));
  assert.equal(r.selected.length, 2);
  assert.ok(!(await evaluateLore(c, { question: '秘密' })).selected.some(x => x.title === '秘密'));
  assert.ok((await evaluateLore(c, { question: '秘密，雨天' })).selected.some(x => x.title === '秘密'));
  const out = assembleLore([{ role: 'system', content: '人物核心' }, { role: 'user', content: '你好' }], [{ text: '前置资料', position: 'before' }, { text: '后置资料', position: 'after' }, { text: '近消息资料', position: 'depth', depth: 0, role: 'system' }]);
  assert.equal(out[0].content, '前置资料\n人物核心\n后置资料'); assert.match(out.at(-1).content, /近消息资料/);
  const active = compileCard(card([entry('test', '筛选资料。', { secondary_keys: ['A', 'B'], selective: true })]));
  for (const [logic, query, pass] of [[0, 'test A', true], [3, 'test A', false], [2, 'test', true], [1, 'test A B', false]]) {
    active.lore[0].rule.extensions = { selectiveLogic: logic }; assert.equal((await evaluateLore(active, { question: query })).selected.length > 0, pass);
  }
});

test('timed lore does not refresh sticky duration; preview has no effects; proactive obeys book permission', async () => {
  const c = compileCard(card([entry('童年', '我小时候在海边捡过贝壳。', { extensions: { sticky: 2, cooldown: 2 } })]));
  const first = await evaluateLore(c, { question: '童年', messageCount: 0 }), id = c.lore[0].id;
  const state = first.proposed;
  const sticky = await evaluateLore(c, { question: '别的话', state, messageCount: 1 });
  assert.equal(sticky.selected.length, 1); assert.equal(sticky.proposed[id].stickyUntil, first.proposed[id].stickyUntil);
  assert.equal((await evaluateLore(c, { question: '童年', state, messageCount: 3 })).selected.length, 0);
  assert.equal((await evaluateLore(c, { question: '童年', state, messageCount: 5 })).selected.length, 1);
  assert.deepEqual((await evaluateLore(c, { question: '童年', preview: true })).proposed, {});
  assert.equal((await evaluateLore(c, { kind: 'automatic', sourceIds: [id] })).selected.length, 1);
  c.lore[0].proactive = false; assert.equal((await evaluateLore(c, { kind: 'automatic', sourceIds: [id] })).selected.length, 0);
});

test('malicious regex cannot block the host and invalid regex is diagnosed', async () => {
  const c = compileCard(card([entry('/(a+)+$/', '这条资料不应阻塞。')]));
  const started = Date.now(), result = await evaluateLore(c, { question: 'a'.repeat(6000) + '!' });
  assert.ok(Date.now() - started < 2000); assert.equal(result.selected.length, 0); assert.ok(result.diagnostics.some(r => r.reason === 'regex-timeout'));
});

test('PNG export updates both card chunks, preserves image bytes, rejects corruption and keeps original document fields', async () => fixture(async lib => {
  const source = { spec: 'chara_card_v3', spec_version: '3.0', customEnvelope: 9, data: { name: '小雨', description: '我喜欢整理旧书。', extensions: { unknown: { preserve: true } } } };
  const image = defaultCover(), png = exportCardPng(source, image);
  assert.deepEqual(pngChunks(image).find(c => c.type === 'IDAT').raw, pngChunks(png).find(c => c.type === 'IDAT').raw);
  assert.equal(parsePersona(png).name, '小雨');
  await lib.importCard(parsePersona(png), png);
  await lib.update(undefined, data => { data.actors[0].overrides.personality = '开朗自然'; });
  const exported = currentDocument(lib, 'main').document;
  assert.equal(exported.customEnvelope, 9); assert.equal(exported.data.extensions.unknown.preserve, true); assert.equal(exported.data.personality, '开朗自然');
  const edited = exportCardPng(exported, png), chunks = pngChunks(edited).filter(c => c.type === 'tEXt');
  assert.equal(chunks.length, 2);
  for (const c of chunks) { const at = c.data.indexOf(0); assert.equal(JSON.parse(Buffer.from(c.data.subarray(at + 1).toString(), 'base64').toString()).data.personality, '开朗自然'); }
  const bad = Buffer.from(png); bad[20] ^= 1; assert.throws(() => parsePersona(bad), /校验/);
}));

test('ambiguous or conflicting memory waits for confirmation and explicit correction remains traceable', async () => fixture(async (lib, dir) => {
  await lib.event('main', 'direct:main', { id: 'blue', type: 'user', text: '我喜欢蓝色围巾。' });
  await lib.event('main', 'direct:main', { id: 'red', type: 'user', text: '我喜欢红色围巾。' });
  const characterId = lib.actor().characterId;
  const pending = await lib.store.call('memory-pending', { characterId }); assert.equal(pending.length, 1);
  assert.ok(!(await lib.recall('main', '围巾')).some(r => r.text.includes('红色')));
  await lib.store.call('memory-decide', { characterId, id: pending[0].id, accept: true });
  assert.ok((await lib.recall('main', '围巾')).every(r => !r.text.includes('蓝色')));
  assert.ok((await lib.store.call('memory-changes', { characterId })).some(r => r.action === 'confirmed'));
  const db = new DatabaseSync(join(dir, 'companion.sqlite'), { readOnly: true }); try { assert.equal(db.prepare('PRAGMA user_version').get().user_version, 5); } finally { db.close(); }
  assert.match(knowledgeProblem('那本地图册我一直留着。', card([]), '小时候我在日记里记下了海边的事情。'), /entity-drift/);
}));

test('research covers later card material, persists batches and only reprocesses edited pieces', async () => fixture(async lib => {
  const original = { name: '小雨', description: Array.from({ length: 40 }, (_, i) => '# 往事' + i + '\n我以前在书店整理过第' + i + '批旧书，每一次都让我学到了不同的事。').join('\n\n') };
  await lib.importCard(original);
  let calls = 0;
  const deps = { getInput: async () => ({ system: '' }), generate: async input => { calls++; return { ok: true, text: JSON.stringify(JSON.parse(input.userText).map(f => ({ factId: f.factId, quote: f.text.slice(0, 15), group: f.factId }))) }; } };
  const engine = new ConversationEngine(), first = await engine.research(lib, 'main', deps);
  assert.equal(first.count, 40); assert.equal(calls, 3);
  assert.equal((await engine.research(lib, 'main', deps)).cached, true); assert.equal(calls, 3);
  await lib.importCard({ ...original, description: original.description.replace('第39批', '第最后一批') }, undefined, 'main', { updateExisting: true });
  const next = await engine.research(lib, 'main', deps); assert.equal(next.count, 40); assert.equal(calls, 4);
}));

test('enhanced lore rolls once per whole entry and separate book proactive switches never affect direct answers', async () => fixture(async lib => {
  await lib.importCard({ ...card([entry('日记', '# 早年\n我小时候在海边写过日记。\n\n# 后来\n那本日记一直放在我的书架上。', { constant: true, probability: 50 })]) });
  await lib.update(undefined, d => {
    const actor = d.actors[0]; actor.bookProactive = { embedded: false, extra: true }; actor.bookIds = ['extra'];
    d.assets.push({ id: 'extra', kind: 'lorebook', name: '另一册', book: { entries: [entry('花园', '我在院子里种过薄荷。', { constant: true })] } });
  });
  const c = compileCard(lib.card('main')); assert.equal(c.lore.length, 2); assert.equal(c.lore[0].unitIds.length, 2);
  const p = createPlan({ id: 'entry-once' }); p.decisions['lore:' + c.lore[0].id] = .25;
  assert.equal((await evaluateLore(c, { plan: p, kind: 'automatic', focus: '日记' })).selected.length, 1);
  assert.equal((await evaluateLore(c, { plan: p, question: '日记' })).selected.length, 2);
  assert.equal(Object.keys(p.decisions).filter(key => key.startsWith('lore:')).length, 1);
  c.lore[1].proactive = false; assert.equal((await evaluateLore(c, { plan: p, kind: 'manual', focus: '花园' })).selected.length, 0);
}));

test('overlapping inclusion groups exclude conflicts and scoring prefers more matched keys', async () => {
  const c = compileCard(card([entry('weak', '普通信息。', { keys: ['A'], extensions: { group: 'one', useGroupScoring: true } }),
    entry('strong', '详细信息。', { keys: ['A', 'B'], extensions: { group: 'one,two', useGroupScoring: true } }),
    entry('other', '另一个分组信息。', { keys: ['A'], extensions: { group: 'two', useGroupScoring: true } })]));
  assert.deepEqual((await evaluateLore(c, { question: 'A B' })).selected.map(r => r.title), ['strong']);
  const bypass = compileCard(card([entry('zero', '显式关闭概率控制的资料。', { constant: true, probability: 0, extensions: { useProbability: false } })]));
  assert.equal((await evaluateLore(bypass)).selected.length, 1);
});

test('plot lore cannot disclose another character private facts or inherit that person age', async () => {
  const plot = { name: '双人剧情', extensions: { ark_companion: { sceneCard: true, ruleProfile: 'enhanced', speaker: { name: '小雨', description: '小雨今年20岁，在书店工作。' } } },
    character_book: { entries: [entry('秘密', '小夏的秘密：小夏今年80岁，在外地继承了房子。', { constant: true, extensions: { ark_companion: { subject: '小夏' } } }),
      entry('海边', '小雨小时候住在海边。', { constant: true, extensions: { ark_companion: { subject: '小雨' } } })] } };
  const c = compileCard(plot); assert.ok(!(await evaluateLore(c)).selected.some(row => row.text.includes('继承')));
  assert.match(knowledgeProblem('我今年80岁。', plot), /age/); assert.equal(knowledgeProblem('我今年20岁。', plot), null);
  assert.match(knowledgeProblem('我继承了书店。', { name: '小雨', description: '如果我继承了书店，就会留在这里。' }), /major/);
});

test('SQLite upgrade preserves old messages and rule policy, is idempotent, and rolls back a failed migration', async () => fixture(async (lib, dir) => {
  await lib.event('main', 'direct:main', { id: 'before-upgrade', type: 'user', text: '我喜欢蓝色围巾。' });
  const actorId = lib.actor().characterId; await lib.close();
  const db = new DatabaseSync(join(dir, 'companion.sqlite'));
  for (const table of ['entity_catalog', 'source_map', 'research_pieces', 'lore_state', 'generation_plans', 'memory_changes', 'editor_drafts', 'story_ledger']) db.exec('DROP TABLE ' + table);
  db.exec('PRAGMA user_version=2'); db.close();
  const restarted = new CompanionLibrary(dir);
  try {
    await restarted.ready(); assert.equal(restarted.actor().characterId, actorId); assert.equal((await restarted.recall('main', '围巾')).length, 1);
    await restarted.ready(); assert.equal((await restarted.store.call('history-page', { characterId: actorId, roomId: 'direct:main', cursor: null })).messages.length, 1);
  } finally { await restarted.close(); }
  const fault = new DatabaseSync(':memory:'); fault.exec('PRAGMA user_version=2');
  try {
    assert.throws(() => extendedSchema({ exec(sql) { fault.exec(sql.replace('CREATE TABLE IF NOT EXISTS lore_state', 'INVALID TABLE lore_state')); } }));
    assert.equal(fault.prepare('PRAGMA user_version').get().user_version, 2); assert.equal(fault.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 0);
  } finally { fault.close(); }
}));

test('legacy JSON cards keep legacy rules while fresh imports and explicit reimports retain the chosen policy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-policy-')); let lib;
  try {
    await writeFile(join(dir, 'companion-library.json'), JSON.stringify({ version: 1, revision: 0, actors: [{ id: 'main', name: '小雨', assetId: 'a', overrides: {}, bookIds: [] }],
      assets: [{ id: 'a', kind: 'card', card: card([]) }], bindings: { main: 'main' }, rooms: [], states: {}, events: [], userPersona: {}, preset: {} }));
    lib = new CompanionLibrary(dir); await lib.ready(); assert.equal(lib.actor().ruleProfile || 'legacy', 'legacy');
    await lib.importCard({ name: '小夏', description: '我喜欢修理收音机。' }); assert.equal(lib.actor().ruleProfile, 'enhanced');
    await lib.update(undefined, d => { d.actors[0].ruleProfile = 'legacy'; });
    await lib.importCard({ name: '小夏', description: '我喜欢修理旧收音机。' }, undefined, 'main', { updateExisting: true }); assert.equal(lib.actor().ruleProfile, 'legacy');
    await lib.importCard(card([])); assert.equal(lib.actor().ruleProfile, 'enhanced');
    await lib.importCard({ name: '小夏', description: '我喜欢修理旧收音机。' }); assert.equal(lib.actor().ruleProfile, 'legacy');
  } finally { await lib?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('display receipts survive restart and commit lore and story progress atomically exactly once', async () => fixture(async (lib, dir) => {
  const actor = lib.actor(), rev = lib.snapshot().revision, epoch = lib.contextEpoch(actor.id), characterId = actor.characterId;
  const plan = createPlan({ characterId, cardRevision: rev, memoryEpoch: epoch });
  const packet = { id: 'first', text: '我小时候在海边写过日记。', topicId: 'sea', topicFinal: false, origin: 'local',
    plan, expires: Date.now() + 180000, loreProposal: { sea: { sticky: 2, cooldown: 3, revision: 'one' } } };
  await lib.stage('main', [packet]); assert.deepEqual((await lib.store.call('story-ledger', { characterId })).progress, {});
  await lib.close(); const restarted = new CompanionLibrary(dir);
  try {
    await restarted.ready(); const restored = await restarted.store.call('pending-deliveries', { characterId }); assert.equal(restored[0].id, 'first');
    await restarted.event(actor.id, 'direct:main', { ...packet, type: 'assistant', sourceKind: 'idle-local', deliveryState: 'displayed', expectedRevision: rev, expectedContextEpoch: epoch });
    const timed = (await restarted.store.call('lore-context', { characterId, roomId: 'direct:main' })).state.sea;
    await restarted.event(actor.id, 'direct:main', { ...packet, type: 'assistant', deliveryState: 'displayed' });
    const ledger = await restarted.store.call('story-ledger', { characterId }); assert.deepEqual(ledger.progress.sea.ids, ['first']); assert.equal(ledger.progress.sea.status, 'paused'); assert.equal(ledger.used.sea, undefined);
    assert.deepEqual((await restarted.store.call('lore-context', { characterId, roomId: 'direct:main' })).state.sea, timed);
    assert.equal((await restarted.store.call('pending-deliveries', { characterId })).length, 0);
    assert.equal((await restarted.store.call('display-metrics', { characterId, id: 'first', displayMs: 230, renderedAt: Date.now() })).ok, true);
    await restarted.stage('main', [{ ...packet, id: 'stale' }]); await restarted.editMemory('main', (await restarted.recall('main', '日记'))[0].id);
    await assert.rejects(restarted.event(actor.id, 'direct:main', { ...packet, id: 'stale', type: 'assistant', deliveryState: 'displayed' }), /失效/);
  } finally { await restarted.close(); }
}));

test('paused information points resume rather than mark the entire story completed; pending tails require their predecessor', () => {
  const memory = new StoryMemory(), catalog = [{ id: 'sea', topic: 'sea', text: '我在海边写过日记，后来把它留在书店。' }], e = memory.entry('x', catalog);
  memory.recordPart(e, catalog[0], '我以前在海边写日记。', { id: 'part-one', final: false });
  assert.equal(memory.select(e, catalog, true).topic, 'sea'); assert.equal(e.progress.sea.completed, false);
  const input = { storyBatch: true, storyCard: card([]), storyLedger: { used: {}, progress: { sea: { ids: ['part-one'], heard: ['我以前在海边写日记。'], completed: false } }, recent: [] }, history: [], cacheEpoch: 'epoch', plan: { cardRevision: 3, characterId: 'person' }, personaKey: 'person' };
  const row = { id: 'part-two', topicId: 'sea', index: 1, text: '后来我把日记留在书店。', selected: catalog[0],
    batch: { id: 'batch', segments: [{ id: 'part-one' }, { id: 'part-two' }] }, plan: { memoryEpoch: 'epoch', cardRevision: 3, characterId: 'person' }, expires: Date.now() + 180000 };
  const idle = new IdleChat({ stamp: () => 'same', options: () => DEFAULT_CHAT_OPTIONS }); idle.restore(input, [row]); assert.equal(idle.ready.id, 'part-two');
  const missing = new IdleChat({ stamp: () => 'same' }); missing.restore({ ...input, storyLedger: { used: {}, progress: {}, recent: [] } }, [row]); assert.equal(missing.ready, null);
});

test('research resumes saved batches after restart; explicit negative corrections and additive likes keep their meaning', async () => fixture(async (lib, dir) => {
  await lib.event('main', 'direct:main', { type: 'user', text: '我喜欢咖啡。' });
  await lib.event('main', 'direct:main', { type: 'user', text: '我现在不再喜欢咖啡。' });
  assert.ok((await lib.recall('main', '咖啡')).every(r => r.text.includes('不再')));
  await lib.event('main', 'direct:main', { type: 'user', text: '我喜欢蓝色围巾。' }); await lib.event('main', 'direct:main', { type: 'user', text: '我也喜欢红色围巾。' });
  assert.equal((await lib.recall('main', '围巾')).filter(r => r.kind === 'user_statement').length, 2);
  const engine = new ConversationEngine(), characterId = lib.actor().characterId, profile = await engine.prepare(lib, 'main');
  const facts = profile.knowledge.facts; assert.ok(facts.length);
  await engine.research(lib, 'main', { getInput: async () => ({}), generate: async input => ({ ok: true, text: JSON.stringify(JSON.parse(input.userText).map(f => ({ factId: f.factId, quote: f.text.slice(0, 8), group: 'one' }))) }) });
  const resumed = new CompanionLibrary(dir); try { await resumed.ready(); const status = await new ConversationEngine().researchStatus(resumed, 'main'); assert.equal(status.done, status.total); assert.ok(status.done > 0); assert.equal(resumed.actor().characterId, characterId); } finally { await resumed.close(); }
}));

function zip(files) {
  let at = 0; const locals = [], central = [];
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), path = Buffer.from(name), local = Buffer.alloc(30), directory = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(path.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt32LE(crc32(data), 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(path.length, 28); directory.writeUInt32LE(at, 42);
    locals.push(local, path, data); central.push(directory, path); at += local.length + path.length + data.length;
  }
  const end = Buffer.alloc(22), names = Object.keys(files); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12); end.writeUInt32LE(at, 16); return Buffer.concat([...locals, ...central, end]);
}
test('CHARX inspects manifests only, reports missing and unsafe assets, and rejects corrupt metadata', () => {
  const data = { data: { name: '公开样例', assets: [{ name: '封面', uri: 'embed://images/cover.png' }, { name: '缺少', uri: 'embed://missing.png' }, { name: '外部', uri: 'https://example.org/a.png' }] } };
  const file = zip({ 'card.json': JSON.stringify(data), 'images/cover.png': 'not-executed', '../escape.js': 'throw new Error()' }), out = inspectCharx(file);
  assert.equal(out.supported, false); assert.deepEqual(out.assets.map(a => a.available), [true, false, null]); assert.equal(out.entries.at(-1).unsafe, true);
  const bad = Buffer.from(file); bad[30 + 'card.json'.length] ^= 1; assert.throws(() => inspectCharx(bad), /校验/);
  assert.throws(() => inspectCharx(Buffer.alloc(8 * 1024 * 1024 + 1)), /8MB/);
});

test('compressed PNG metadata is bounded, uses the same full document on export, and leaves no stale card chunks', async () => fixture(async lib => {
  const payload = Buffer.from(JSON.stringify({ spec: 'chara_card_v3', custom: 'keep-envelope', data: { name: '小雨', description: '我在旧城书店工作。' } })).toString('base64');
  const encoded = Buffer.concat([Buffer.from('ccv3\0\0', 'ascii'), deflateSync(payload)]), extra = Buffer.alloc(encoded.length + 12);
  extra.writeUInt32BE(encoded.length); extra.write('zTXt', 4); encoded.copy(extra, 8); extra.writeUInt32BE(crc32(extra.subarray(4, extra.length - 4)), extra.length - 4);
  const parts = pngChunks(defaultCover()), file = Buffer.concat([defaultCover().subarray(0, 8), ...parts.slice(0, -1).map(c => c.raw), extra, parts.at(-1).raw]);
  assert.equal(parsePersona(file).name, '小雨'); await lib.importCard(parsePersona(file), file);
  assert.equal(currentDocument(lib, 'main').document.custom, 'keep-envelope');
  const exported = exportCardPng(currentDocument(lib, 'main').document, file); assert.equal(pngChunks(exported).filter(c => c.type === 'zTXt').length, 0); assert.equal(pngChunks(exported).filter(c => c.type === 'tEXt').length, 2);
}));

test('pausing research keeps committed batches and a later resume only requests unfinished pieces', async () => fixture(async lib => {
  await lib.importCard({ name: '小雨', description: Array.from({ length: 40 }, (_, i) => '# 往事' + i + '\n我以前在书店整理过第' + i + '批旧书，每次都有不一样的发现。').join('\n\n') });
  const engine = new ConversationEngine(); let calls = 0;
  const deps = { getInput: async () => ({}), generate: async input => {
    if (++calls === 2) engine.stopResearch(lib, 'main');
    return { ok: true, text: JSON.stringify(JSON.parse(input.userText).map(f => ({ factId: f.factId, quote: f.text.slice(0, 12), group: f.factId }))) };
  } };
  await engine.startResearch(lib, 'main', deps);
  let status; const end = Date.now() + 10000;
  do { await new Promise(resolve => setTimeout(resolve, 10)); status = await engine.researchStatus(lib, 'main'); } while (status.running && Date.now() < end);
  assert.equal(status.running, false); assert.equal(status.paused, true); assert.equal(status.done, 16);
  assert.equal((await engine.research(lib, 'main', { ...deps, generate: async input => { calls++; return { ok: true, text: JSON.stringify(JSON.parse(input.userText).map(f => ({ factId: f.factId, quote: f.text.slice(0, 12), group: f.factId }))) }; } })).count, 40);
  assert.equal(calls, 4);
}));

test('one generation plan cannot refresh lore timers for each segment, and hypothetical memories stay pending', async () => fixture(async lib => {
  const characterId = lib.actor().characterId, proposal = { sea: { sticky: 2, cooldown: 3, revision: 'one' } };
  for (const id of ['first', 'second']) await lib.stage('main', [{ id, taskId: 'one-plan', loreProposal: proposal }]);
  await lib.event('main', 'direct:main', { id: 'first', type: 'assistant', text: '我小时候在海边写日记。', deliveryState: 'displayed' });
  const first = (await lib.store.call('lore-context', { characterId, roomId: 'direct:main' })).state.sea;
  await lib.event('main', 'direct:main', { id: 'second', type: 'assistant', text: '后来我把日记带回了书店。', deliveryState: 'displayed' });
  assert.deepEqual((await lib.store.call('lore-context', { characterId, roomId: 'direct:main' })).state.sea, first);
  await lib.event('main', 'direct:main', { type: 'user', text: '如果我喜欢绿色围巾会怎么样？' });
  assert.equal((await lib.recall('main', '绿色')).length, 0); assert.equal((await lib.store.call('memory-pending', { characterId })).length, 1);
}));

test('latency summaries separate sources, exclude unknown durations and report missing usage without guessing tokens', () => {
  const groups = summarizeJobs([{ source: 'batch', elapsedMs: 100, contextMs: 20, attempts: 1, status: 'displayed', outputTokens: null },
    { source: 'batch', elapsedMs: 200, attempts: 2, status: 'timeout', outputTokens: 50 }, { source: 'local-opening', status: 'ready', attempts: 0 }]);
  assert.equal(groups[0].p50Ms, 120); assert.equal(groups[0].p95Ms, 200); assert.equal(groups[0].usageMissing, 1); assert.equal(groups[0].timedOut, 1);
  assert.equal(groups[1].p50Ms, null); assert.equal(groups[1].measured, 0); assert.equal(groups[1].usageMissing, 0);
});

test('a stopped database worker releases its waiters and the next call recovers the existing database', async () => fixture(async lib => {
  await lib.event('main', 'direct:main', { type: 'user', text: '我喜欢白色本子。' });
  const request = lib.store.call('lore-context', { characterId: lib.actor().characterId, roomId: 'direct:main' }).then(() => 'completed', () => 'stopped');
  await lib.store.worker.terminate(); let timer;
  try { assert.notEqual(await Promise.race([request, new Promise(resolve => { timer = setTimeout(() => resolve('hung'), 1500); })]), 'hung'); }
  finally { clearTimeout(timer); }
  assert.ok((await lib.recall('main', '白色')).some(row => row.text.includes('白色本子')));
}));
