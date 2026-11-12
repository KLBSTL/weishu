import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompanionLibrary } from '../server/companion/library.js';
import { mergeJobSnapshot, summarizeJobs } from '../server/companion/metrics.js';
import { parseSpeechBatch } from '../server/companion/batches.js';
import { sentenceParts } from '../server/companion/sentence-parts.js';
import { sessionProjection, sessionPrompt } from '../server/companion/session-context.js';
import { bufferCoverage, refillThreshold } from '../server/companion/buffer-policy.js';
import { IdleChat } from '../server/desktop/idle-chat.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';

test('model novelty skip changes the candidate without committing unspoken facts or retrying the same topic', async () => {
  const idle = new IdleChat({ now: () => 10000, stamp: () => 'one', read: () => [], random: () => .1, options: () => DEFAULT_CHAT_OPTIONS });
  const selected = [], staged = [];
  const packet = await idle.run(async () => ({ storyBatch: true, storySeeds: ['我曾经修好了邻居的收音机。', '有一年我在山里找到了清澈的小溪。'], history: [],
    onPrepared: rows => staged.push(...rows) }), async input => {
    const source = JSON.parse(input.system.split('【唯一背景证据】')[1].split('\n')[0]); selected.push(source);
    return { ok: true, text: selected.length === 1 ? '{"skipTopic":true}' : JSON.stringify({ text: source.text + '那段经历让我记得很清楚，偶尔想到时，还是觉得有些事值得慢慢去做。' }) };
  }, undefined, { manual: true });
  assert.equal(selected.length, 2); assert.notEqual(selected[0].id, selected[1].id);
  assert(staged.length); assert(!staged.some(p => p.text.includes(selected[0].text)));
  const entry = Object.values(idle.stories.load().cards)[0]; assert.equal(Object.keys(entry.used).length, 0);
  assert.equal((await idle.acknowledge(packet.deliveryId)).ok, true);
});

test('natural splitting preserves source ranges, quotes, negation and long sentences without imposing a count', () => {
  const text = '我记得她说：“这不是蓝色。如果明天还下雨，就先不要出发。”我当时想了很久。' + '这个完整的长句没有必要被机械截断'.repeat(10) + '。短收束。';
  const parts = sentenceParts(text);
  assert.equal(parts.map(p => p.text).join(''), text);
  assert(parts[0].text.includes('如果明天还下雨，就先不要出发。”'));
  assert(parts.some(p => p.text.length > 100));
  for (const p of parts) assert.equal(text.slice(p.start, p.end), p.text);
  assert.equal(sentenceParts('她说："Do not leave. Wait here."然后我继续看书。', { preferredMinChars: 1, preferredMaxChars: 10 })[0].text, '她说："Do not leave. Wait here."');
  assert.throws(() => sentenceParts('我记得她说：“还没讲完。'), /未闭合|完整句末/);
  const batch = parseSpeechBatch(JSON.stringify({ text: '我只想安静地想一会儿。' }), { selected: { id: 'one' }, grounded: false });
  assert.equal(batch.underTarget, true); assert.equal(batch.segments.length, 1);
});

test('session projection includes only acknowledged same-scope speech and keeps full negation', () => {
  const scope = { characterId: 'one', roomId: 'direct:main', actorId: 'main', historyEpoch: 'epoch-1' };
  const event = { id: 'heard', characterId: 'one', roomId: 'direct:main', type: 'assistant', deliveryState: 'displayed', text: '如果明天下雨，就不要出门。' };
  const events = [event, { ...event, id: 'draft', deliveryState: 'generated' }, { ...event, id: 'other', characterId: 'two' },
    { ...event, id: 'forgotten', forgotten: true }, { ...event, id: 'private', audience: ['other'] }];
  const p = sessionProjection(events, scope);
  assert.deepEqual(p.recent.map(r => r.id), ['heard']); assert.equal(p.recent[0].text, event.text);
  assert.notEqual(p.id, sessionProjection([], { ...scope, historyEpoch: 'epoch-2' }).id);
  const prompt = sessionPrompt(p, [{ topicId: 'reserved' }]);
  assert.match(prompt, /尚未展示/); assert.doesNotMatch(prompt, /"id":"draft"/);
});

test('coverage follows due dates and expiry; slow replenishment raises the refill threshold', () => {
  const a = { index: 0, batch: { segments: [1, 2, 3, 4] }, notBefore: 10000, expires: 35000 };
  assert.deepEqual(bufferCoverage([a], 0, 10000), { coverageMs: 40000, segments: 3 });
  assert.equal(bufferCoverage([a], 0, 30000).segments, 1);
  const samples = Array.from({ length: 5 }, () => ({ totalMs: 180000, serviceMs: 20000 }));
  assert.equal(refillThreshold(samples), 195000);
  assert.equal(refillThreshold(samples, 250000), 285000);
});

test('retry snapshots survive SQLite restart without replacing slow attempts or double-counting usage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-metrics-')); let lib = new CompanionLibrary(dir);
  try {
    await lib.ready();
    const first = { taskId: 'same-job', startedAt: 1000, elapsedMs: 48000, source: 'batch', status: 'failed', contextMs: 400,
      scopes: [{ id: 'scope-1', elapsedMs: 48000 }], httpAttempts: [{ id: 'http-1', status: 'failed', httpStatus: 429, retryAfterMs: 30000, outputTokens: null }] };
    const second = { taskId: 'same-job', startedAt: 49000, elapsedMs: 226, status: 'generated',
      scopes: [{ id: 'scope-2', elapsedMs: 226 }], httpAttempts: [{ id: 'http-2', status: 'completed', outputTokens: 200 }] };
    for (const row of [first, second, second]) await lib.store.call('job', row);
    await lib.close(); lib = new CompanionLibrary(dir); await lib.ready();
    const [row] = await lib.store.call('jobs');
    assert.equal(row.startedAt, 1000); assert.equal(row.elapsedMs, 48000); assert.equal(row.status, 'generated');
    assert.equal(row.scopes.length, 2); assert.equal(row.httpAttempts.length, 2); assert.equal(row.outputTokens, null);
    assert.equal(summarizeJobs([row])[0].p50Ms, 48000, 'context is already included in v2 elapsed');
    const finalized = mergeJobSnapshot(row, { taskId: row.taskId, status: 'ready', elapsedMs: 49000,
      events: [{ id: 'validation-1', stage: 'validated', at: 50000 }] });
    assert.equal(finalized.httpAttempts[0].retryAfterMs, 30000); assert.equal(finalized.events.length, 1);
  } finally { await lib.close(); await rm(dir, { recursive: true, force: true }); }
});

test('combined delivery consumes consecutive drafts atomically and retains one actual displayed message across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-combined-')); let lib = new CompanionLibrary(dir);
  try {
    await lib.importCard({ name: '小林', description: '我喜欢读书。' }); const actor = lib.actor();
    const parts = [{ id: 'batch:0', index: 0, text: '如果明天下雨，我就留在屋里看书。' }, { id: 'batch:1', index: 1, text: '不用赶时间的时候，我很喜欢慢慢读。' }];
    const batch = { id: 'batch', segments: parts }, plan = { characterId: actor.characterId };
    await lib.stage('main', parts.map(p => ({ ...p, batch, plan, expires: Date.now() + 60000 })));
    const event = { id: parts[0].id, consumedIds: parts.map(p => p.id), type: 'assistant', deliveryState: 'displayed', topicId: 'reading',
      text: parts.map(p => p.text).join(''), topicFinal: true };
    await assert.rejects(lib.event(actor.id, 'direct:' + actor.id, { ...event, text: '改写过的内容。' }), /不一致/);
    assert.equal((await lib.store.call('pending-deliveries', { characterId: actor.characterId })).length, 2);
    await lib.event(actor.id, 'direct:' + actor.id, event);
    assert.equal((await lib.event(actor.id, 'direct:' + actor.id, event)).result.duplicate, true);
    await lib.close(); lib = new CompanionLibrary(dir); await lib.ready();
    assert.equal((await lib.store.call('pending-deliveries', { characterId: actor.characterId })).length, 0);
    const ledger = await lib.store.call('story-ledger', { characterId: actor.characterId });
    assert.deepEqual(ledger.progress.reading.ids, parts.map(p => p.id));
    const timeline = await lib.store.call('lore-context', { characterId: actor.characterId, roomId: 'direct:' + actor.id });
    assert.equal(timeline.messages.length, 1); assert.equal(timeline.messages[0].text, event.text);
    const memories = await lib.store.call('recall', { characterId: actor.characterId, roomId: 'direct:' + actor.id, query: '', limit: 20 });
    await lib.editMemory('main', memories.find(m => m.sourceId === event.id).id, {});
    assert.equal((await lib.store.call('lore-context', { characterId: actor.characterId, roomId: 'direct:' + actor.id })).messages.length, 0);
    assert.equal((await lib.store.call('story-ledger', { characterId: actor.characterId })).progress.reading, undefined);
  } finally { await lib.close(); await rm(dir, { recursive: true, force: true }); }
});
