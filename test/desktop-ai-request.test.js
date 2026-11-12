import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAiFailure, localizeGenerationResult, normalizeAiFailure, resilientTextStream } from '../server/desktop/ai-request.js';
import { createProxyFetch } from '../server/desktop/proxy-fetch.js';

const settings = { timeoutMs: 5000 };
const consume = async stream => { let text = ''; for await (const part of stream) text += part.text || ''; return text; };
const failStream = (error, visit) => () => ({
  [Symbol.asyncIterator]() { return this; },
  async next() { visit(); throw error; },
});

test('transient failures retry once before output, keeping diagnostics free of private values', async () => {
  let calls = 0;
  const logs = [];
  const failure = Object.assign(new Error('secret-key private-card response-body'), { status: 503 });
  const generate = async function* () { if (++calls === 1) throw failure; yield { text: '恢复正常' }; };
  const output = await consume(resilientTextStream(generate, settings, {}, new AbortController().signal, null,
    (_level, text) => logs.push(text), async () => {}));
  assert.equal(output, '恢复正常');
  assert.equal(calls, 2);
  assert.match(logs[0], /status=503.*retry=true/);
  assert.doesNotMatch(logs.join(''), /secret-key|private-card|response-body/);
});

test('foreground retries survive two 503 failures with safe progress and a bounded third attempt', async () => {
  let calls = 0; const progress = [];
  const generate = async function* () { if (++calls < 3) throw Object.assign(new Error('private-body'), { status: 503 }); yield { text: '恢复了。' }; };
  const output = await consume(resilientTextStream(generate, { timeoutMs: 5000, retryAttempts: 3, retryBackoffMs: [0, 0] },
    { onRetry: info => progress.push(info.attempt) }, new AbortController().signal, null, () => {}, async () => {}));
  assert.equal(output, '恢复了。'); assert.equal(calls, 3); assert.deepEqual(progress, [2, 3]);
});

test('permanent failures and partial streams are never retried, and persistent 502 stops after two calls', async () => {
  for (const status of [400, 401, 403, 404, 422]) {
    let calls = 0;
    const error = Object.assign(new Error('private'), { status });
    await assert.rejects(consume(resilientTextStream(failStream(error, () => calls++), settings, {},
      new AbortController().signal, null, () => {}, async () => {})), error);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const error = Object.assign(new Error('gateway'), { status: 502 });
  await assert.rejects(consume(resilientTextStream(failStream(error, () => calls++), settings, {},
    new AbortController().signal, null, () => {}, async () => {})), error);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(consume(resilientTextStream(async function* () { calls++; yield { text: '开头' }; throw error; },
    settings, {}, new AbortController().signal, null, () => {}, async () => {})), error);
  assert.equal(calls, 1);
});

test('rate-limit retry-after and cancellation respect the original deadline', async () => {
  let calls = 0, waited = false;
  const error = Object.assign(new Error('rate'), { status: 429, headers: new Headers({ 'retry-after': '10' }) });
  await assert.rejects(consume(resilientTextStream(failStream(error, () => calls++), settings, {},
    new AbortController().signal, null, () => {}, async () => { waited = true; })), error);
  assert.equal(calls, 1);
  assert.equal(waited, false);
  const controller = new AbortController();
  const network = Object.assign(new Error('network'), { cause: { code: 'ECONNRESET' } });
  calls = 0;
  await assert.rejects(consume(resilientTextStream(failStream(network, () => calls++), settings, {}, controller.signal, null,
    () => {}, async () => { controller.abort(); controller.signal.throwIfAborted(); })), /abort/iu);
  assert.equal(calls, 1);
});

test('failure messages distinguish categories without exposing provider messages', () => {
  const logs = [];
  for (const [status, expected] of [[400, '拒绝了请求'], [401, '密钥'], [429, '过于频繁'], [502, '暂时不可用']]) {
    const original = Object.assign(new Error('Bearer secret-key private-card response-body'), { status });
    const normalized = normalizeAiFailure(original, new Error('safe'), new AbortController().signal, (_level, text) => logs.push(text));
    assert.ok(normalized.message.includes(expected));
    assert.ok(normalized.message.includes(String(status)));
    assert.doesNotMatch(normalized.message, /secret-key|private-card|response-body/);
  }
  assert.equal(classifyAiFailure({ cause: { code: 'ECONNRESET' } }).kind, 'network');
  assert.equal(classifyAiFailure(new SyntaxError('private')).kind, 'response');
  assert.deepEqual(classifyAiFailure({ code: 'overloaded_error' }), { kind: 'server', status: undefined, code: 'overloaded_error', retryable: true });
  assert.equal(classifyAiFailure({ name: 'APIConnectionError', cause: new Error('Unexpected standalone AI endpoint.') }).retryable, false);
  assert.equal(classifyAiFailure({ status: 429, code: 'insufficient_quota' }).retryable, false);
  assert.match(localizeGenerationResult({ ok: false, message: 'Standalone AI is busy. Please wait.' }).message, /另一条/);
  assert.doesNotMatch(logs.join(''), /secret-key|private-card|response-body/);
});

test('environment proxy is used only for remote requests and preserves the no-proxy list', async () => {
  const calls = [];
  let configured, agents = 0;
  const dispatcher = {};
  const fetcher = createProxyFetch(async (url, options) => { calls.push({ url, options }); return 'ok'; }, {
    env: { HTTPS_PROXY: 'http://127.0.0.1:7892', NO_PROXY: 'internal.example' },
    createAgent: options => { configured = options; agents++; return dispatcher; },
  });
  await fetcher('http://127.0.0.1:3098/health', { method: 'GET' });
  await fetcher('http://localhost:3000/', { method: 'GET' });
  assert.equal(agents, 0);
  await fetcher('https://gateway.example/v1/chat/completions', { method: 'POST' });
  await fetcher('https://gateway.example/v1/chat/completions', { method: 'POST' });
  assert.equal(agents, 1);
  assert.equal(calls[0].options.dispatcher, undefined);
  assert.equal(calls[2].options.dispatcher, dispatcher);
  assert.equal(configured.httpsProxy, 'http://127.0.0.1:7892');
  assert.equal(configured.noProxy, 'internal.example');
});
