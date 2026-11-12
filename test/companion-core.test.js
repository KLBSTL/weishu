import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePersona } from '../server/desktop/persona.js';
import { compileCard, materialSections, characterContext, hasInventedUserHistory } from '../server/companion/materials.js';
import { CompanionLibrary, safeStatePatch } from '../server/companion/library.js';
import { IdleChat } from '../server/desktop/idle-chat.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';
import { renderReadOnlyTemplate } from '../server/companion/template.js';
import { evaluateLore } from '../server/companion/lore.js';

test('explicit other-person lore stays private for ordinary and scene cards in both rule profiles', async () => {
  for (const ruleProfile of ['legacy', 'enhanced']) for (const sceneCard of [false, true]) {
    const card = { name: '小雨', description: '小雨在书店工作。', personality: '温和。',
      extensions: { ark_companion: { ruleProfile, sceneCard, speaker: { name: '小雨' } } }, character_book: { entries: [
        { id: 'self', constant: true, content: '自己收着一枚书签。', extensions: { ark_companion: { subject: '小雨' } } },
        { id: 'world', constant: true, content: '公共广场在河边。', extensions: { ark_companion: { knowledge: 'world' } } },
        { id: 'private', constant: true, content: 'OTHER_PRIVATE_SENTINEL', extensions: { ark_companion: { subject: '另一位店员' } } },
        { id: 'zero', constant: true, content: 'ZERO_SENTINEL', extensions: { probability: 0 } },
      ] } };
    const compiled = compileCard(card), active = await evaluateLore(compiled, { question: '另一位店员知道什么？', preview: true });
    assert.doesNotMatch(JSON.stringify(active.selected), /SENTINEL/);
    assert.match(JSON.stringify(active.selected), /书签/); assert.match(JSON.stringify(active.selected), /公共广场/);
    assert.doesNotMatch(characterContext(card), /SENTINEL/);
    assert.doesNotMatch(characterContext(card, '', { activeLore: { selected: compiled.lore } }), /OTHER_PRIVATE_SENTINEL/);
  }
});

test('card metadata survives import; source sections exclude code and bind headings to prose', () => {
  const card = parsePersona(Buffer.from(JSON.stringify({ spec: 'chara_card_v3', data: { name: '小雨', description: '我在旧城经营一家小书店。',
    extensions: { author: { custom: 7 } }, character_book: { name: '旧城', extensions: { custom: true }, entries: [{ id: 42, comment: '童年',
      keys: ['海边'], extensions: { custom: 2 }, content: '# 童年\n小时候父亲带我沿海散步。风大时他会拉紧我的外套。\n\n```js\nObject.keys(obj).length === 0;\n```\n# 指令: 初始化\n请按以下结构输出状态。' }] } } })));
  assert.equal(card.character_book.entries[0].id, 42); assert.equal(card.extensions.author.custom, 7);
  const compiled = compileCard(card), row = compiled.lore[0];
  assert.equal(compiled.lore.length, 1); assert.equal(row.title, '童年'); assert.match(row.text, /外套/);
  assert.doesNotMatch(row.text, /Object|初始化|结构/);
  assert.equal(row.evidence.path, '/books/0/entries/0/content');
  assert.ok(row.evidence.end > row.evidence.start);
  assert.equal(materialSections('= BOSS_COOLDOWN\n(kinks[k].等级||0) >= 3);', '/code').length, 0);
});

test('conditional and author-only entries do not become performed events or another speaker knowledge', () => {
  const card = { name: 'A', description: '住在旧城的普通书店老板。', character_book: { entries: [
    { content: '如果能放假，我会去海边。', constant: true },
    { content: 'A私下藏着一封未寄出的信。', constant: true, extensions: { ark_companion: { speakers: ['A'] } } },
    { content: '作者知道的幕后真相。', constant: true, extensions: { ark_companion: { knowledge: 'author_only' } } },
    { content: '剧情结束之后的隐藏情报。', constant: true, extensions: { ark_companion: { conditions: [{ path: 'story.ended', value: true }] } } },
  ] } };
  assert.equal(compileCard(card).lore[0].kind, 'conditional');
  const b = characterContext(card, '', { speaker: { name: 'B', personality: '话少。' } });
  assert.doesNotMatch(b, /未寄出|幕后真相|隐藏情报/);
  assert.match(b, /固定说话人物：B/);
});

test('speaker macros and actual user memory are scoped, not inherited from card titles or assistant lines', () => {
  const text = characterContext({ name: '双人故事', description: '{{char}}喜欢看雨。{{user}}是来访者。' }, '', { speaker: { name: '小雨' }, userName: '阿星' });
  assert.match(text, /小雨喜欢看雨。阿星是来访者/);
  assert.equal(hasInventedUserHistory('你上次说怕自己坚持不住。', []), true);
  assert.equal(hasInventedUserHistory('你上次说怕自己坚持不住。', [{ role: 'assistant', content: '怕自己坚持不住' }]), true);
  assert.equal(hasInventedUserHistory('你上次说怕自己坚持不住。', [{ role: 'user', content: '我怕自己坚持不住。' }]), false);
});

test('idle persona core cannot leak unrelated background events into the selected story request', () => {
  const card = { name: '林舟', personality: '温和自然。', description: '林舟是旧城书店店员。\n\n小时候父亲带他去海边散步。\n\n学生时发现一本夹着地图的日记。' };
  const core = characterContext(card, '', { purpose: 'idle' });
  assert.match(core, /书店店员|温和自然/); assert.doesNotMatch(core, /海边散步|夹着地图/);
});

test('library publishes atomically, rejects stale edits and isolates private/public actor sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-core-'));
  try {
    const store = new CompanionLibrary(dir);
    await store.importCard({ name: 'A', description: '旧城书店的老板。' }, Buffer.from('original'));
    const revision = store.snapshot().revision;
    await store.update(revision, d => { d.actors.push({ id: 'B', name: 'B', assetId: d.assets[0].id, overrides: { name: 'B' }, bookIds: [] }); d.bindings.second = 'B'; d.rooms.push({ id: 'group', members: ['main', 'B'] }); });
    await assert.rejects(store.update(revision, () => {}), e => e.status === 409);
    await store.event('main', 'direct:main', { type: 'user', text: '只告诉A的事。' });
    assert.equal(store.visibleHistory('B', 'direct:B').length, 0);
    assert.throws(() => store.visibleHistory('B', 'direct:main'), e => e.status === 403);
    await store.event('main', 'group', { id: 'once', type: 'assistant', text: '公开说过的话。' });
    await store.event('main', 'group', { id: 'once', type: 'assistant', text: '不应重复提交。' });
    assert.equal(store.visibleHistory('B', 'group').length, 1);
    assert.equal(store.card('second').extensions.ark_companion.speaker.name, 'B');
    assert.equal(new CompanionLibrary(dir).snapshot().assets[0].originalBytes, Buffer.from('original').toString('base64'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('state updates are schema constrained, all-or-nothing and cannot modify game or prototype fields', () => {
  const current = { actor: { mood: 10 } }, schema = { actor: { mood: { type: 'number', min: 0, max: 100 } } };
  assert.equal(safeStatePatch(current, schema, [{ op: 'replace', path: '/actor/mood', value: 20 }]).actor.mood, 20);
  for (const patch of [[{ op: 'replace', path: '/game/lp', value: 20 }], [{ op: 'replace', path: '/actor/mood', value: 101 }], [{ op: 'add', path: '/actor/__proto__', value: 1 }]]) assert.throws(() => safeStatePatch(current, schema, patch));
  assert.equal(current.actor.mood, 10);
});

test('prepared speech waits for silence, reserves one candidate and commits only on matching display receipt', async () => {
  let time = 0, calls = 0;
  const idle = new IdleChat({ now: () => time, stamp: () => 'fixed', read: () => [], random: () => .5, options: () => ({ ...DEFAULT_CHAT_OPTIONS, idleSeconds: 10 }) });
  const input = () => ({ system: '公开人物', storySeeds: ['小时候父亲带我沿海散步，风大时拉紧我的外套。'], requireDeliveryAck: true });
  const generate = async () => { calls++; return { ok: true, text: '小时候我和父亲去海边散步，他总帮我拉好外套。' }; };
  time = 5000; assert.equal((await idle.run(input, generate, undefined, { prepare: true })).prepared, true);
  const entry = Object.values(idle.stories.load().cards)[0]; assert.equal(Object.keys(entry.used).length, 0);
  time = 9000; assert.equal((await idle.run(input, generate, undefined, { prepare: true })).prepared, true);
  time = 10000; const result = await idle.run(input, generate); assert.ok(result.deliveryId); assert.equal(calls, 1);
  assert.equal(idle.acknowledge('wrong').ok, false); assert.equal(Object.keys(entry.used).length, 0);
  assert.equal(idle.acknowledge(result.deliveryId).ok, true); assert.equal(Object.keys(entry.used).length, 1);
  assert.equal(idle.acknowledge(result.deliveryId).ok, false);
});

test('read-only templates escape values and cannot access prototype objects or evaluate expressions', () => {
  assert.equal(renderReadOnlyTemplate('{{char}} / {{state.actor.mood}}', { char: '<b>A</b>', state: { actor: { mood: 4 } } }), '&lt;b&gt;A&lt;/b&gt; / 4');
  assert.match(renderReadOnlyTemplate('{{state.constructor.name}}'), /未设置/);
  assert.equal(renderReadOnlyTemplate('{{1+1}}'), '{{1+1}}');
});
