import { createHash } from 'node:crypto';

const temporary = new Set(['network', 'timeout', 'rate', 'server', 'response', 'empty', 'proxy']);
const configuration = new Set(['auth', 'quota', 'request', 'endpoint']);

/** Account-local circuit breaker. Only hashes and public failure categories are retained. */
export class ProviderRecovery {
  constructor({ now = Date.now, capacity = 64 } = {}) { this.now = now; this.capacity = capacity; this.states = new Map(); }
  key(settings) {
    return createHash('sha256').update(JSON.stringify([settings.protocol, settings.baseUrl, settings.model, settings.apiKey || settings.key])).digest('hex');
  }
  state(settings) {
    const key = this.key(settings);
    let row = this.states.get(key);
    if (!row) {
      // Never evict a live probe to admit another one for the same provider.
      if (this.states.size >= this.capacity) {
        const oldest = [...this.states].find(([, value]) => !value.probing);
        if (oldest) this.states.delete(oldest[0]);
        else throw Object.assign(new Error('Provider recovery capacity reached'), { code: 'SP_PROVIDER_BUSY' });
      }
      row = { failures: 0, until: 0, probing: false }; this.states.set(key, row);
    }
    return row;
  }
  acquire(settings) {
    const row = this.state(settings), retryAfterMs = Math.max(0, row.until - this.now());
    if (retryAfterMs || row.probing) throw Object.assign(new Error('Provider is recovering'), {
      code: 'SP_RECOVERING', recoveryKind: row.kind, retryAfterMs: retryAfterMs || 1000,
    });
    const probe = row.failures > 0 && row.until > 0;
    if (probe) row.probing = true;
    let finished = false;
    return {
      success: () => { if (!finished) { finished = true; Object.assign(row, { failures: 0, until: 0, probing: false, kind: undefined }); } },
      failure: (info, retryAfter = 0) => {
        if (finished) return; finished = true; row.probing = false;
        if (!temporary.has(info.kind) && !configuration.has(info.kind)) return;
        row.failures++; row.kind = info.kind;
        if (row.failures < 2 && !['rate', 'proxy'].includes(info.kind) && !configuration.has(info.kind)) return;
        const backoff = configuration.has(info.kind) ? 300000 : Math.min(60000, 5000 * 2 ** Math.min(4, row.failures - 1));
        row.until = this.now() + Math.max(backoff, Math.min(2147483647, Math.max(0, retryAfter)));
      },
      cancel: () => { if (!finished) { finished = true; row.probing = false; } },
    };
  }
}

export const providerRecovery = new ProviderRecovery();

/** A local presence response is never presented as an answer to the failed factual request. */
export function recoveryReply(result) {
  if (result?.ok || result?.text || !result?.failure) return result;
  const info = result.failure, kind = info.kind === 'recovering' ? info.recoveryKind : info.kind;
  if (!temporary.has(kind) && !configuration.has(kind) && info.kind !== 'recovering') return result;
  return { ...result, ok: true, text: '我还在这儿。这次没能接上你的话，先陪你待一会儿，等会儿再聊。',
    origin: 'local-recovery', degraded: true, recovery: { kind, retryAfterMs: info.retryAfterMs || 0, needsSettings: configuration.has(kind) },
    message: undefined, failure: undefined };
}
