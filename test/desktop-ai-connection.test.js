import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { attachAiConnection, aiConnectionRoute } from '../server/desktop/ai-connection.js';
import { conversationStream } from '../server/desktop/conversation.js';
import { freePort } from './e2e/client.mjs';

const executable = process.env.SP_DSH_EXECUTABLE || '';
const entry = fileURLToPath(new URL('../desktop-pet/node_modules/dsh-pet/lib/standalone.js', import.meta.url));
const connection = (mode = 'direct') => ({ mode, executable, model: 'deepseek-flash' });
async function until(fn) { for (let i = 0; i < 150; i++) { const value = await fn(); if (value) return value; await delay(60); } throw new Error('Timed out waiting for isolated host'); }

test('official account game questions never fall back to the configured API', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ark-official-scope-')), oldHome = process.env.DSH_HOME;
  process.env.DSH_HOME = temp; let directRequests = 0;
  try {
    // Plain Node cannot load the DSH bundle: fail locally before any account or network access.
    await assert.rejects(async () => {
      for await (const _part of conversationStream({ backend: 'dsh', harnessRoute: 'official', auth: 'deepseek-account', harnessExecutable: process.execPath,
        model: 'deepseek-flash', baseUrl: 'https://wrong.invalid/v1', retryBackoffMs: [1, 1] },
      { system: '公开测试', messages: [{ role: 'user', content: '这轮买什么干员？' }], facts: { round: 2 } }, AbortSignal.timeout(5000),
      async () => { directRequests++; throw new Error('Unexpected direct route'); })) { /* drain */ }
    });
    assert.equal(directRequests, 0);
  } finally { if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome; await rm(temp, { recursive: true, force: true }); }
});

test('connection saves roll back on failure, errors are redacted, official selection needs no dummy key', { skip: !executable }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ark-settings-')), oldHome = process.env.DSH_HOME;
  process.env.DSH_HOME = temp;
  let settings = { protocol: 'openai-compatible', model: '', baseUrl: '', apiKey: '' }, failSave = false, cancels = 0;
  const makeRuntime = () => ({ store: { current: () => settings, publicSettings: () => { const { apiKey, ...rest } = settings; return { ...rest, hasKey: !!apiKey }; },
    save: async patch => { if (failSave) { failSave = false; throw new Error('Secret upstream payload'); } settings = { ...settings, ...patch }; } },
  active: { abort() { cancels++; }, finished: Promise.resolve() } });
  try {
    const runtime = makeRuntime(), service = attachAiConnection(runtime);
    assert.equal(runtime.ready(), false);
    await service.action({ action: 'save', connection: connection('dsh-official') });
    assert.equal(runtime.ready(), true); assert.equal(settings.apiKey, ''); assert.equal(cancels, 1);
    assert.equal(runtime.store.current().model, 'deepseek-flash'); assert.equal(runtime.store.current().auth, 'deepseek-account');
    assert.equal(runtime.store.current().apiKey, undefined);
    assert.equal((await service.snapshot()).api.hasKey, false);
    const reopened = makeRuntime(); attachAiConnection(reopened); assert.equal(reopened.store.current().backend, 'dsh'); assert.equal(reopened.ready(), true);
    failSave = true;
    const bad = await aiConnectionRoute('POST', JSON.stringify({ action: 'save', connection: connection(), api: { protocol: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', model: 'test', apiKey: 'fixture' } }));
    assert.equal(bad.obj.code, 'save-failed'); assert.equal(JSON.stringify(bad).includes('Secret'), false);
    assert.equal(reopened.store.current().auth, 'deepseek-account'); assert.equal(settings.apiKey, '');
    assert.equal(JSON.parse(await readFile(join(temp, 'dsh-pet/ai-connection.json'), 'utf8')).mode, 'dsh-official');
    const wrong = await aiConnectionRoute('POST', JSON.stringify({ action: 'save', connection: { ...connection('dsh-official'), executable: 'missing.exe' } }));
    assert.equal(wrong.obj.code, 'runtime-missing'); assert.equal(reopened.ready(), true);
    await writeFile(join(temp, 'dsh-pet/ai-connection.json'), '{broken');
    const corrupt = makeRuntime(); attachAiConnection(corrupt); assert.equal(corrupt.ready(), false);
    assert.equal((await aiConnectionRoute('GET')).obj.loadError, true);
  } finally { if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome; await rm(temp, { recursive: true, force: true }); }
});

test('real standalone host persists connection choices, tests drafts and uses native DSH or direct API',
  { skip: !executable || !existsSync(entry), timeout: 90000 }, async t => {
    const temp = await mkdtemp(join(tmpdir(), 'ark-connection-host-')), data = join(temp, 'dsh-pet');
    const requests = []; let responseCode = 200, responseText = '连接测试通过。\n\n[动作:轻快记录]', child, origin, token, browser;
    const model = createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      requests.push(JSON.parse(raw));
      if (responseCode !== 200) { res.writeHead(responseCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Private upstream fixture', type: 'authentication_error' } })); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: responseText }, finish_reason: null }] })
        + '\n\ndata: ' + JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }) + '\n\ndata: [DONE]\n\n');
    });
    const call = async (path, body, expected = 200) => {
      const res = await fetch(origin + path, { headers: { 'X-DSH-Pet-Token': token, ...(body && { 'Content-Type': 'application/json' }) },
        ...(body && { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
      const result = await res.json(); assert.equal(res.status, expected, JSON.stringify(result)); return result;
    };
    const route = '/dsh-pet-7340/stronghold/ai-connection';
    const stop = async () => { if (child && child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; } child = undefined; };
    const start = async () => {
      const port = await freePort();
      child = spawn(process.execPath, ['--import', new URL('../server/desktop/standalone-persona.js', import.meta.url).href, entry, '--port', String(port)],
        { windowsHide: true, env: { ...process.env, DSH_HOME: temp, SP_AI_BACKEND: 'direct', SP_DSH_ROUTE: 'configured' }, stdio: 'ignore' });
      const runtime = await until(async () => { const value = JSON.parse(await readFile(join(data, 'standalone-runtime.json'), 'utf8').catch(() => 'null')); return value?.pid === child.pid ? value : null; });
      origin = 'http://127.0.0.1:' + runtime.port; token = runtime.token;
    };
    try {
      await mkdir(data); await writeFile(join(data, 'main-config.jsonc'), JSON.stringify({ pets: [{ id: 'main', display: 'none', whisperEnabled: false, balanceEnabled: false }] }));
      model.listen(0, '127.0.0.1'); await once(model, 'listening'); await start();
      const api = { protocol: 'openai-compatible', baseUrl: `http://127.0.0.1:${model.address().port}/v1`, model: 'saved-model', apiKey: 'local-test-only' };
      const unauthorized = await fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', connection: connection() }) });
      assert.ok([401, 403].includes(unauthorized.status));
      const initial = await call(route); assert.equal(initial.ready, false); assert.equal(initial.api.hasKey, false);
      await call(route, { action: 'save', connection: connection('dsh-official') });
      assert.equal((await call(route)).ready, true); assert.equal((await call(route)).api.hasKey, false);
      await stop(); await start(); assert.equal((await call(route)).connection.mode, 'dsh-official');
      await call(route, { action: 'check', connection: connection('dsh-official') }); assert.equal(requests.length, 0, 'official local checks never access models or credentials');
      await call(route, { action: 'save', connection: connection('dsh-api'), api });
      const draft = { action: 'test', connection: connection('dsh-api'), api: { ...api, model: 'unsaved-model' } };
      const probe = await call(route, draft); assert.equal(probe.ok, true); assert.ok(probe.elapsedMs > 0);
      assert.equal(requests.length, 1); assert.equal(requests[0].model, 'unsaved-model'); assert.equal((await call(route)).api.model, 'saved-model');
      assert.match(JSON.stringify(requests[0].messages), /public connection test/u);
      const first = await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '你好' });
      assert.equal(first.text, '连接测试通过。');
      if (first.deliveryId) await call('/dsh-pet-7340/stronghold/library', { action: 'ack-chat', pet: 'main', deliveryId: first.deliveryId, renderedAt: Date.now(), displayMs: 0 });
      const { readdir } = await import('node:fs/promises');
      const scopes = await readdir(join(data, 'harness'));
      const checkpointFile = join(data, 'harness', scopes[0], 'current.json');
      const firstCheckpoint = JSON.parse(await readFile(checkpointFile, 'utf8'));
      const second = await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '继续' });
      const secondCheckpoint = JSON.parse(await readFile(checkpointFile, 'utf8'));
      assert.equal(secondCheckpoint.sessionId, firstCheckpoint.sessionId, 'host action instructions must not break acknowledged history matching');
      assert.equal(firstCheckpoint.history[0].content, '你好');
      assert.equal(firstCheckpoint.history[1].content, '连接测试通过。', 'checkpoint uses host-parsed speech, excluding control markers');
      assert.ok(JSON.stringify(requests.at(-1).messages).includes('[动作]'), 'current model request retains actual host instructions');
      if (second.deliveryId) await call('/dsh-pet-7340/stronghold/library', { action: 'ack-chat', pet: 'main', deliveryId: second.deliveryId, renderedAt: Date.now(), displayMs: 0 });
      await stop(); await start();
      const third = await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '再说一句' });
      assert.equal(JSON.parse(await readFile(checkpointFile, 'utf8')).sessionId, firstCheckpoint.sessionId, 'the real host resumes the same acknowledged native session after restart');
      assert.ok(third.deliveryId);
      await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '上条没显示，换个话题' });
      assert.notEqual(JSON.parse(await readFile(checkpointFile, 'utf8')).sessionId, firstCheckpoint.sessionId, 'parsing markers does not bypass the display receipt requirement');
      responseText = '先把桌上的书放好。再把借来的笔收进盒子里。等太阳落下，就去门口走一会儿。今晚想读完昨天没看完的那一章，然后早点休息，明天再接着聊。';
      assert.ok(responseText.length > 60);
      const shortened = await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '说长一些' });
      assert.ok(shortened.text.length > 0 && shortened.text.length <= 60);
      assert.equal(existsSync(checkpointFile), false, 'a truncated visible answer cannot retain the unheard native tail');
      responseText = '连接测试通过。\n\n[动作:轻快记录]';
      assert.equal(requests.at(-1).model, 'saved-model');
      const harness = await readFile(join(data, 'ai-connection.json'), 'utf8'); assert.equal(harness.includes('local-test-only'), false);
      await call(route, { action: 'save', connection: connection(), api: { ...api, apiKey: '' } });
      assert.equal((await call(route, { ...draft, connection: connection() })).ok, true);
      responseCode = 401; const failed = await call(route, { ...draft, connection: connection() }, 400);
      assert.equal(failed.code, 'auth'); assert.equal(JSON.stringify(failed).includes('Private'), false);
      responseCode = 429; const rateStart = requests.length;
      assert.equal((await call(route, { ...draft, connection: connection() }, 400)).code, 'quota');
      assert.equal(requests.length - rateStart, 1, 'a test never retries the upstream request'); responseCode = 200;
      const before = requests.length;
      await call(route, { action: 'save', connection: { ...connection('dsh-api'), executable: 'missing.exe' }, api }, 400);
      assert.equal((await call(route)).connection.mode, 'direct'); assert.equal(requests.length, before);
      await t.test('settings UI works in a hidden browser without an official model request', { skip: !process.env.SP_E2E }, async () => {
        const { default: puppeteer } = await import('puppeteer-core');
        browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
        const page = await browser.newPage(); await page.setViewport({ width: 1200, height: 860 });
        await page.setExtraHTTPHeaders({ 'X-DSH-Pet-Token': token });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/dsh-pet-7340/stronghold/library-ui#token=' + token + '&pet=main');
        await page.waitForFunction(() => document.body.dataset.ready === 'true');
        await page.click('[data-page="settings"]'); await page.click('[data-section="apiSettings"]');
        await page.waitForSelector('#connectionMode'); await page.waitForFunction(() => document.getElementById('apiModel').value === 'saved-model');
        await page.select('#connectionMode', 'dsh-api');
        await page.$eval('#apiModel', node => { node.value = 'ui-draft'; node.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('#testApi'); await page.waitForFunction(() => document.getElementById('connectionStatus').textContent.includes('连接成功'));
        assert.equal(requests.at(-1).model, 'ui-draft'); assert.equal((await call(route)).api.model, 'saved-model');
        await page.select('#connectionMode', 'dsh-official');
        await page.click('#checkDsh'); await page.waitForFunction(() => document.getElementById('connectionStatus').textContent.includes('本机运行时可用'));
        await page.click('#saveConnection'); await page.waitForFunction(() => document.getElementById('connectionSummary').textContent.includes('官方账号'));
        assert.equal((await call(route)).connection.mode, 'dsh-official');
        assert.equal(await page.$eval('#apiKey', node => node.disabled), true);
        if (process.env.SP_UI_CAPTURE) await page.screenshot({ path: process.env.SP_UI_CAPTURE });
        assert.deepEqual(errors, []);
      });
    } finally { await browser?.close(); await stop(); model.closeAllConnections(); await new Promise(resolve => model.close(resolve)); await rm(temp, { recursive: true, force: true }); }
  });
