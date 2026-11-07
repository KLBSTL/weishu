import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const context = new AsyncLocalStorage(), accounts = new Map(), backgroundStarts = new Map();
const priorities = { chat: 0, manual: 1, action: 2, automatic: 3, research: 4 };
export const generationJob = () => context.getStore();
export const inGenerationJob = (job, task) => context.run(job, task);
export function createGenerationJob(kind = 'chat', timeoutMs = 120000) {
  return { id: randomUUID(), kind, priority: priorities[kind] ?? 3, started: Date.now(), deadline: Date.now() + timeoutMs,
    limit: kind === 'automatic' ? 2 : kind === 'action' ? 1 : 3, attempts: 0, queueMs: 0, controller: new AbortController() };
}
export function runGenerationJob(kind, task, timeoutMs = 120000) {
  if (generationJob()) return task(generationJob());
  const job = createGenerationJob(kind, timeoutMs);
  return context.run(job, () => task(job));
}
export function enableSearchBudget() { const job = generationJob(); if (job) { job.limit = 5; job.deadline = job.started + 180000; } }
export function claimAttempt(job = generationJob()) {
  if (!job) return;
  if (job.attempts >= job.limit || Date.now() >= job.deadline) throw Object.assign(new Error('Generation task budget exhausted'), { code: 'SP_ATTEMPT_BUDGET' });
  job.attempts++;
}
export async function accountSlot(account, signal, task, { background = false, onWait = () => {} } = {}) {
  let lane = accounts.get(account); if (!lane) { lane = { queue: [], running: null }; accounts.set(account, lane); }
  const job = generationJob(), started = Date.now();
  const previous = backgroundStarts.get(account);
  if (job?.kind === 'automatic' && previous?.jobId !== job.id && started - (previous?.at || 0) < 10000) throw Object.assign(new Error('Background pacing'), { code: 'SP_PROVIDER_BUSY' });
  if (lane.running && background) throw Object.assign(new Error('Provider is busy'), { code: 'SP_PROVIDER_BUSY' });
  if (lane.running?.job?.priority >= 3 && !background) lane.running.job.controller.abort(Object.assign(new Error('Foreground preemption'), { code: 'SP_CANCELLED' }));
  return new Promise((resolve, reject) => {
    const item = { job, priority: job?.priority ?? (background ? 3 : 2), signal, resolve, reject, task, started };
    const stop = () => { const index = lane.queue.indexOf(item); if (index >= 0) { lane.queue.splice(index, 1); clearInterval(item.keepAlive); reject(signal.reason); } };
    item.stop = stop; signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', stop); reject(signal.reason); return; }
    if (lane.running) { onWait(); item.keepAlive = setInterval(onWait, 80); } lane.queue.push(item); lane.queue.sort((a, b) => a.priority - b.priority || a.started - b.started);
    void drain();
    async function drain() {
      if (lane.running || !lane.queue.length) return;
      const next = lane.queue.shift(); lane.running = next; clearInterval(next.keepAlive); next.signal.removeEventListener('abort', next.stop);
      if (next.job) next.job.queueMs += Date.now() - next.started;
      try {
        if (next.job?.kind === 'automatic') { backgroundStarts.set(account, { jobId: next.job.id, at: Date.now() }); if (backgroundStarts.size > 128) backgroundStarts.delete(backgroundStarts.keys().next().value); }
        next.resolve(await next.task());
      } catch (error) { next.reject(error); }
      finally { lane.running = null; if (lane.queue.length) void drain(); else accounts.delete(account); }
    }
  });
}
