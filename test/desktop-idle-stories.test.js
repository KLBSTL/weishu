import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StoryMemory, storyCatalog, storyKey, repeatsStory } from '../server/desktop/idle-stories.js';
import { IdleChat, extractStorySeeds } from '../server/desktop/idle-chat.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';

const seeds = ['小时候和父亲沿海边散步。风大时，他会替我拉紧外套。',
  '读书时在图书馆找到一本夹着地图的日记，开始记录旅行见闻。',
  '有一年替邻居修好收音机，第一次听到遥远城市的广播。'];
const replies = ['小时候我最爱跟父亲在海边散步，风一大，他就帮我把外套拉紧。',
  '我在图书馆翻到一本旧日记，里面夹着地图；从那时起便开始记录旅行。',
  '替邻居修好收音机后，我听见了遥远城市的广播，那种小成就感至今记得。'];
const material = input => JSON.parse(/【本次唯一故事素材】([^\n]+)/u.exec(input.system)[1]).text;
const input = async () => ({ system: '公开测试角色', storySeeds: seeds, history: [] });

test('a multi-sentence event stays together and similar paraphrases share a topic', () => {
  assert.deepEqual(extractStorySeeds({ description: seeds[0] }), [seeds[0]]);
  const catalog = storyCatalog([seeds[0], replies[0], seeds[1]]);
  assert.equal(catalog[0].topic, catalog[1].topic);
  assert.notEqual(catalog[0].topic, catalog[2].topic);
});

test('creative rotation cannot return a topic excluded by the current recovery request',()=>{
  const memory=new StoryMemory(),entry=memory.entry('public-recovery',[]),excluded=new Set();
  for(let i=0;i<100;i++){
    const row=memory.select(entry,[],false,excluded);if(!row)break;
    assert.equal(excluded.has(row.topic),false);excluded.add(row.topic);entry.used[row.topic]=true;
  }
  assert.ok(excluded.size>=10&&excluded.size<100);assert.equal(memory.select(entry,[],false,excluded),null);
});

test('paraphrases and number-only edits repeat a story, while unrelated events do not', () => {
  assert.equal(repeatsStory(replies[0], [seeds[0]]), true);
  assert.equal(repeatsStory('第2次讲海边的小故事。', ['第1次讲海边的小故事。']), true);
  assert.equal(repeatsStory(replies[1], [replies[0]]), false);
});

test('content identity survives property order, restart and switching away then back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sp-story-memory-'));
  try {
    const file = join(dir, 'memory.json'), catalog = storyCatalog(seeds);
    const a = storyKey({ name: 'A', description: seeds.join('\n') });
    assert.equal(a, storyKey({ description: seeds.join('\n'), name: 'A' }));
    const store = new StoryMemory(file), entry = store.entry(a, catalog);
    const selected = store.select(entry, catalog, true); store.record(entry, selected, replies[0], catalog);
    const b = storyKey({ name: 'B', description: '另一个角色' }); store.entry(b, catalog); store.persist();
    const restarted = new StoryMemory(file), resumed = restarted.entry(a, catalog);
    assert.equal(restarted.select(resumed, catalog, true).id, catalog[1].id);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('used topics remain unavailable beyond six recent replies and exhaust without cycling', () => {
  const store = new StoryMemory(), catalog = storyCatalog(seeds), entry = store.entry('A', catalog);
  for (let i = 0; i < 3; i++) { const selected = store.select(entry, catalog, true); store.record(entry, selected, replies[i], catalog); }
  entry.recent = Array.from({ length: 12 }, (_, i) => ({ text: `不相关的日常话${i}`, summary: '日常' }));
  assert.equal(store.select(entry, catalog, true), null);
  assert.equal(store.repeated(replies[0], entry, catalog, { topic: 'new' }), true);
});

test('legacy lines mark their covered source, while failed attempts advance without claiming a story was told', () => {
  const store = new StoryMemory(), catalog = storyCatalog(seeds), entry = store.entry('A', catalog, [replies[0]]);
  const selected = store.select(entry, catalog, true); assert.equal(selected.id, catalog[1].id);
  assert.equal(store.select(entry, catalog, true).id, catalog[2].id);
  assert.equal(entry.used[catalog[1].topic], undefined, 'selecting or failing is not a successful utterance');
});

test('a generated repeat retries once with a different source, then records only the accepted story', async () => {
  let time = 0, calls = 0;
  const idle = new IdleChat({ now: () => time, options: () => DEFAULT_CHAT_OPTIONS, stamp: () => 'fixed', read: () => [], random: () => 0 });
  time = 30000;
  assert.equal((await idle.run(input, async () => ({ ok: true, text: replies[0] }))).text, replies[0]);
  time += 30000;
  const selected = [];
  const next = await idle.run(input, async request => {
    selected.push(material(request)); calls++;
    return { ok: true, text: calls === 1 ? replies[0] : replies[2] };
  });
  assert.equal(next.text, replies[2]); assert.equal(calls, 2);
  assert.deepEqual(selected, [seeds[1], seeds[2]]);
});

test('all-repeated generations stop after two calls and do not get stuck on the same source next interval', async () => {
  let time = 0;
  const idle = new IdleChat({ now: () => time, options: () => DEFAULT_CHAT_OPTIONS, stamp: () => 'fixed', read: () => [], random: () => 0 });
  time = 30000; await idle.run(input, async () => ({ ok: true, text: replies[0] }));
  time += 30000; let calls = 0;
  assert.equal((await idle.run(input, async () => { calls++; return { ok: true, text: replies[0] }; })).reason, 'duplicate');
  assert.equal(calls, 2);
  time += 30000;
  const accepted = await idle.run(input, async request => ({ ok: true, text: material(request).includes('日记') ? replies[1] : replies[2] }));
  assert.ok(accepted.text);
});
