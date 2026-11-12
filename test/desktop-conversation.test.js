import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { conversationStream, searchWeb, createAssistantTextStream, withConversationScope, sourcesRoute } from '../server/desktop/conversation.js';
import { withProviderSlot } from '../server/desktop/provider-queue.js';
import { chatProfile } from '../server/match/replyStyle.js';
import { classifyAiFailure } from '../server/desktop/ai-request.js';

const settings = { protocol: 'openai-compatible', baseUrl: 'https://fixture.invalid/v1', apiKey: 'fixture-public-test', model: 'fixture', retryBackoffMs: [0, 0] };

test('a partner external lookup cannot become the main pet or an unknown pet source list', async () => {
  let calls = 0;
  await withConversationScope(async () => {
    const parts = await collect(request('查一份公开资料'), async url => {
      if (url.endsWith('/tools/search')) return Response.json({ results: [{ title: '公开资料', url: 'https://example.org/public', summary: '测试来源' }] });
      return ++calls === 1 ? sse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'source-scope', type: 'function', function: { name: 'web_search', arguments: '{"query":"公开资料"}' } }] }, finish_reason: 'tool_calls' }] }, '[DONE]',
      ]) : text('查到这一版了。');
    });
    return { ok: true, text: parts.find(p => p.text)?.text };
  }, { petId: 'sources-owner' });
  assert.ok(sourcesRoute('sources-owner').obj.sources.length > 0);
  assert.deepEqual(sourcesRoute('main').obj.sources, []);
  assert.deepEqual(sourcesRoute('unbound-partner').obj.sources, []);
});

test('an ordinary user request preempts proactive generation and releases its model slot', async () => {
  let entered, calls = 0;
  const ready = new Promise(resolve => { entered = resolve; });
  const runtime = { ready: () => true, store: { current: () => settings }, logger: { warn() {} },
    fetcher: async (_url, init) => {
      if (++calls === 1) { entered(); await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })); }
      return text('先听你说。');
    } };
  const stream = createAssistantTextStream(runtime, options => ({ request: options }));
  const auto = withConversationScope(async () => { for await (const _part of stream(request('主动闲聊'))) { /* cancelled */ } }, { proactive: true });
  const cancelled = assert.rejects(auto);
  await ready;
  const answer = [];
  for await (const part of stream(request('我想问个问题。'))) answer.push(part.text);
  await cancelled;
  assert.equal(answer.join(''), '先听你说。'); assert.equal(runtime.active, undefined); assert.equal(calls, 2);
});

test('terminal SSE closes a still-open transport without waiting for a second timeout', async () => {
  let cancelled = false;
  const out = await collect(request('你好'), async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"好了。"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'text/event-stream' } }));
  assert.equal(out.find(p => p.text).text, '好了。'); assert.equal(cancelled, true);
});

test('explicit web requests retrieve related PRTS evidence before the model answers and number sources consistently', async () => {
  let generations = 0;
  const out = await collect(request('请联网搜索卫戍协议规则'), async (url, init) => {
    if (url.endsWith('/tools/search')) return new Response('', { status: 404 });
    if (url.includes('action=parse')) return Response.json({ parse: { title: '卫戍协议/帮助', text: { '*': '<p>每名干员最多可佩戴两件装备。</p>' } } });
    if (url.includes('action=query')) return Response.json({ query: { search: [] } });
    generations++;
    const body = JSON.parse(init.body);
    assert.ok(body.messages.some(m => m.content?.includes?.('"sourceId":1')));
    assert.ok(body.messages.some(m => m.content?.includes?.('两件装备')));
    return text('每名干员最多两件装备[1]。');
  });
  assert.equal(generations, 1);
  assert.equal(out.find(p => p.sources)?.sources[0].title, '卫戍协议/帮助');
});

test('Anthropic thinking and tool signatures survive a tool round trip', async () => {
  let calls = 0; const out = [];
  const input = { ...request('介绍角峰'), chatOptions: { mode: 'daily', maxChars: 60, effort: 'high' } };
  for await (const part of conversationStream({ ...settings, protocol: 'anthropic' }, input, AbortSignal.timeout(5000), async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.output_config.effort, 'high');
    if (++calls === 1) return sse([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'internal-thought' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'fixture-signature' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tool-1', name: 'lookup_rules', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"角峰"}' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } },
      { type: 'message_stop' },
    ]);
    const assistant = body.messages.find(m => m.role === 'assistant');
    assert.equal(assistant.content[0].signature, 'fixture-signature');
    assert.equal(assistant.content[1].id, 'tool-1');
    assert.equal(body.messages.at(-1).content[0].type, 'tool_result');
    return sse([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '查到这一版了。' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' },
    ]);
  })) out.push(part);
  assert.equal(out.find(p => p.text).text, '查到这一版了。');
  assert.ok(!JSON.stringify(out).includes('internal-thought'));
});

const sse = frames => new Response(frames.map(frame => 'data: ' + (typeof frame === 'string' ? frame : JSON.stringify(frame)) + '\n\n').join(''),
  { headers: { 'Content-Type': 'text/event-stream' } });
const text = value => sse([{ choices: [{ delta: { content: value }, finish_reason: 'stop' }] }, '[DONE]']);
const request = question => ({ question, system: '公开测试角色。', messages: [{ role: 'user', content: question }] });
async function collect(input, fetcher) {
  const out = [];
  for await (const part of conversationStream(settings, input, AbortSignal.timeout(5000), fetcher)) out.push(part);
  return out;
}

test('relayed and scoped lore blocks preserve examples, insertion roles and the actual current question', async () => {
  const loreContext = { blocks: [{ text: '前置书店设定', position: 'before' }, { text: '用户层资料', position: 'depth', depth: 1, role: 'user' }], examples: '我喜欢翻看旧书。' };
  for (const scoped of [false, true]) {
    let body; const run = () => collect({ ...request('你今天想做什么？'), ...(!scoped && { loreContext }) }, async (_url, init) => { body = JSON.parse(init.body); return text('我想看会儿书。'); });
    if (scoped) await withConversationScope(run, { loreBlocks: loreContext.blocks, examples: loreContext.examples }); else await run();
    assert.match(body.messages[0].content, /^前置书店设定/); assert.ok(body.messages.some(m => m.role === 'system' && m.content.includes('说话示例资料')));
    assert.ok(body.messages.some(m => m.role === 'user' && m.content.includes('用户层资料'))); assert.equal(body.messages.at(-1).content, '你今天想做什么？');
  }
});

test('a bound game cannot turn ordinary chat into a game question or fetch unrelated live facts', async () => {
  for (const question of ['你平时喜欢喝什么？', '你明年的打算是什么？', '今晚夕阳很漂亮吧？']) {
    let reads = 0, body;
    await collect({ ...request(question), facts: { round: 987, secretBoardMarker: 'must-stay-local' },
      getFacts: async () => { reads++; throw new Error('ordinary chat must not read it'); } }, async (_url, init) => {
      body = JSON.parse(init.body); return text('我喜欢热茶。');
    });
    assert.equal(reads, 0); assert.equal(body.messages.at(-1).content, question);
    assert.ok(!JSON.stringify(body).includes('must-stay-local'));
    assert.ok(!body.tools.some(tool => ['lookup_rules', 'get_game_state'].includes(tool.function.name)));
  }
});

test('conversation budgets keep short answers separate from high reasoning and 300-character analysis', () => {
  assert.equal(chatProfile('你准备买谁？').timeoutMs, 120000);
  assert.equal(chatProfile('你现在的人设是什么？').options.maxChars, 60);
  assert.equal(chatProfile('为什么这轮买角峰？').timeoutMs, 180000);
  assert.equal(chatProfile('为什么这轮买角峰？').options.maxChars, 300);
  assert.equal(chatProfile('解释玩法', { mode: 'daily', maxChars: 500 }).options.maxChars, 500);
  assert.equal(chatProfile('解释玩法', { mode: 'unlimited', maxChars: 25 }).options.mode, 'unlimited');
  for (const effort of ['low', 'medium', 'high']) {
    assert.equal(chatProfile('你好', { effort }).timeoutMs, 120000);
    assert.equal(chatProfile('联网查询', { effort }).timeoutMs, 180000);
  }
});

test('effort selection changes the actual wire payload and token budget for both protocols', async () => {
  for (const effort of ['low', 'medium', 'high']) {
    const options = { mode: 'daily', maxChars: 60, effort };
    const payloads = [];
    const fetcher = async (_url, init) => { payloads.push(JSON.parse(init.body)); return text('好呀。'); };
    await collect({ ...request('你好'), chatOptions: options }, fetcher);
    assert.equal(payloads[0].thinking.type, effort === 'low' ? 'disabled' : 'enabled');
    assert.equal(payloads[0].reasoning_effort, effort === 'low' ? undefined : effort);
    assert.equal(payloads[0].max_tokens, chatProfile('你好', options).maxTokens);
    for await (const _part of conversationStream({ ...settings, protocol: 'anthropic' },
      { ...request('你好'), chatOptions: options }, AbortSignal.timeout(5000), async (_url, init) => {
        assert.equal(JSON.parse(init.body).output_config.effort, effort);
        return new Response(JSON.stringify({ content: [{ type: 'text', text: '好呀。' }], stop_reason: 'end_turn' }),
          { headers: { 'Content-Type': 'application/json' } });
      })) { /* inspect the actual transport */ }
  }
});

test('DeepSeek V4.1 maps selectable effort to its supported template values without weakening other models', async () => {
  for (const [effort, wire] of [['low', undefined], ['medium', 'high'], ['high', 'xhigh']]) {
    let body;
    for await (const _part of conversationStream({ ...settings, model: 'deepseek-v4.1-flash-1017' },
      { ...request('你好'), chatOptions: { effort } }, AbortSignal.timeout(5000), async (_url, init) => {
        body = JSON.parse(init.body); return text('好呀。');
      })) { /* actual protocol payload */ }
    assert.equal(body.reasoning_effort, wire);
    assert.equal(body.thinking.type, effort === 'low' ? 'disabled' : 'enabled');
  }
});

test('thinking tool calls preserve reasoning internally and use actual local rules without exposing it as text', async () => {
  const calls = [];
  const out = await collect({ ...request('介绍角峰的本版规则'), chatOptions: { mode: 'daily', maxChars: 60, effort: 'high' } }, async (_url, init) => {
    calls.push(JSON.parse(init.body));
    if (calls.length === 1) return sse([
      { choices: [{ delta: { reasoning_content: 'internal-not-for-bubble', tool_calls: [{ index: 0, id: 'lookup-1', type: 'function', function: { name: 'lookup_rules', arguments: '{"query":"角' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '峰"}' } }] }, finish_reason: 'tool_calls' }] }, '[DONE]',
    ]);
    assert.equal(calls[1].messages.find(m => m.role === 'assistant').reasoning_content, 'internal-not-for-bubble');
    const rules = JSON.parse(calls[1].messages.find(m => m.role === 'tool').content);
    assert.ok(rules.records.some(record => record.name.includes('角峰')));
    return text('我会按这一版的商店和阵容考虑。');
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].thinking.type, 'enabled');
  assert.equal(calls[0].reasoning_effort, 'high');
  assert.ok(calls[0].max_tokens >= 16384);
  assert.ok(calls[1].max_tokens < calls[0].max_tokens);
  assert.equal(out.filter(part => part.text).map(part => part.text).join(''), '我会按这一版的商店和阵容考虑。');
  assert.ok(!JSON.stringify(out).includes('internal-not-for-bubble'));
});

test('a changing game snapshot is fetched again and the original question survives a round transition', async () => {
  let reads = 0, calls = 0;
  const input = { ...request('这轮准备买谁？'), getFacts: async () => (++reads === 1
    ? { matchId: 'same', version: '1', round: 1 } : { matchId: 'same', version: '2', round: 2 }) };
  const out = await collect(input, async (_url, init) => {
    const body = JSON.parse(init.body);
    if (++calls === 2) assert.ok(body.messages.some(m => m.content?.includes?.('回答期间局面已更新')));
    return text(calls === 1 ? '我想买角峰。' : '你问第一轮时我想买角峰，现在第二轮要重新看牌。');
  });
  assert.equal(calls, 2);
  assert.equal(out.filter(p => p.text).length, 1, 'stale provisional answer never reaches the bubble');
  assert.match(out.find(p => p.text).text, /现在第二轮/);
});

test('HTTP 200 error streams retry safely, truncated streams never become successful replies, and length is not an empty answer', async () => {
  let calls = 0;
  const logs = [];
  const out = [];
  for await (const part of conversationStream(settings, request('你好'), AbortSignal.timeout(5000), async () => {
    if (++calls === 1) return sse([{ error: { code: 'server_error', status: 503, message: 'private-card-secret' } }]);
    return text('恢复了。');
  }, (_level, value) => logs.push(value))) out.push(part);
  assert.equal(calls, 2);
  assert.equal(out.find(p => p.text).text, '恢复了。');
  assert.ok(!logs.join('').includes('private-card-secret'));
  await assert.rejects(collect(request('你好'), async () => sse([{ choices: [{ delta: { reasoning_content: 'unfinished' }, finish_reason: 'length' }] }])),
    error => classifyAiFailure(error).kind === 'output');
  const partial = [];
  await assert.rejects(async () => {
    for await (const part of conversationStream(settings, request('你好'), AbortSignal.timeout(5000),
      async () => sse([{ choices: [{ delta: { content: 'partial' } }] }]))) partial.push(part);
  }, /Incomplete stream/u);
  assert.ok(!partial.some(p => p.text));
});

test('search fallback sends no model key and returns real source URLs with decoded titles', async () => {
  const seen = [];
  const result = await searchWeb('卫戍协议', settings, AbortSignal.timeout(3000), async (url, init) => {
    seen.push({ url, init });
    if (seen.length === 1) return new Response('', { status: 404 });
    return new Response('<rss><channel><item><title>卫戍 &amp; 协议</title><link>https://prts.wiki/w/卫戍协议</link><description>公开规则</description></item></channel></rss>');
  });
  assert.equal(result.results[0].title, '卫戍 & 协议');
  assert.equal(seen.find(s => s.url.includes('bing.com')).init.headers, undefined);
  assert.ok(!JSON.stringify(seen.slice(1)).includes(settings.apiKey));
});

test('search JSON preserves Chinese characters split across arbitrary network chunks', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ results: [{ title: '卫戍协议', url: 'https://prts.wiki/w/game', summary: '干员装备规则' }] }));
  const result = await searchWeb('卫戍协议', settings, AbortSignal.timeout(1000), async () => new Response(new ReadableStream({
    start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); },
  })));
  assert.equal(result.results[0].title, '卫戍协议');
  assert.equal(result.results[0].excerpt, '干员装备规则');
});

test('model coordination serializes generation and a queued request can be cancelled', async () => {
  const previous = process.env.DSH_HOME;
  const home = await mkdtemp(join(tmpdir(), 'sp-provider-queue-'));
  process.env.DSH_HOME = home;
  let release, entered = false;
  try {
    const first = withProviderSlot(settings, AbortSignal.timeout(3000), async () => {
      entered = true; await new Promise(resolve => { release = resolve; });
    });
    while (!entered) await delay(5);
    await assert.rejects(withProviderSlot(settings, AbortSignal.timeout(30), async () => assert.fail('queued call started')), /abort|timeout/iu);
    release(); await first;
    assert.equal(await withProviderSlot(settings, AbortSignal.timeout(3000), async () => 'next'), 'next');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});
