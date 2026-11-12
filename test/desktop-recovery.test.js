import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderRecovery, recoveryReply } from '../server/desktop/recovery.js';
import { classifyAiFailure, retryDelay } from '../server/desktop/ai-request.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generatePetChat } from '../server/desktop/chat-options.js';
import { companionLibrary } from '../server/companion/library.js';

const settings = { protocol: 'fixture', baseUrl: 'https://public.invalid/v1', model: 'fixture', apiKey: 'fixture-private-key' };
test('repeated outages open a provider-local circuit, admit one probe, and recover after success', () => {
  let now = 0; const recovery = new ProviderRecovery({ now: () => now });
  recovery.acquire(settings).failure({ kind: 'network' });
  recovery.acquire(settings).failure({ kind: 'server' });
  assert.throws(() => recovery.acquire(settings), e => e.code === 'SP_RECOVERING' && e.retryAfterMs === 10000);
  assert.doesNotThrow(() => recovery.acquire({ ...settings, apiKey: 'another-account' }).cancel());
  now = 10001; const probe = recovery.acquire(settings);
  assert.throws(() => recovery.acquire(settings), /recovering/);
  probe.success(); assert.doesNotThrow(() => recovery.acquire(settings).cancel());
  assert.doesNotMatch(JSON.stringify([...recovery.states]), /fixture-private-key|public\.invalid/);
});
test('rate limits respect long Retry-After, permanent configuration failures await a bounded recheck', () => {
  let now = 0; const recovery = new ProviderRecovery({ now: () => now });
  recovery.acquire(settings).failure({ kind: 'rate' }, 120000);
  assert.throws(() => recovery.acquire(settings), e => e.retryAfterMs === 120000);
  assert.equal(retryDelay({ headers: { 'retry-after': '120' } }), 120000);
  now = 120001; recovery.acquire(settings).failure({ kind: 'auth' });
  assert.throws(() => recovery.acquire(settings), e => e.retryAfterMs === 300000);
});
test('cancellation never poisons the circuit and an abandoned probe can be taken again', () => {
  let now = 0; const recovery = new ProviderRecovery({ now: () => now });
  for (const kind of ['cancelled','persona','game','busy','speech']) recovery.acquire(settings).failure({ kind });
  assert.equal(recovery.state(settings).failures, 0);
  recovery.acquire(settings).failure({ kind: 'rate' }); now = 5001;
  recovery.acquire(settings).cancel(); assert.doesNotThrow(() => recovery.acquire(settings).success());
});
test('recovery is bounded across providers and exposes only safe retry metadata', () => {
  const recovery = new ProviderRecovery({ capacity: 2 });
  for (let i = 0; i < 20; i++) recovery.acquire({ ...settings, model: String(i) }).cancel();
  assert.equal(recovery.states.size, 2);
  const error = Object.assign(new Error('private'), { code: 'SP_RECOVERING', recoveryKind: 'rate', retryAfterMs: 1000 });
  assert.deepEqual(classifyAiFailure(error), { kind: 'recovering', code: 'SP_RECOVERING', status: undefined, recoveryKind: 'rate', retryAfterMs: 1000, retryable: false });
});
test('failed questions get an honest local presence reply, without masking cancellation, partial text or successful answers', () => {
  for (const kind of ['network','timeout','rate','auth','quota']) {
    const out = recoveryReply({ ok: false, message: 'private response', failure: { kind } });
    assert.equal(out.ok, true); assert.equal(out.origin, 'local-recovery'); assert.equal(out.degraded, true);
    assert.doesNotMatch(out.text, /HTTP|private|日志|密钥|已回答/);
  }
  for (const result of [{ ok: true, text: '答案' }, { ok: false, text: '部分正文', failure: { kind: 'network' } },
    { ok: false, failure: { kind: 'cancelled' } }, { ok: false, failure: { kind: 'persona' } }, { ok: false, failure: { kind: 'speech' } }]) assert.equal(recoveryReply(result), result);
});
test('foreground failures deliver local presence through the real library ACK path without invented memory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'companion-recovery-')), previous = process.env.DSH_HOME;
  process.env.DSH_HOME = dir; const library = companionLibrary(join(dir, 'dsh-pet'));
  try {
    await library.ready(); await library.importCard({ name: '小雨', description: '我在海边的书店工作。' });
    for (const generate of [async () => ({ ok: false, message: 'private provider response', failure: { kind: 'server', status: 503 } }),
      async () => { throw Object.assign(new Error('private provider response'), { status: 503 }); }]) {
      const out = await generatePetChat(generate, { companionPetId: 'main', system: '公开人设', userText: '今天想聊些什么？' });
      assert.equal(out.ok, true); assert.equal(out.origin, 'local-recovery'); assert.ok(out.deliveryId);
      const event = library.snapshot().events.find(e => e.id === out.deliveryId);
      assert.equal(event.sourceKind, 'local-recovery'); assert.equal(event.deliveryState, 'generated'); assert.deepEqual(event.extensionProposals, []);
      assert.equal((await library.acknowledgeChat('main', out.deliveryId)).ok, true);
      assert.equal((await library.lastDisplayed()).id, out.deliveryId);
    }
    const cancelled = await generatePetChat(async () => ({ ok: false, failure: { kind: 'cancelled' }, message: '取消' }),
      { companionPetId: 'main', system: '公开人设', userText: '取消这次请求。' });
    assert.equal(cancelled.ok, false); assert.equal(cancelled.origin, undefined);
  } finally { await library.close(); if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; await rm(dir, { recursive: true, force: true }); }
});
