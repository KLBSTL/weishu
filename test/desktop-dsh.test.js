import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chooseHarnessSession, runHarness, harnessCompletion } from '../server/desktop/dsh-transport.js';
import { conversationStream, withConversationScope, conversationMetrics } from '../server/desktop/conversation.js';
import { classifyAiFailure } from '../server/desktop/ai-request.js';

test('DSH resumes only a fully acknowledged history prefix in the same scope', () => {
  const history = [{ role: 'user', content: '名字小林' }, { role: 'assistant', content: '小林，你好' }];
  const saved = { scope: 'one', sessionId: 'persisted', history };
  assert.equal(chooseHarnessSession(saved, history, 'one').resume, true);
  assert.equal(chooseHarnessSession(saved, history.slice(0, 1), 'one').resume, false);
  assert.equal(chooseHarnessSession(saved, history, 'two').resume, false);
  assert.equal(chooseHarnessSession(saved, [{ role: 'user', content: '更正' }], 'one').resume, false);
  const extended = { ...saved, history: [...history, ...Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '第' + i + '条' }))] };
  assert.equal(chooseHarnessSession(extended, extended.history.slice(-12), 'one').resume, true);
  assert.equal(chooseHarnessSession(extended, extended.history.slice(-2), 'one').resume, false);
  assert.equal(chooseHarnessSession(extended, extended.history.slice(-12), 'forgotten-revision').resume, false);
});

test('installed DSH uses a tool-free agent, restores native sessions and respects display boundaries', { skip: !process.env.SP_DSH_EXECUTABLE, timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ark-dsh-'));
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body); requests.push(payload);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ id: 'local', model: 'test', choices: [{ index: 0, delta: { role: 'assistant', content: '好的，小林。' }, finish_reason: null }] }) + '\n\n');
    res.end('data: ' + JSON.stringify({ id: 'local', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 } }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'test', apiKey: 'local-public-test' };
  try {
    const sessionId = randomUUID();
    const a = await runHarness(settings, { directory, sessionId, system: '你是桌宠。{{keep}}是字面值。', prompt: '我是小林', maxTokens: 128 }, AbortSignal.timeout(15000));
    assert.equal(a.content, '好的，小林。');
    assert.equal(a.timings.http.length, 1);
    assert.ok(a.timings.firstTextMs >= 0);
    assert.equal(a.outputTokens, 8);
    const b = await runHarness(settings, { directory, sessionId, resume: true, system: '你是桌宠。{{keep}}是字面值。', prompt: '还记得我是谁吗', maxTokens: 128 }, AbortSignal.timeout(15000));
    assert.equal(b.resumed, true);
    assert.ok(requests[1].messages.some(m => m.role === 'assistant' && m.content.includes('小林')));
    assert.ok(requests[1].messages.some(m => m.role === 'user' && m.content.includes('我是小林')));
    assert.ok(requests.every(r => !r.tools?.length));
    assert.ok(requests[0].messages[0].content.includes('{{keep}}'));
    const messages = [{ role: 'system', content: '你是桌宠' }, { role: 'user', content: '我是小林' }];
    const options = { directory, scopeKey: 'a', maxTokens: 128, signal: AbortSignal.timeout(15000) };
    const c = await harnessCompletion(settings, messages, options);
    const d = await harnessCompletion(settings, [...messages, { role: 'assistant', content: c.content }, { role: 'user', content: '继续' }], options);
    assert.equal(d.resumed, true);
    const e = await harnessCompletion(settings, [...messages, { role: 'user', content: '上条未展示' }], options);
    assert.equal(e.resumed, false);
    const background = await harnessCompletion(settings, messages, { ...options, background: true });
    assert.equal(background.resumed, false);
    const foreign = await harnessCompletion(settings, messages, { ...options, scopeKey: 'different-person' });
    assert.equal(foreign.resumed, false);
    const previousHome = process.env.DSH_HOME;
    process.env.DSH_HOME = directory;
    try {
      const result = await withConversationScope(async () => {
        const parts = [];
        for await (const part of conversationStream({ ...settings, backend: 'dsh' }, { system: '公开桌宠测试', messages: [{ role: 'user', content: '你好' }] }, AbortSignal.timeout(10000))) if (part.text) parts.push(part.text);
        return { ok: true, text: parts.join('') };
      }, { petId: 'fixture-dsh' });
      assert.equal(result.text, '好的，小林。');
      assert.equal(conversationMetrics().at(-1).httpAttempts[0].backend, 'dsh');
    } finally { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});

test('installed DSH bounds failed HTTP, rejects token truncation and kills cancelled work', { skip: !process.env.SP_DSH_EXECUTABLE, timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ark-dsh-errors-'));
  let mode = 'fail', requests = 0, entered;
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain public fixture input */ }
    requests++; entered?.();
    if (mode === 'hang') return;
    if (mode === 'fail') { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"private upstream detail","type":"server_error"}}'); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: {"choices":[{"index":0,"delta":{"content":"未完成的句子"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'test', apiKey: 'local-public-test' };
  const request = () => ({ directory, sessionId: randomUUID(), system: '公开测试', prompt: '测试', maxTokens: 32 });
  try {
    await assert.rejects(runHarness(settings, request(), AbortSignal.timeout(10000)), error => {
      assert.equal(classifyAiFailure(error).kind, 'server'); assert.ok(!error.message.includes('private upstream')); return true;
    });
    assert.equal(requests, 1);
    mode = 'length';
    await assert.rejects(runHarness(settings, request(), AbortSignal.timeout(10000)), error => classifyAiFailure(error).kind === 'output');
    mode = 'hang';
    const controller = new AbortController();
    const ready = new Promise(resolve => { entered = resolve; });
    const promise = runHarness(settings, request(), controller.signal);
    const rejected = assert.rejects(promise, error => error.code === 'SP_CANCELLED');
    await ready; controller.abort(Object.assign(new Error('cancel'), { code: 'SP_CANCELLED' }));
    await rejected;
    assert.equal(requests, 3);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
