import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CHAT_OPTIONS, replyResult, replyText } from '../server/match/replyStyle.js';
import { chatOptionsRoute, generatePetChat, generatePetWhisper, readChatOptions, saveChatOptions } from '../server/desktop/chat-options.js';

test('daily replies enforce visible-character length and remove images while unlimited preserves the original', () => {
  const result = { ok: true, text: '你好。'.repeat(30) + '[图:问候]![配图](http://local/p.png)<img src="p.png">', image: '问候' };
  assert.equal(replyResult(result).text, '你好。'.repeat(20));
  assert.equal(replyResult(result).image, undefined);
  assert.equal(replyResult({ ok: true, text: '[图:问候]', image: '问候' }).text, '日常模式不配图。');
  assert.equal(replyText('👨‍👩‍👧‍👦！你好！', { mode: 'daily', maxChars: 2 }), '👨‍👩‍👧‍👦！');
  assert.equal(replyText('你好， 世界！', { mode: 'daily', maxChars: 5 }), '');
  assert.equal(replyResult({ ok: true, text: '你'.repeat(90) }).failure.kind, 'incomplete');
  assert.equal(replyResult(result, { mode: 'unlimited', maxChars: 25 }), result);
});

test('preferences default to daily/60 and persist independent concurrent mode/length changes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'sp-chat-options-'));
  try {
    const file = join(temp, 'options.json');
    assert.deepEqual(readChatOptions(file), DEFAULT_CHAT_OPTIONS);
    assert.equal(DEFAULT_CHAT_OPTIONS.bubbleSeconds, 20); assert.equal(DEFAULT_CHAT_OPTIONS.idleSeconds, 30); assert.equal(DEFAULT_CHAT_OPTIONS.effort, 'low');
    await saveChatOptions({ bubbleSeconds: 20 }, file);
    await Promise.all([saveChatOptions({ mode: 'unlimited' }, file), saveChatOptions({ maxChars: 25 }, file)]);
    assert.deepEqual(readChatOptions(file), { ...DEFAULT_CHAT_OPTIONS, mode: 'unlimited', maxChars: 25 });
    await saveChatOptions({ effort: 'low', proactive: false, idleSeconds: 10, bubbleSeconds: 60 }, file);
    assert.equal(readChatOptions(file).effort, 'low');
    assert.equal(readChatOptions(file).bubbleSeconds, 60);
    assert.equal(readChatOptions(file).proactive, false);
    assert.equal(readChatOptions(file).idleSeconds, 10);
    for (const idleSeconds of [10, 15, 20, 30, 45, 60]) await saveChatOptions({ idleSeconds }, file);
    for (const patch of [{ effort: 'max' }, { proactive: 'yes' }, { bubbleSeconds: 0 }, { bubbleSeconds: 31 }, { idleSeconds: 9 }, { idleSeconds: 61 }, { idleSeconds: '30' }]) {
      await assert.rejects(saveChatOptions(patch, file));
    }
    await assert.rejects(saveChatOptions({ maxChars: 0 }, file));
    await assert.rejects(saveChatOptions({ maxChars: 4.5 }, file));
    assert.equal((await chatOptionsRoute('POST', '{"mode":"bad"}', file)).status, 400);
    assert.equal((await chatOptionsRoute('GET', '', file)).obj.mode, 'unlimited');
    assert.equal(readChatOptions(file).maxChars, 25);
    await writeFile(file, JSON.stringify({ mode: 'unlimited', maxChars: 25 }));
    assert.deepEqual(readChatOptions(file), { ...DEFAULT_CHAT_OPTIONS, mode: 'unlimited', maxChars: 25 }, 'legacy preferences retain mode and length');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('generation snapshots options before switching and disables image instructions at the source', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'sp-chat-mode-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = temp;
  t.after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; });
  try {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let captured;
    const original = { ok: true, text: '好。'.repeat(50), image: '问候' };
    const pending = generatePetChat(async input => { captured = input; await gate; return original; },
      { system: '角色卡', pool: ['问候'] });
    assert.deepEqual(captured.pool, []);
    assert.match(captured.system, /最多 60/);
    await saveChatOptions({ mode: 'unlimited' });
    release();
    assert.equal((await pending).text.length, 60);
    const unlimited = await generatePetChat(async input => { captured = input; return original; }, { system: '角色卡', pool: ['问候'] });
    assert.equal(unlimited, original);
    assert.deepEqual(captured.pool, ['问候']);
    assert.equal(captured.system, '角色卡');
    await saveChatOptions({ mode: 'daily', maxChars: 25 });
    const whisper = await generatePetWhisper(async (_ctx, request) => {
      assert.equal(request.meme, undefined); return original;
    }, {}, { system: '角色卡', meme: '问候' });
    assert.equal(whisper.text.length, 24, 'complete sentences stay below the cap');
    assert.equal(whisper.image, undefined);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
