import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdleCache, localOpeningLines } from '../server/desktop/idle-cache.js';
import { IdleChat } from '../server/desktop/idle-chat.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';

test('manual playback prefers a different topic while a retry retains the issued packet and automatic playback continues it', async () => {
  const idle = new IdleChat({ now: () => 9000, stamp: () => 'same', options: () => DEFAULT_CHAT_OPTIONS,
    stories: { recordPart() {} }, save() {} });
  function queued(topic, index) {
    const segments = [0, 1, 2].map(i => ({ id: topic + i, index: i, text: (topic + '的故事。').repeat(14) }));
    return { ...segments[index], selected: { topic, id: topic }, batch: { id: topic, segments },
      stamp: 'same', expires: 100000, entry: { recent: [] }, notBefore: 0 };
  }
  idle.ready = queued('海边', 1); idle.nextReady = queued('龙门', 0);
  const run = manual => idle.run(async () => null, async () => assert.fail('prepared topics need no generation'), undefined, { manual });
  const first = await run(true);
  assert.equal(first.sourceId, '龙门');
  assert.equal(first.requestedAction, 'change-topic');
  assert.equal((await run(true)).deliveryId, first.deliveryId);
  assert.equal((await idle.acknowledge(first.deliveryId)).ok, true);
  idle.ready.notBefore = 0;
  const automatic = await run(false);
  assert.equal(automatic.sourceId, '龙门');
  assert.equal(automatic.segmentIndex, 1);
  assert.equal((await run(true)).deliveryId, automatic.deliveryId);
  assert.equal((await idle.acknowledge(automatic.deliveryId)).ok, true);
  assert.equal((await run(true)).sourceId, '海边');
});

test('unchanged warm polls avoid rewriting disk and an external cache edit invalidates the in-memory view', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'idle-cache-poll-'));
  try {
    const file = join(dir, 'cache.json'), cache = new IdleCache(file, () => 1000), input = { companionPetId: 'main', storyCard: { name: '小雨' } };
    cache.warm(input); const before = await stat(file);
    for (let i = 0; i < 20; i++) cache.warm(input);
    assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
    const data = JSON.parse(await readFile(file, 'utf8')); data.heard = { external: ['外部写入的已讲记录'] };
    await writeFile(file, JSON.stringify(data)); assert.deepEqual(cache.read().heard.external, ['外部写入的已讲记录']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('local openings keep direct personal speech and exclude fake battles, user quotes and stage directions', () => {
  const card = { name: '小雨', description: '我喜欢在安静的时候泡杯热茶，慢慢坐上一会儿。',
    mes_example: '{{char}}: 我的手停在半空。\n{{char}}: 我这轮买到了三个干员，还击杀了五个怪。\n{{char}}: 你上次说过你喜欢蓝色。' };
  const lines = localOpeningLines(card);
  assert.ok(lines.some(line => line.includes('热茶')));
  assert.ok(lines.every(line => !/半空|这轮|击杀|上次说过/u.test(line)));
});

test('private startup outbox survives restart, prioritizes unshown model text and separates card/context scopes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'idle-cache-'));
  try {
    const file = join(dir, 'cache.json'), cache = new IdleCache(file);
    const input = { companionPetId: 'main', storyCard: { name: '小雨' }, cacheEpoch: 'turn-1' };
    const first = cache.warm(input); assert.equal(first.length, 3);
    assert.deepEqual(new IdleCache(file).warm(input).map(row => row.id), first.map(row => row.id));
    cache.consume(input, first[0].id, first[0].text);
    assert.ok(!cache.warm(input).some(row => row.text === first[0].text));
    cache.remember(input, { grounded: true, segments: [{ id: 'model-1', text: '我小时候喜欢在海边听父亲讲故事。' }, { id: 'model-2', text: '现在想起来，记得最清楚的还是那阵海风。' }] }, { topic: 'seaside' });
    assert.equal(new IdleCache(file).warm(input)[0].origin, 'model-cache');
    assert.ok(!cache.warm({ ...input, cacheEpoch: 'turn-2' }).some(row => row.id === 'model-1'));
    assert.ok(!cache.warm({ ...input, companionPetId: 'partner-2' }).some(row => row.id === 'model-1'));
    assert.ok(!cache.warm({ ...input, history: [{ role: 'assistant', content: '我小时候喜欢在海边听父亲讲故事。' }] }).some(row => row.id === 'model-1'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('first local speech is immediate, its receipt starts one background batch, and model text is preferred afterward', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'idle-fast-'));
  try {
    const cache = new IdleCache(join(dir, 'cache.json')), history = [];
    const idle = new IdleChat({ cache, stamp: () => 'same', options: () => DEFAULT_CHAT_OPTIONS, random: () => .1 });
    const build = async () => ({ companionPetId: 'main', storyCard: { name: '小雨' }, cacheEpoch: 'first', history,
      system: '公开测试人物。', storyBatch: true, requireDeliveryAck: true,
      storySeeds: ['小时候父亲带我沿海散步，风大时总替我拉紧外套。'],
      onDisplayed: event => history.push({ role: 'assistant', content: event.text, source: { kind: event.sourceKind, id: event.id } }) });
    const input = await build(), packet = idle.warmPacket(input, { manual: true });
    assert.equal(packet.origin, 'local'); assert.ok(packet.text); assert.equal(history.length, 0);
    assert.equal((await idle.acknowledge(packet.deliveryId)).ok, true); assert.equal(history.length, 1);
    let release, started, calls = 0;
    const entered = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const generate = async () => { calls++; started(); await gate; return { ok: true, text: JSON.stringify({ segments: [
      { text: '小时候我常跟父亲去海边，一起风，他就顺手把我的外套拉紧。' },
      { text: '那时候我只顾着看海，后来回想，反而最记得拉外套这个小动作。' },
    ] }) }; };
    const background = idle.prefetch(build, generate); await entered;
    await idle.prefetch(build, generate); assert.equal(calls, 1);
    const another = idle.warmPacket(await build(), { manual: true });
    assert.equal(another.origin, 'local', 'while a slow model runs, another local line is still available');
    await idle.acknowledge(another.deliveryId);
    release(); await background;
    assert.ok(idle.ready?.batch); assert.equal(calls, 1);
    assert.equal(idle.warmPacket(await build(), { manual: true }), null);
    const model = await idle.run(build, generate, undefined, { manual: true });
    assert.ok(model.text.includes('父亲')); assert.equal(calls, 1);
    await idle.acknowledge(model.deliveryId);
    const restarted = new IdleChat({ cache: new IdleCache(join(dir, 'cache.json')), stamp: () => 'same', options: () => DEFAULT_CHAT_OPTIONS });
    const resumed = restarted.warmPacket(await build(), { manual: true });
    assert.equal(model.consumedIds.length, 2, 'manual delivery combines adjacent short cached speech');
    assert.equal(resumed.origin, 'local', 'both displayed model parts have been consumed across restart'); assert.ok(!resumed.text.includes('小时候我常'));
    restarted.activity(); assert.equal((await restarted.acknowledge(resumed.deliveryId)).ok, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
