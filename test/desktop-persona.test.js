import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPersonaStore, parsePersona } from '../server/desktop/persona.js';
import { deepSeekChatClient } from '../server/match/deepseek.js';
import { dailyPersonaPet } from '../server/desktop/daily-persona.js';
import { characterPersona } from '../server/match/characterPersona.js';
import { crc32, defaultCover, pngChunks } from '../server/companion/card-png.js';

const card = { spec: 'chara_card_v2', data: { name: '安静搭档', personality: '说话温柔、简短，先听完再回应。',
  description: '习惯轻声说话。', mes_example: '{{char}}：嗯，{{user}}，这轮一起慢慢看。' } };

function chunk(type, bytes = Buffer.alloc(0)) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), bytes])));
  return Buffer.concat([size, Buffer.from(type), bytes, crc]);
}

test('SillyTavern JSON and PNG metadata normalize the same voice, preferring ccv3', () => {
  const bytes = Buffer.from(JSON.stringify(card));
  const text = Buffer.concat([Buffer.from('chara\0'), Buffer.from(bytes.toString('base64'))]);
  const newer = { spec: 'chara_card_v3', data: { ...card.data, name: '新版搭档' } };
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...pngChunks(defaultCover()).filter(c => c.type !== 'IEND').map(c => c.raw),
    chunk('tEXt', text), chunk('tEXt', Buffer.from('ccv3\0' + Buffer.from(JSON.stringify(newer)).toString('base64'))),
    chunk('IEND')]);
  assert.equal(parsePersona(bytes).personality, card.data.personality);
  assert.equal(parsePersona(png).name, '新版搭档');
  assert.equal(parsePersona(Buffer.from(JSON.stringify(card.data))).name, '安静搭档');
  assert.equal(parsePersona(Buffer.from('{"name":"开场示例","first_mes":"嗯，我们一起看牌。"}')).first_mes, '嗯，我们一起看牌。');
  assert.throws(() => parsePersona(png.subarray(0, png.length - 3)), /不完整/);
  assert.throws(() => parsePersona(Buffer.from('{}')), /缺少/);
  assert.throws(() => parsePersona(Buffer.from('not a card')), /有效/);
});

test('persona selection survives restart, rejects invalid changes, and is captured per chat request', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'sp-persona-'));
  try {
    const file = join(temp, 'selected.json');
    const store = await createPersonaStore(file);
    const fallback = '配置里的日常口吻';
    const pet = { id: 'main', name: '桌宠原名', whisperPrompt: fallback };
    assert.equal(dailyPersonaPet(pet, '', file), pet);
    await store.select(Buffer.from(JSON.stringify(card)));
    const gameReader = await createPersonaStore(file);
    assert.equal(gameReader.get().name, '安静搭档');
    const projected = dailyPersonaPet(pet, '你是谁？', file);
    const daily = projected.whisperPrompt;
    assert.match(daily, /说话温柔/);
    assert.match(daily, /安静搭档/);
    assert.equal(projected.name, '');
    assert.equal(projected.id, '');
    assert.equal(pet.name, '桌宠原名');
    assert.doesNotMatch(daily, /桌宠原名/);
    assert.doesNotMatch(daily, /\{\{char\}\}|配置里的日常口吻/);
    await assert.rejects(store.select(Buffer.from('broken')));
    assert.equal((await createPersonaStore(file)).get().name, '安静搭档');
    const prompts = [];
    const reply = 'data: {"choices":[{"delta":{"content":"嗯，一起看牌。"}}]}\n\ndata: [DONE]\n\n';
    const chat = deepSeekChatClient({ key: 'fixture', getPersona: store.get });
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      prompts.push(JSON.parse(options.body).messages[0].content);
      return new Response(reply);
    });
    const context = { question: '这轮呢？', facts: {}, dialogue: [] };
    const pending = chat(context, AbortSignal.timeout(2000), () => {});
    await store.select(null);
    assert.equal(gameReader.get(), null, 'an already running game sees the standalone host change');
    assert.equal(dailyPersonaPet(pet, '', file), pet);
    await pending;
    await chat(context, AbortSignal.timeout(2000), () => {});
    assert.match(prompts[0], /说话温柔/);
    assert.match(prompts[0], /安静搭档/);
    assert.doesNotMatch(prompts[0], /你仍是.*大肥鱼/);
    assert.match(prompts[0], /普通聊天只读/);
    assert.doesNotMatch(prompts[0], /\{\{char\}\}/);
    assert.match(prompts[1], /平时有点好胜/);
    assert.equal((await createPersonaStore(file)).get(), null);
    assert.equal(await readFile(file, 'utf8'), 'null');
    t.mock.method(console, 'warn', () => {});
    await writeFile(file, 'broken');
    assert.equal(dailyPersonaPet(pet, '', file), pet);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('full character fields and relevant lore persist without executing card UI or replacing game facts', async () => {
  const bytes = Buffer.from(JSON.stringify({ spec: 'chara_card_v3', data: { name: '双人故事',
    description: '梨奈和汐奈是一对姐妹，由她们回答。', scenario: '姐妹住在公寓里。',
    system_prompt: '保持两人的性格差异。', post_history_instructions: '目前按本卡身份。',
    first_mes: '<body>请安装酒馆助手<script>window.bad = true</script></body>',
    character_book: { entries: [
      { content: '姐妹共同背景', constant: true, enabled: true, extensions: { ark_companion: { knowledge: 'world' } } },
      { content: '梨奈喜欢画画', keys: ['梨奈'], enabled: true, extensions: { ark_companion: { knowledge: 'world' } } },
      { content: '汐奈喜欢音乐', keys: ['汐奈'], enabled: true, extensions: { ark_companion: { knowledge: 'world' } } },
      { content: '禁用条目', constant: true, enabled: false },
    ] } } }));
  const card = parsePersona(bytes);
  const projected = characterPersona(card, '梨奈，你是谁？');
  assert.match(projected, /姐妹住在公寓里|保持两人的性格差异/);
  assert.match(projected, /姐妹共同背景/);
  assert.match(projected, /梨奈喜欢画画/);
  assert.doesNotMatch(projected, /汐奈喜欢音乐|禁用条目|window.bad|请安装酒馆助手/);
  assert.equal(card.character_book.entries.length, 4);
  assert.match(parsePersona(Buffer.from(JSON.stringify(card))).scenario, /公寓/);
});
