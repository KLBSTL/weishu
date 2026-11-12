import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { batchPrompt, parseSpeechBatch, speechLength } from '../server/companion/batches.js';
import { batchExpiresAt, MAX_BATCH_LIFETIME_MS } from '../server/companion/batch-policy.js';
import { IdleChat } from '../server/desktop/idle-chat.js';
import { IdleCache } from '../server/desktop/idle-cache.js';
import { StoryMemory, storyCatalog } from '../server/desktop/idle-stories.js';
import { compileKnowledge, StoryPlanner, utteranceKey } from '../server/companion/knowledge.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';
import { CompanionLibrary } from '../server/companion/library.js';

const source = '小时候父亲带我沿海散步，风大时总替我拉紧外套。';
const lines = [
  '我还记得父亲带我去海边散步，风大的时候，他总会替我拉紧外套。现在想起来，最温暖的反而是那一点安心。',
  '沙滩上那些小脚印，每走几步就被浪花抹平了。我那时总想留下最清楚的一串，回头找不见，又觉得有点好笑。',
  '海水退下去以后，湿沙和干沙的颜色会分得很清楚。我就沿着那条线慢慢走，也不觉得同一条路有什么无聊。',
  '要说有什么特别的收获，倒也没有。只是回忆这些小事时，我才发现，原来不赶时间的感觉也能被记住这么久。',
  '我想试着把海的颜色画下来，兴许用很多种蓝也画不像。不过那应该挺有意思，试坏几张纸也没什么大不了。',
  '等天气合适，我还想去走一小段，不一定非得找到什么景色。能给自己留个没有任务的下午，就已经很不错了。',
  '如果带本书过去，我大概会挑一本可以随时合上的。读多少页不重要，看到有趣的地方，愿意多停一会儿就行。',
  '说着说着，我倒觉得很多快乐不需要特别的理由。譬如一阵凉风，或是路上一个有意思的念头，都够让我高兴。',
  '也许下回我会试试另一条路，看看离海稍远的街道。就当给散步添一点变化，不用把每一次出门都安排得很满。',
  '好了，今天就先聊到这儿吧。那些没计划的小小期待，暂时留着也挺好，想到的时候还能再给自己添一点盼头。',
];
const encode = rows => JSON.stringify({ segments: rows.map(text => ({ text })) });
const targets = Array.from({ length: 10 }, () => ({ minChars: 20, maxChars: 100, preferredMinChars: 50, preferredMaxChars: 80 }));
const config = { selected: { id: 'sea', topic: 'sea', text: source }, targets, grounded: true, name: '小雨' };

test('interruption resumes only a revalidated unshown tail, preserving its displayed prefix without another model call', async () => {
  const card = { name: '小雨', description: source }, knowledge = compileKnowledge(card);
  const selected = new StoryPlanner().catalog(card, storyCatalog([source]), knowledge)[0];
  const batch = parseSpeechBatch(encode(lines.slice(0,3)), { ...config, selected, card });
  const plan = { characterId:'person',actorId:'main',roomId:'direct:main',cardRevision:1,promptRevision:'prompt',memoryRevision:0,
    historyEpoch:'start',knowledgeRevision:'knowledge',styleRevision:'style',memoryEpoch:'before',phases:{} };
  const packets = batch.segments.slice(1).map(p => ({ ...p, selected, batch, topicId:selected.topic, plan, expires:Date.now()+120000 }));
  const staged = [], displayed = [];
  const input = { storyBatch:true,storyCard:card,knowledge,plan:{...plan,memoryEpoch:'after'},cacheEpoch:'after',
    storyLedger:{used:{},coverage:{},recent:[],progress:{[selected.topic]:{ids:[batch.segments[0].id],heard:[batch.segments[0].text]}}},
    history:[{role:'assistant',content:batch.segments[0].text}],prepareFocus:async()=>({allowed:true}),
    onPrepared:async rows=>staged.push(...rows),onDisplayed:async event=>displayed.push(event) };
  const idle = new IdleChat({ stamp:()=> 'stable',read:()=>[] });
  assert.equal(await idle.resume(input,packets),true);assert.equal(staged.length,2);assert.ok(staged.every(p=>p.plan.memoryEpoch==='after'&&p.revalidated));
  const next = await idle.run(async()=>input,async()=>{throw new Error('must use validated buffer');},undefined,{manual:true});
  assert.equal(next.text,lines[1]+lines[2]);assert.equal(next.consumedIds.length,2);assert.equal(next.deliveryId,batch.segments[1].id);assert.equal(displayed.length,0);
  assert.equal((await idle.acknowledge(next.deliveryId)).ok,true);assert.equal(displayed.length,1);
  for(const patch of [{roomId:'other'},{memoryRevision:1},{historyEpoch:'cleared'},{promptRevision:'edited'},{characterId:'other'}]){
    const other = new IdleChat({stamp:()=> 'stable',read:()=>[]});assert.equal(await other.resume({...input,plan:{...input.plan,...patch}},packets),false);
  }
  assert.equal(await new IdleChat().resume({...input,prepareFocus:async()=>({allowed:false})},packets),false);
  assert.equal(await new IdleChat().resume({...input,knowledge:{facts:[]}},packets),false);
  assert.equal(await new IdleChat().resume({...input,heardTextHashes:[utteranceKey(lines[1]).slice(0,24)]},packets),false);
});

test('seven, eight and ten speech parts keep complete sentences; a 49-character long target is not discarded', () => {
  assert.equal(speechLength(lines[0]), 49);
  for (const count of [7, 8, 10]) assert.equal(parseSpeechBatch(encode(lines.slice(0, count)), config).segments.length, count);
  assert.equal(parseSpeechBatch(encode([...lines, '这是第十一段完整台词，新增细节不会因为段数而被拒收。']), config).segments.length, 11);
  assert.throws(() => parseSpeechBatch(encode([lines[0], '半句话没有结束']), config), /batch-length/);
  assert.throws(() => parseSpeechBatch(encode([lines[0], lines[0]]), config), /batch-repeat/);
  assert.ok(parseSpeechBatch(encode([lines[0], '字'.repeat(100) + '。']), config).segments.some(p => speechLength(p.text) > 100));
  const prompt = batchPrompt(config.selected, targets, { grounded: true, heard: [lines[0]] });
  assert.match(prompt, /400字以上/); assert.match(prompt, /约500字/); assert.match(prompt, /这是接续/);
  assert.match(prompt, /不要求段数/);
  assert.doesNotMatch(prompt, /第一段点出本次素材|生成1至3段|数组至多3项/);
});

test('one model request supplies ten parts across a 60-second cadence, committing only each matching receipt', async () => {
  let now = 10000, calls = 0; const displayed = [], staged = [];
  const idle = new IdleChat({ now: () => now, stamp: () => 'one', read: () => [], random: () => .1,
    options: () => ({ ...DEFAULT_CHAT_OPTIONS, idleSeconds: 60 }) });
  const input = async () => ({ storyBatch: true, storySeeds: [source], system: '公开人物。', history: [],
    onPrepared: packets => staged.push(...packets), onDisplayed: event => displayed.push(event) });
  const generate = async request => {
    calls++; assert.match(request.system, /400字以上/); assert.match(request.system, /完整连贯口语正文/);
    return { ok: true, text: encode(lines) };
  };
  let packet = await idle.run(input, generate, undefined, { manual: true });
  assert.equal(new Set(staged.map(p => p.id)).size, 10); assert.equal(displayed.length, 0); assert.equal(packet.segmentsTotal, 10);
  const expires = staged[0].expires;
  assert.ok(expires > now + 600000 && expires <= now + MAX_BATCH_LIFETIME_MS);
  let receipts = 0;
  for (let i = 0; i < 10;) {
    const consumed = packet.consumedIds.length;
    assert.equal(packet.segmentIndex, i); assert.equal(packet.text, lines.slice(i, i + consumed).join(''));
    assert.equal((await idle.acknowledge(packet.deliveryId)).ok, true);
    assert.equal((await idle.acknowledge(packet.deliveryId)).ok, false);
    receipts++; i += consumed;
    assert.equal(displayed.length, receipts); assert.equal(displayed.at(-1).topicFinal, i === 10);
    if (i < 10) { assert.equal((await idle.run(input, generate)).prepared, true); now += 60000; packet = await idle.run(input, generate); }
  }
  assert.equal(calls, 1); assert.equal(idle.ready, null); assert.ok(now > 180000, 'tail survives the former three-minute expiry');
});

test('a later historical repeat keeps only the valid prefix and cannot mark the topic completed', async () => {
  const stories = new StoryMemory(), getEntry = stories.entry.bind(stories);
  stories.entry = (...args) => { const entry = getEntry(...args); entry.recent = [{ text: lines[5], topic: 'other' }]; return entry; };
  const staged = [], displayed = [];
  const idle = new IdleChat({ now: () => 10000, stamp: () => 'one', read: () => [], random: () => .1, stories, options: () => DEFAULT_CHAT_OPTIONS });
  const packet = await idle.run(async () => ({ storyBatch: true, storySeeds: [source], history: [],
    onPrepared: rows => staged.push(...rows), onDisplayed: event => displayed.push(event) }),
  async () => ({ ok: true, text: encode([lines[0], lines[5], lines[6]]) }), undefined, { manual: true });
  assert.equal(packet.segmentsTotal, 1); assert.equal(staged.length, 1);
  await idle.acknowledge(packet.deliveryId); assert.equal(displayed[0].topicFinal, false); assert.equal(idle.ready, null);
});

test('disk cache preserves the start and order of a ten-part batch across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'speech-batch-cache-'));
  try {
    let now = 0; const file = join(dir, 'cache.json'), cache = new IdleCache(file, () => now);
    const input = { storyCard: { name: '小雨' }, cacheEpoch: 'one', companionPetId: 'test', history: [] };
    cache.remember(input, { grounded: true, segments: lines.map((text, index) => ({ id: 'speech-' + index, text })) }, config.selected);
    assert.equal(cache.warm(input)[0].id, 'speech-0');
    for (let i = 0; i < 9; i++) cache.consume(input, 'speech-' + i, lines[i]);
    now = 540000;
    const restored = new IdleCache(file, () => now).warm(input).filter(row => row.origin === 'model-cache');
    assert.deepEqual(restored.map(row => row.id), ['speech-9']); assert.equal(restored[0].topicFinal, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('SQLite staging preserves bounded draft expiry across restart instead of resetting every packet to three minutes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'speech-batch-store-')); let lib = new CompanionLibrary(dir);
  try {
    await lib.importCard({ name: '小雨', description: '我小时候喜欢去海边。' }); const actor = lib.actor();
    const now = Date.now(), expires = batchExpiresAt(now, 10), epoch = lib.contextEpoch(actor.id);
    const plan = { memoryEpoch: epoch, cardRevision: lib.snapshot().revision, characterId: actor.characterId };
    await lib.stage('main', [{ id: 'tail', expires, index: 9, plan }, { id: 'already-expired', expires: now - 1 }, { id: 'unbounded', expires: now + 1e9 }]);
    await lib.close(); lib = new CompanionLibrary(dir); await lib.ready();
    const pending = await lib.store.call('pending-deliveries', { characterId: actor.characterId });
    assert.equal(pending.find(row => row.id === 'tail').expires, expires);
    assert.ok(!pending.some(row => row.id === 'already-expired'));
    assert.ok(pending.find(row => row.id === 'unbounded').expires <= Date.now() + MAX_BATCH_LIFETIME_MS);
    await lib.stage('main',[{id:'tail',expires:expires+60000,index:9,plan:{...plan,memoryEpoch:'next-question'}}],{revalidate:true});
    const refreshed = (await lib.store.call('pending-deliveries',{characterId:actor.characterId})).find(row=>row.id==='tail');
    assert.equal(refreshed.plan.memoryEpoch,'next-question');assert.equal(refreshed.expires,expires,'resuming cannot extend the original draft lifetime');
    await assert.rejects(lib.stage('main',[{id:'foreign',plan:{characterId:'other-person'}}],{revalidate:true}),/人物已切换/);
  } finally { await lib.close(); await rm(dir, { recursive: true, force: true }); }
});
