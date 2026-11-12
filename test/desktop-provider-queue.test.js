import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import { withProviderSlot } from '../server/desktop/provider-queue.js';
import { deepSeekClient } from '../server/match/deepseek.js';

async function home(t) {
  const previous = process.env.DSH_HOME, previousRuntime = process.env.SP_DSH_PET_RUNTIME_FILE, dir = await mkdtemp(join(tmpdir(), 'sp-provider-'));
  process.env.DSH_HOME = dir;
  delete process.env.SP_DSH_PET_RUNTIME_FILE;
  t.after(async () => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    if (previousRuntime === undefined) delete process.env.SP_DSH_PET_RUNTIME_FILE; else process.env.SP_DSH_PET_RUNTIME_FILE = previousRuntime;
    await rm(dir, { recursive: true, force: true }); });
  return dir;
}
const settings = { baseUrl: 'http://127.0.0.1:9999', apiKey: 'public-fixture' };

test('background yields an occupied account while foreground waits with progress', async t => {
  await home(t); let release, entered = false, queued = false;
  const first = withProviderSlot(settings, AbortSignal.timeout(3000), async () => { entered = true; await new Promise(resolve => { release = resolve; }); });
  while (!entered) await delay(5);
  await assert.rejects(withProviderSlot(settings, AbortSignal.timeout(3000), () => assert.fail('background started'), { background: true }), e => e.code === 'SP_PROVIDER_BUSY');
  let started = false;
  const second = withProviderSlot(settings, AbortSignal.timeout(3000), () => { started = true; }, { onWait: () => { queued = true; } });
  await delay(20); assert.equal(started, false); assert.equal(queued, true);
  release(); await Promise.all([first, second]); assert.equal(started, true);
});

test('a dead process lease is recovered immediately instead of waiting 200 seconds', async t => {
  const dir = await home(t);
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true, stdio: 'ignore' });
  await once(child, 'exit');
  const data = join(dir, 'dsh-pet'); await mkdir(data);
  const digest = createHash('sha256').update([new URL(settings.baseUrl).origin, settings.apiKey].join('\0')).digest('hex').slice(0, 24);
  await writeFile(join(data, '.provider-' + digest + '.lock'), JSON.stringify({ owner: 'old', pid: child.pid, expires: Date.now() + 200000 }));
  assert.equal(await withProviderSlot(settings, AbortSignal.timeout(1000), () => 'recovered'), 'recovered');
});

test('candidate decision holds the account until the complete response body is read', async t => {
  await home(t); let release, requests = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const model = http.createServer(async (_req, res) => {
    const number = ++requests; res.writeHead(200, { 'Content-Type': 'application/json' }); res.flushHeaders();
    if (number === 1) await gate;
    res.end(JSON.stringify({ choices: [{ message: { content: '{"choice":0}' } }] }));
  });
  model.listen(0, '127.0.0.1'); await once(model, 'listening');
  const choose = deepSeekClient({ base: 'http://127.0.0.1:' + model.address().port, key: 'fixture', model: 'fixture' });
  try {
    const first = choose({}, AbortSignal.timeout(5000));
    while (!requests) await delay(5);
    const second = choose({}, AbortSignal.timeout(5000));
    await delay(30); assert.equal(requests, 1, 'headers alone must not release the request lease');
    release(); assert.deepEqual(await Promise.all([first, second]), [0, 0]);
  } finally { release(); model.closeAllConnections(); await new Promise(resolve => model.close(resolve)); }
});

test('429 cooldown is shared with the next caller; background sends nothing and foreground waits', async t => {
  await home(t); let calls = 0;
  const signal = AbortSignal.timeout(3000);
  await assert.rejects(withProviderSlot(settings, signal, () => {
    calls++; throw Object.assign(new Error('limited'), { status: 429, headers: new Headers({ 'Retry-After': '0.1' }) });
  }), e => e.status === 429);
  await assert.rejects(withProviderSlot(settings, signal, () => { calls++; }, { background: true }), e => e.code === 'SP_RECOVERING' && e.recoveryKind === 'rate' && e.retryAfterMs > 0);
  const started = Date.now();
  assert.equal(await withProviderSlot(settings, signal, () => { calls++; return 'ready'; }), 'ready');
  assert.ok(Date.now() - started >= 40); assert.equal(calls, 2);
});
