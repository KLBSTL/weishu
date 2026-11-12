import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileCard, characterContext, hasInventedUserHistory, automaticSpeaker } from '../server/companion/materials.js';
import { speechProblem, spokenExamples } from '../server/companion/speech.js';
import { parseSpeechBatch, batchGroundingProblem } from '../server/companion/batches.js';
import { CompanionLibrary, actorSessionKey } from '../server/companion/library.js';
import { IdleChat, extractStorySeeds, displayedStoryEvidence } from '../server/desktop/idle-chat.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';
import { StoryMemory, storyCatalog } from '../server/desktop/idle-stories.js';

const scene = { name: '旧城生活计划', first_mes: '门铃响了，小雨抬起手。', character_book: { entries: [
  { id: 'a', comment: '角色-小雨', content: '姓名：小雨\n小雨小时候跟父亲去海边散步。' },
  { id: 'b', comment: '角色-小夏', content: '姓名：小夏\n小夏曾替邻居修好一台收音机，小雨也知道这件事。' },
  { id: 'world', content: '旧城每逢周末举行集市。', extensions: { ark_companion: { knowledge: 'world' } } },
] } };
test('a worldbook-only scene title is not a speaker; explicit selection scopes personal stories', () => {
  const original = JSON.stringify(scene), compiled = compileCard(scene);
  assert.equal(compiled.needsSpeaker, false); assert.ok(['小雨', '小夏'].includes(compiled.speaker.name));
  assert.deepEqual(compiled.candidates.map(c => c.name), ['小雨', '小夏']);
  const selected = { ...scene, extensions: { ark_companion: { speaker: { name: '小雨', personality: '自然口语。' } } } };
  const seeds = extractStorySeeds(selected);
  assert.ok(seeds.some(s => s.includes('海边'))); assert.ok(seeds.some(s => s.includes('集市')));
  assert.ok(!seeds.some(s => s.includes('收音机') || s.includes('门铃')));
  assert.match(characterContext(selected), /固定说话人物：小雨/);
  assert.equal(JSON.stringify(scene), original);
});
test('automatic selection favors richly documented people, stays fixed and preserves an explicit choice', async () => {
  const card = { name: '生活剧情', character_book: { entries: [
    { comment: '角色-路人', content: '姓名：路人\n是个路人。' },
    { comment: '角色-小雨', content: '姓名：小雨\n小雨小时候随父亲去海边，后来学会修船。\n有一年她乘船找到了旧灯塔，曾经替邻居修好房门。' },
    { comment: '角色-小夏', content: '姓名：小夏\n小夏小时候住在山里，后来搬到海边。\n有一次她跟着朋友找到了旧车站，曾经替邻居修好围栏。' },
  ] } };
  assert.deepEqual(new Set([automaticSpeaker(card, { random: () => 0 }).name,
    automaticSpeaker(card, { random: () => .999 }).name]), new Set(['小雨', '小夏']));
  assert.deepEqual(automaticSpeaker(card), automaticSpeaker(structuredClone(card)));
  const dir = await mkdtemp(join(tmpdir(), 'auto-speaker-'));
  try {
    const lib = new CompanionLibrary(dir); await lib.importCard(card);
    const actor = lib.actor('main'); assert.equal(actor.speakerMode, 'auto');
    assert.ok(['小雨', '小夏'].includes(actor.speaker.name));
    assert.equal(new CompanionLibrary(dir).actor('main').speaker.name, actor.speaker.name);
    await lib.update(undefined, data => { data.actors[0].speaker = { name: '路人', description: '是个路人。' }; });
    assert.equal(compileCard(lib.card('main')).speaker.name, '路人');
  } finally { await rm(dir, { recursive: true, force: true }); }
  const top = { name: '两人剧情', description: '姓名：小雨\n小雨小时候去过海边。\n姓名：小夏\n小夏曾经修过收音机。' };
  assert.equal(compileCard(top).candidates.length, 2);
  assert.ok(compileCard(top).candidates.every(c => !c.description.includes(c.name === '小雨' ? '小夏' : '小雨')));
});

test('relationship headings resolve scene characters and keep another person mentioning the speaker out of personal history', async () => {
  const card = { name: '海边姐妹的生活', description: '## 人物\n#### 姐姐：小雨 (Rain)\n小雨曾经修好收音机，妹妹小夏也听过。\n#### 妹妹：小夏 (Summer)\n小夏小时候随父亲去海边，后来在图书馆找到旧日记。\n\n小夏每次旅行都会记下沿途的风景，也喜欢把见过的人和地方画进本子。\n#### 小夏 (Summer) 的外貌\n蓝色头发。' };
  const c = compileCard(card);
  assert.equal(c.sceneCard, true); assert.equal(c.needsSpeaker, false);
  assert.deepEqual(c.candidates.map(x => x.name), ['小雨', '小夏']);
  assert.equal(c.speaker.name, '小夏');
  assert.ok(c.units.filter(x => x.title.startsWith('姐姐')).every(x => x.ownership === 'other'));
  assert.ok(!automaticSpeaker(card).description.includes('修好收音机'));
  const dir = await mkdtemp(join(tmpdir(), 'legacy-heading-speaker-'));
  try {
    const lib = new CompanionLibrary(dir); await lib.importCard(card);
    await lib.update(undefined, data => {
      data.actors[0].speaker = null; data.actors[0].speakerMode = 'explicit';
      data.events.push({ id: 'old-title', actorId: 'main', roomId: 'direct:main', cardId: data.actors[0].assetId,
        type: 'assistant', text: '旧标题身份的台词。', speakerKey: 'default', deliveryState: 'displayed' });
    });
    assert.equal(compileCard(lib.card('main')).speaker.name, '小夏');
    assert.equal(lib.visibleHistory('main').length, 0, 'newly resolved identity does not inherit title-persona history');
    await lib.event('main', 'direct:main', { type: 'user', text: '你好。' });
    assert.equal(lib.snapshot().actors[0].speaker.name, '小夏', 'an ordinary atomic event persists the automatic migration');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('speech checks distinguish live stage directions from spoken recollections and keep dialogue examples', () => {
  assert.equal(speechProblem('门铃响了，我的手停在半空。'), 'stage-direction');
  assert.equal(speechProblem('小雨轻轻抬起手。', '小雨'), 'narrator');
  assert.equal(speechProblem('我以前紧张得不知道手往哪放，现在想起来还有点好笑。'), null);
  assert.equal(spokenExamples('小雨垂下目光。\n{{char}}: 我小时候喜欢听海。\n{{user}}: 真的吗？', '小雨'), '我小时候喜欢听海。');
  assert.equal(hasInventedUserHistory('你问旧日记里那张地图啊，我是在学校找到的。', []), true);
});
test('schema placeholders do not become people, and explicit idle identity cannot leak every past event', () => {
  const card = { name: '生活剧情', first_mes: '请选择人物。', character_book: { entries: [{ comment: '变量初始化', content: '```yaml\n姓名: string\n```' }] } };
  assert.deepEqual(compileCard(card).candidates, []); assert.equal(compileCard(card).needsSpeaker, false);
  assert.equal(compileCard(card).speaker.unnamed, true);
  assert.doesNotMatch(characterContext(card), /请用户.*指定|填写.*姓名/);
  const selected = { ...scene, extensions: { ark_companion: { speaker: { name: '小雨', description: '姓名：小雨\n\n小时候父亲带我去海边。\n\n学生时我找到了一张地图。' } } } };
  assert.doesNotMatch(characterContext(selected, '', { purpose: 'idle' }), /找到了一张地图|父亲带我去海边/);
});
test('bracketed stable habits remain usable without turning conditional events or reference characters into personal history', () => {
  const card = { name: '人物剧情', character_book: { entries: [{ comment: '角色-小雨', content: '【参考角色】\n参考原作的星星小姐。\n【日常性格】\n* 慢性子：小雨平时喜欢慢慢做事。如果杯子空了，就先放下休息一下。\n【事件触发】\n如果故事结束，小雨会得到一封新信。' }] } };
  const seeds = extractStorySeeds(card), catalog = storyCatalog(seeds);
  assert.equal(compileCard(card).speaker.name, '小雨');
  assert.equal(new Set(catalog.map(row => row.topic)).size, 1, 'one habit is one source rather than three pre-expanded angles');
  assert.ok(seeds.every(s => s.includes('慢性子') && !s.includes('星星小姐') && !s.includes('得到一封新信')));
});
test('an empty background pool falls back to clearly marked current thoughts instead of silently waiting', async () => {
  const f = fixture(); f.time(10000);
  const result = await f.idle.run(async () => ({ ...(await f.input()), storySeeds: [] }), async () => ({ ok: true,
    text: JSON.stringify({ segments: [{ text: '我现在只想找个安静角落坐一会儿，什么也不急着做。' }] }) }));
  assert.equal(result.grounded, false); assert.ok(result.text);
});
test('displayed timeline receipts recover story progress after a lost ledger write without committing drafts', () => {
  const catalog = storyCatalog(['小时候父亲带我沿海边散步。']), selected = catalog[0], memory = new StoryMemory(), entry = memory.entry('test', catalog);
  const messages = [{ role: 'assistant', content: '我小时候喜欢去海边。', source: { kind: 'idle', id: 'shown', topicId: selected.topic, topicFinal: true } },
    { role: 'assistant', content: '草稿不能算听过。', source: { kind: 'draft', id: 'draft', topicId: selected.topic } }];
  memory.reconcile(entry, catalog, messages); memory.reconcile(entry, catalog, messages);
  assert.equal(entry.used[selected.topic], true); assert.deepEqual(entry.progress[selected.topic].ids, ['shown']);
});
test('changing the speaker within the same scene card separates personal memory and dynamic state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scene-speaker-'));
  try {
    const lib = new CompanionLibrary(dir); await lib.importCard(scene);
    await lib.update(undefined, data => { data.actors[0].speaker = { name: '小雨', description: '书店店员。' }; });
    const first = actorSessionKey(lib.actor('main'));
    await lib.event('main', 'direct:main', { type: 'user', text: '只和小雨聊的事。' });
    await lib.event('main', 'direct:main', { type: 'assistant', text: '我记下了。', deliveryState: 'displayed' });
    await lib.update(undefined, data => { data.actors[0].speaker = { name: '小夏', description: '修理工。' }; });
    assert.equal(lib.visibleHistory('main').length, 0); assert.notEqual(actorSessionKey(lib.actor('main')), first);
    assert.equal(lib.snapshot().assets[0].card.name, scene.name);
    assert.equal(compileCard(lib.card('main')).sceneCard, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('batch validation rejects unknown evidence, duplicate segments, stage prose and incomplete sentences', () => {
  const config = { selected: { id: 'fact', topic: 'fact' }, targets: Array(3).fill({ minChars: 1, maxChars: 49 }), grounded: true, name: '小雨' };
  const row = text => ({ text, evidenceIds: ['fact'] });
  const good = { segments: [row('我小时候常去海边。'), row('那时候最喜欢的就是听海浪。')] };
  assert.equal(parseSpeechBatch(JSON.stringify(good), config).segments.map(p => p.text).join(''), good.segments.map(p => p.text).join(''));
  for (const data of [{ segments: [row('我小时候常去海边。'), row('我小时候常去海边。')] }, { segments: [{ text: '我去过海边。', evidenceIds: ['other'] }] },
    { segments: [row('我的手停在半空。')] }, { segments: [row('没有结尾')] }]) assert.throws(() => parseSpeechBatch(JSON.stringify(data), config));
});
test('correctly shaped batches cannot substitute a previously told event or smuggle past stories into improvisation', () => {
  const catalog = storyCatalog(['小时候父亲带我沿海散步，风大时拉紧我的外套。', '有一年我替邻居修好了旧收音机，第一次听到遥远城市的广播。']);
  const batch = text => ({ grounded: true, segments: [{ text }] });
  assert.equal(batchGroundingProblem(batch('小时候我爸带我去海边，风大了总会拉紧我的外套。'), catalog[1], catalog), 'wrong-source');
  assert.equal(batchGroundingProblem(batch('我替邻居修好旧收音机，听到很远城市传来的广播，心里特别高兴。'), catalog[1], catalog), null);
  assert.equal(batchGroundingProblem({ grounded: false, segments: [{ text: '小时候我常拆旧收音机。' }] }, catalog[1], catalog), 'creative-past-event');
});
test('ordinary identity and childhood questions retrieve separate relevant material instead of blending every relative', () => {
  const card = { name: '林舟', description: '林舟在旧城书店上班。\n\n小时候父亲带我沿海边散步。\n\n奶奶教我揉面包，要等它慢慢发起来。\n\n学生时我在图书馆找到一本日记。' };
  assert.doesNotMatch(characterContext(card, '你现在是谁？'), /揉面包|图书馆/);
  const childhood = characterContext(card, '你小时候有什么经历？');
  assert.match(childhood, /父亲带我沿海边/); assert.doesNotMatch(childhood, /揉面包|图书馆/);
  assert.doesNotMatch(characterContext(card, '接着说刚才的事。'), /揉面包|图书馆/);
});

test('follow-up evidence uses the last actually displayed topic and preserves its original temporal status', () => {
  const card = { name: '林舟', description: '林舟在书店上班。\n\n去年我在陶艺课做了一只歪杯耳的杯子，出窑后留作纪念。\n\n小时候父亲带我沿海散步。' };
  const source = storyCatalog(extractStorySeeds(card)).find(row => row.text.includes('陶艺'));
  const events = [{ type: 'assistant', sourceKind: 'idle', deliveryState: 'displayed', topicId: source.topic },
    { type: 'assistant', sourceKind: 'idle', deliveryState: 'generated', topicId: 'not-heard' }];
  const prompt = displayedStoryEvidence(card, events);
  assert.match(prompt, /去年我在陶艺课/); assert.match(prompt, /过去经历不能改成现在尚未完成/);
  assert.doesNotMatch(prompt, /沿海散步|not-heard/);
  assert.equal(displayedStoryEvidence(card, [{ ...events[0], topicId: 'unknown' }]), '');
  assert.equal(displayedStoryEvidence(card, [events[1]]), '');
});

function fixture() {
  let time = 0, stamp = 'same', calls = 0; const displayed = [];
  const idle = new IdleChat({ now: () => time, stamp: () => stamp, read: () => [], random: () => .1, options: () => ({ ...DEFAULT_CHAT_OPTIONS, idleSeconds: 10 }) });
  const input = () => ({ companionPetId: 'fixture', system: '公开人物。', storyBatch: true, requireDeliveryAck: true,
    storySeeds: ['小时候父亲带我沿海散步，风大时总替我拉紧外套。'], onDisplayed: event => { displayed.push(event); } });
  const producer = async request => {
    calls++; const selected = JSON.parse(request.system.split('【唯一背景证据】')[1].split('\n')[0]);
    return { ok: true, text: JSON.stringify({ segments: [
      '小时候我常跟父亲去海边，一起风，他就顺手把我的外套拉紧。',
      '那时候我只顾着看海，后来回想，反而最记得拉外套这个小动作。',
      '所以我喜欢的也不只是海，还有那种有人陪着、什么都不用急的感觉。',
    ].map(text => ({ text, evidenceIds: [selected.id] })) }) };
  };
  return { idle, input, producer, displayed, calls: () => calls, time: n => { time = n; }, change: () => { stamp = 'changed'; } };
}
test('manual repeated batches change source within one bounded request and only the new speech can be acknowledged', async () => {
  const old='小时候父亲常陪我沿着海边散步，一起风就替我拉紧外套。那时我只顾着看浪花，现在想起来，最难忘的反而是有人陪着慢慢走的安心。';
  const fresh='有一年我替邻居修好了一台旧收音机，第一次听见遥远城市传来的广播。其实修好它的时候，我最开心的是发现自己也能把一件小事认真做完。';
  const memory=new StoryMemory(),entryFor=memory.entry.bind(memory);let seeded=false;
  memory.entry=(...args)=>{const entry=entryFor(...args);if(!seeded){seeded=true;entry.recent.push({topic:'previous-version-topic',text:old,summary:old});}return entry;};
  const displayed=[],staged=[],sources=[];
  const idle=new IdleChat({now:()=>10000,stamp:()=>'',read:()=>[],random:()=>.1,options:()=>DEFAULT_CHAT_OPTIONS,stories:memory});
  const input=async()=>({system:'公开测试人物。',storyBatch:true,requireDeliveryAck:true,
    storySeeds:['小时候父亲常陪我沿着海边散步，一起风就替我拉紧外套。','有一年我替邻居修好了一台旧收音机，第一次听见遥远城市传来的广播。'],
    onPrepared:packets=>staged.push(...packets),onDisplayed:event=>displayed.push(event)});
  const packet=await idle.run(input,async request=>{const source=JSON.parse(request.system.split('【唯一背景证据】')[1].split('\n')[0]);sources.push(source.id);
    return {ok:true,text:JSON.stringify({segments:[{text:sources.length===1?old:fresh}]})};},undefined,{manual:true});
  assert.equal(sources.length,2);assert.notEqual(sources[0],sources[1]);assert.equal(packet.text,fresh);assert.equal(staged.length,1);assert.equal(displayed.length,0);
  const entry=Object.values(memory.load().cards)[0];assert.equal(Object.keys(entry.used).length,0);
  await idle.acknowledge(packet.deliveryId);assert.equal(displayed.length,1);assert.equal(displayed[0].text,fresh);assert.equal(Object.keys(entry.used).length,1);
});

test('three connected segments use one generation and commit source coverage only after the last matching receipt', async () => {
  const f = fixture(); f.time(5000);
  assert.equal((await f.idle.run(f.input, f.producer, undefined, { prepare: true })).prepared, true);
  f.time(10000); const first = await f.idle.run(f.input, f.producer);
  const entry = Object.values(f.idle.stories.load().cards)[0];
  assert.equal(f.calls(), 1); assert.equal(first.segmentIndex, 0); assert.equal(first.segmentsTotal, 3);
  assert.equal((await f.idle.acknowledge('wrong')).ok, false); assert.equal(f.displayed.length, 0);
  assert.equal((await f.idle.acknowledge(first.deliveryId)).ok, true); assert.equal(Object.keys(entry.used).length, 0);
  assert.equal((await f.idle.run(f.input, f.producer)).prepared, true);
  f.time(20000); const second = await f.idle.run(f.input, f.producer); assert.equal(second.segmentIndex, 1);
  assert.equal((await f.idle.acknowledge(first.deliveryId)).ok, false);
  await f.idle.acknowledge(second.deliveryId);
  f.time(30000); const third = await f.idle.run(f.input, f.producer); await f.idle.acknowledge(third.deliveryId);
  assert.equal(f.calls(), 1); assert.equal(f.displayed.length, 3); assert.equal(Object.keys(entry.used).length, 1);
});
test('unshown tails vanish on interruption, card changes and expiry without pretending the source was completed', async () => {
  for (const mode of ['activity', 'card', 'expiry']) {
    const f = fixture(); f.time(10000); const first = await f.idle.run(f.input, f.producer);
    await f.idle.acknowledge(first.deliveryId);
    const tail = f.idle.ready.id;
    if (mode === 'activity') f.idle.activity(); else if (mode === 'card') f.change(); else f.time(f.idle.ready.expires + 1);
    assert.equal((await f.idle.acknowledge(tail)).ok, false); assert.equal(f.displayed.length, 1);
    assert.equal(Object.keys(Object.values(f.idle.stories.load().cards)[0].used).length, 0);
  }
});
test('a short complete middle sentence is regrouped with its prefix and tail without losing content', async () => {
  const f = fixture(); f.time(10000);
  const result = await f.idle.run(f.input, async () => ({ ok: true, text: JSON.stringify({ segments: [
    { text: '小时候父亲常陪我沿着海边散步，一起风就替我拉紧外套。' },
    { text: '太短。' }, { text: '后面的段落没有完整前文，所以不能跳过中间直接播放。' },
  ] }) }));
  assert.equal(result.segmentsTotal, 1); await f.idle.acknowledge(result.deliveryId);
  assert.match(result.text, /太短。后面的段落/);
  assert.equal(f.displayed.length, 1); assert.equal(f.idle.ready, null);
  assert.equal(Object.keys(Object.values(f.idle.stories.load().cards)[0].used).length, 1);
});
test('an interrupted source is preserved as partial progress, not automatically selected for another retelling', async () => {
  const f = fixture(); f.time(10000);
  const first = await f.idle.run(f.input, f.producer); await f.idle.acknowledge(first.deliveryId); f.idle.activity(); f.time(20000);
  let wasCreative = false;
  const next = await f.idle.run(f.input, async input => { wasCreative = input.system.includes('【即兴角度'); return { ok: true,
    text: JSON.stringify({ segments: [{ text: '我现在只想找个安静角落坐一会儿，什么也不急着做。' }] }) }; });
  assert.equal(wasCreative, true); assert.equal(next.grounded, false);
  assert.equal(Object.keys(Object.values(f.idle.stories.load().cards)[0].used).length, 0);
});
test('an ordinary displayed answer cools down its matching background without claiming permanent source coverage', async () => {
  const f = fixture(); f.time(10000); let source;
  const result = await f.idle.run(async () => ({ ...(await f.input()), storySeeds: [
    '小时候父亲带我沿海散步，风大时总替我拉紧外套。', '我曾替邻居修好旧收音机，听见遥远城市的广播。',
  ], history: [{ role: 'assistant', content: '小时候父亲常带我沿海边散步，起风了就替我拉紧外套。', source: { kind: 'chat' } }] }), async input => {
    source = JSON.parse(input.system.split('【唯一背景证据】')[1].split('\n')[0]);
    return { ok: true, text: JSON.stringify({ segments: [{ text: '我曾帮邻居修好一台旧收音机，听见遥远城市的广播时特别高兴。' }] }) };
  });
  assert.match(source.text, /收音机/); assert.ok(result.text);
  assert.equal(Object.keys(Object.values(f.idle.stories.load().cards)[0].used).length, 0);
});
test('ordinary generated replies are not heard history until acknowledged by the correct pet and current context', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'speech-timeline-'));
  try {
    const lib = new CompanionLibrary(dir); await lib.importCard({ name: '小雨', description: '旧城书店店员。' });
    await lib.event('main', 'direct:main', { type: 'user', text: '你小时候去过哪里？' });
    const data = lib.snapshot(), actor = lib.actor('main', data);
    const event = { id: 'answer', type: 'assistant', text: '我小时候去过海边。', sourceKind: 'chat', deliveryState: 'generated',
      expectedCardId: actor.assetId, expectedRevision: data.revision, expectedContextEpoch: lib.contextEpoch(actor.id) };
    await lib.event(actor.id, 'direct:main', event);
    assert.equal(lib.visibleHistory(actor.id).filter(e => e.type === 'assistant').length, 0);
    assert.equal((await lib.acknowledgeChat('main', 'wrong')).ok, false);
    assert.equal((await lib.acknowledgeChat('main', event.id)).ok, true);
    assert.equal((await lib.acknowledgeChat('main', event.id)).duplicate, true);
    assert.equal(lib.visibleHistory(actor.id).at(-1).text, event.text);
    await lib.event(actor.id, 'direct:main', { ...event, id: 'late' });
    await lib.event(actor.id, 'direct:main', { type: 'user', text: '现在换个话题。' });
    assert.equal((await lib.acknowledgeChat('main', 'late')).ok, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
