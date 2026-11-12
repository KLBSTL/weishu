import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IdleChat, chooseIdleStyle, extractStorySeeds } from '../server/desktop/idle-chat.js';
import { DEFAULT_CHAT_OPTIONS } from '../server/match/replyStyle.js';

function fixture(patch = {}, random = () => 0) {
  let time = 0, version = 'A', saved = [], options = { ...DEFAULT_CHAT_OPTIONS };
  options = { ...options, ...patch };
  const idle = new IdleChat({ now: () => time, stamp: () => version, options: () => options, random,
    read: () => saved, save: lines => { saved = lines; } });
  return { idle, advance: ms => { time += ms; }, switchCard: () => { version = 'B'; },
    disable: () => { options = { ...options, proactive: false }; }, lines: () => saved };
}
const context = async () => ({ system: '所选角色卡：住在海边，喜欢烤面包。', storySeeds: ['小时候和家人在海边散步，雨天会一起烤面包。',
  '学生时代在图书馆旧日记里找到一张地图，开始记录旅行见闻。', '有一年替邻居修好旧收音机，第一次听到遥远城市的广播。'],
  history: [{ role: 'user', content: '今天累了。', ts: 1 }] });

test('idle chat waits 30 seconds, uses current persona/history, limits images/length and avoids repetition', async () => {
  const f = fixture(); let calls = 0;
  const generate = async input => {
    calls++;
    assert.match(input.system, /所选角色卡.*海边/);
    assert.match(input.system, /不杜撰重大身世/);
    assert.match(input.system, /小时候和家人在海边/);
    assert.equal(input.history[0].content, '今天累了。');
    assert.deepEqual(input.pool, []); assert.deepEqual(input.actions, []);
    return { ok: true, text: '我小时候就喜欢听海。', image: 'unused' };
  };
  assert.deepEqual(await f.idle.run(context, generate), { skipped: true });
  f.advance(29999); assert.deepEqual(await f.idle.run(context, generate), { skipped: true });
  f.advance(1); assert.deepEqual(await f.idle.run(context, generate), { text: '我小时候就喜欢听海。' });
  assert.equal(calls, 1); assert.equal(f.lines().length, 1);
  f.advance(30000); assert.equal((await f.idle.run(context, generate)).skipped, true, 'identical output is not spoken again');
  f.advance(30000); f.disable(); await f.idle.run(context, generate); assert.equal(calls, 3, 'one alternate topic is attempted, then it stops');
});

test('user interruption, persona change and disabling discard late proactive results', async () => {
  for (const action of ['user', 'persona', 'disable']) {
    const f = fixture(); f.advance(30000); let release, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const pending = f.idle.run(context, async () => { entered(); await new Promise(resolve => { release = resolve; }); return { ok: true, text: '旧台词' }; });
    await ready;
    assert.equal((await f.idle.run(context, () => assert.fail('duplicate'))).skipped, true);
    if (action === 'user') f.idle.activity(); else if (action === 'persona') f.switchCard(); else f.disable();
    release(); assert.deepEqual(await pending, { skipped: true }); assert.deepEqual(f.lines(), []);
  }
});

test('automatic length and material choices have independent 40/60 and 80/20 boundaries; manual has no lottery', () => {
  let short = 0, grounded = 0;
  for (let i = 0; i < 100; i++) {
    const draws = [(i + .5) / 100, ((i * 37) % 100 + .5) / 100];
    const style = chooseIdleStyle(() => draws.shift());
    short += style.maxChars < 50; grounded += style.grounded;
  }
  assert.equal(short, 40); assert.equal(grounded, 80);
  assert.deepEqual(chooseIdleStyle(() => assert.fail('manual probability'), true), { minChars: 50, maxChars: 100, grounded: true });
  assert.deepEqual(chooseIdleStyle(() => .4), { minChars: 50, maxChars: 100, grounded: true });
});

test('story material comes from description, scenario and enabled lore, with macros expanded', () => {
  const seeds = extractStorySeeds({ name: '小海', description: '{{char}}小时候常去海边散步。',
    scenario: '下雨时全家一起烤面包。', character_book: { entries: [
      { enabled: true, content: '小海把第一本日记放在旧木箱里。' }, { enabled: false, content: '这段关闭的故事不能使用。' },
    ] } });
  assert.ok(seeds.includes('小海小时候常去海边散步。'));
  assert.ok(seeds.some(s => s.includes('旧木箱')));
  assert.ok(!seeds.some(s => s.includes('关闭')));
});

test('configured intervals repeat on continued silence, while manual bypasses silence and the automatic switch', async () => {
  const f = fixture({ idleSeconds: 10 }); let calls = 0;
  const generate = async () => ({ ok: true, text: ++calls === 1 ? '海边的浪花拍着沙滩，父亲拉紧我的外套。' : '那本图书馆旧日记夹着地图，促使我开始记录旅行。' });
  f.advance(9999); assert.equal((await f.idle.run(context, generate)).skipped, true);
  f.advance(1); assert.ok((await f.idle.run(context, generate)).text);
  f.advance(10000); assert.ok((await f.idle.run(context, generate)).text);
  assert.equal(calls, 2);
  f.disable(); f.idle.activity();
  const manual = await f.idle.run(context, async input => {
    assert.match(input.system, /50–100 字/); assert.match(input.system, /【背景取材】/);
    return { ok: true, text: '邻居的收音机好久没有声音了，我花了一个下午检查线路，终于听见遥远城市的广播。那一刻的小小成就感，到现在想起来还会忍不住笑。' };
  }, undefined, { manual: true });
  assert.ok(manual.text.length >= 50 && manual.text.length <= 100);
});

test('long speech keeps its own target without discarding real short answers or making a second padding request', async () => {
  const f = fixture({ maxChars: 25 }, () => .9); f.advance(30000); let calls = 0;
  const answer = await f.idle.run(context, async input => {
    assert.match(input.system, /【日常即兴】/);
    return { ok: true, text: ++calls === 1 ? '很短。' : '故事'.repeat(30), image: 'unused' };
  });
  assert.equal(calls, 1); assert.equal(answer.text, '很短。');
  assert.equal(DEFAULT_CHAT_OPTIONS.maxChars, 60, 'normal replies keep their separate limit');
  f.advance(30000); let attempts = 0;
  assert.equal((await f.idle.run(context, async () => { attempts++; return { ok: true, text: '仍然短。' }; })).text, '仍然短。');
  assert.equal(attempts, 1); assert.equal(f.lines().length, 2);
});

test('automatic failures return their category and retry at the selected interval without a hidden 90 second delay', async () => {
  const f = fixture({ idleSeconds: 10 }); f.advance(10000);
  const failed = await f.idle.run(context, async () => { throw Object.assign(new Error('private provider body'), { status: 503 }); });
  assert.match(failed.error, /503/); assert.equal(failed.failure.kind, 'server'); assert.doesNotMatch(failed.error, /private/);
  f.advance(9999); await f.idle.run(context, () => assert.fail('premature retry'));
  f.advance(1); assert.deepEqual(await f.idle.run(context, async () => ({ ok: true, text: '慢慢来。' })), { text: '慢慢来。' });
});

test('pending manual speech exposes safe progress while a history write failure still preserves its answer', async () => {
  let time = 0, release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const idle = new IdleChat({ now: () => time, options: () => DEFAULT_CHAT_OPTIONS, stamp: () => '', read: () => [], save: () => { throw new Error('disk'); } });
  const pending = idle.run(context, async () => { entered(); await new Promise(resolve => { release = resolve; }); return { ok: true, text: '这是一段真实的短回答。' }; }, undefined, { manual: true });
  await ready; time = 2500;
  const { buffer, ...status } = idle.status();
  assert.deepEqual(status, { pending: true, manual: true, elapsedMs: 2500, stage: 'generating', attempt: undefined, attempts: undefined });
  assert.equal(buffer.coverageMs, 0); assert.ok(buffer.refillThresholdMs > 0);
  release(); assert.equal((await pending).text, '这是一段真实的短回答。'); assert.equal(idle.status().pending, false);
});
