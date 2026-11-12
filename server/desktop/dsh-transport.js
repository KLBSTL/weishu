import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./dsh-runner.cjs', import.meta.url));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fault = (code, status) => Object.assign(new Error('DSH request did not complete'), { code, status });
export function harnessExecutable(settings = {}) {
  const executable = settings.harnessExecutable || process.env.SP_DSH_EXECUTABLE;
  if (!executable || !existsSync(executable)) throw fault('SP_DSH_UNAVAILABLE');
  return executable;
}

/** One owned process per attempt permits cancellation without abandoning remote work locally. */
export async function runHarness(settings, request, signal, onProgress = () => {}) {
  signal?.throwIfAborted();
  if (!/^[a-f0-9-]{36}$/u.test(request.sessionId)) throw fault('SP_DSH_RUNTIME');
  const executable = harnessExecutable(settings);
  if (request.action !== 'check') await mkdir(request.directory, { recursive: true });
  return new Promise((resolve, reject) => {
    const launched = performance.now();
    const child = spawn(executable, ['--expose-internals', runner], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: request.directory } });
    let pending = '', result, failure, settled = false, bytes = 0, hostFirstTextMs;
    const timer = setTimeout(() => stop(fault('ETIMEDOUT')), request.timeoutMs || 120000);
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve({ ...result, timings: { ...result.timings, hostFirstTextMs, processMs: performance.now() - launched } });
    };
    const stop = error => { failure = error; child.kill(); };
    const abort = () => stop(signal.reason || fault('SP_CANCELLED'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.on('error', () => finish(fault('SP_DSH_UNAVAILABLE')));
    child.stdin.on('error', () => {});
    child.stderr.resume(); // DSH diagnostics may contain upstream content; do not relay or archive them.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 1000000) { stop(fault('SP_RESPONSE_SIZE')); return; }
      pending += chunk;
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) {
        let row; try { row = JSON.parse(line); } catch { continue; }
        if (row.arkDsh !== 1) continue;
        if (row.event === 'text') hostFirstTextMs ??= performance.now() - launched;
        if (row.event) onProgress(row);
        if (row.result) result = row.result;
        if (row.error) { failure = fault(row.error.code, row.error.status); failure.stage = row.error.stage; failure.timings = row.timings; }
      }
    });
    child.on('close', code => finish(failure || (code || !result ? fault('SP_DSH_RUNTIME') : null)));
    // The process input is not a command line or persisted configuration; credentials stay out of logs.
    child.stdin.end(JSON.stringify({ ...request, settings: {
      auth: settings.auth, apiKey: settings.apiKey, baseUrl: settings.baseUrl, model: settings.model, protocol: settings.protocol, credentialHome: settings.credentialHome,
    } }));
  });
}

const lanes = new Map();
async function removeSession(home, id) {
  if (!/^[a-f0-9-]{36}$/u.test(id || '')) return;
  const parent = resolve(home, 'sessions'), target = resolve(parent, id);
  if (dirname(target) === parent) await rm(target, { recursive: true, force: true });
}
export function chooseHarnessSession(saved, history, scope) {
  if (saved?.scope === scope && saved.history?.length >= 2 && JSON.stringify(saved.history).length < 60000) {
    // The UI sends a recent window. Retain older confirmed turns only while its suffix still agrees.
    for (let overlap = Math.min(saved.history.length, history.length); overlap >= Math.min(12, saved.history.length); overlap--) {
      if (saved.history.slice(-overlap).every((item, i) => hash(item) === hash(history[i]))) return {
        sessionId: saved.sessionId, resume: true, delta: history.slice(overlap), confirmed: [...saved.history, ...history.slice(overlap)],
      };
    }
  }
  return { sessionId: randomUUID(), resume: false, delta: history, confirmed: history };
}
function visibleAnswer(content) {
  try { const value = JSON.parse(content); if (typeof value.text === 'string') return value.text; } catch { /* Plain answers already match displayed history. */ }
  return content;
}

/** Resume only after the caller's authoritative history confirms the previous output was displayed. */
export async function harnessCompletion(settings, messages, { directory, scopeKey, background = false, displayHistory, maxTokens, effort = 'low', signal, onProgress } = {}) {
  const key = hash([settings.auth, settings.baseUrl, settings.model, Array.isArray(scopeKey) ? scopeKey.slice(0, 3) : scopeKey]);
  const scope = hash([key, settings.apiKey, scopeKey]);
  if (lanes.has(key)) throw fault('SP_PROVIDER_BUSY');
  lanes.set(key, true);
  try {
    const home = join(directory, 'harness', key), file = join(home, 'current.json');
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const requestHistory = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    // The host appends action/image instructions to the current request, then omits them from later history.
    // Compare the authoritative display projection, while sending the complete current request to the model.
    const history = !background && displayHistory ? displayHistory.map(({ role, content }) => ({ role, content })) : requestHistory;
    let saved;
    if (!background) try { saved = JSON.parse(await readFile(file, 'utf8')); } catch { /* First turn or interrupted checkpoint. */ }
    const chosen = chooseHarnessSession(saved, history.slice(0, -1), scope);
    const delta = [...chosen.delta, requestHistory.at(-1)].filter(Boolean);
    const prompt = delta.length === 1 && delta[0].role === 'user' ? delta[0].content
      : '以下是本次实际已展示的历史增量及最后一个待回答请求。role 表示原说话者；只回答最后一个请求，不重答历史。\n' + JSON.stringify(delta);
    let result, committed = false;
    try {
      result = await runHarness(settings, { directory: home, system, prompt, sessionId: chosen.sessionId,
        resume: chosen.resume, maxTokens, effort }, signal, onProgress);
      signal?.throwIfAborted();
      if (!background) {
        // This is a candidate checkpoint. It is reusable only when the next authoritative history confirms it.
        const checkpoint = { candidateId: randomUUID(), scope, sessionId: chosen.sessionId, history: [...chosen.confirmed, history.at(-1), { role: 'assistant', content: visibleAnswer(result.content) }].filter(Boolean) };
        const temporary = file + '.' + randomUUID() + '.tmp';
        try { await writeFile(temporary, JSON.stringify(checkpoint), { mode: 0o600 }); await rename(temporary, file); }
        finally { await rm(temporary, { force: true }); }
        committed = true;
        if (saved?.sessionId !== chosen.sessionId) await removeSession(home, saved?.sessionId);
        // The actual host parses action/image control markers after streaming. Project only its accepted
        // full visible reply; next-turn history must still prove display. Never let an older result replace a newer candidate.
        Object.defineProperty(result, 'projectVisible', { value: async text => {
          if (lanes.has(key)) return;
          lanes.set(key, true);
          try {
            let current; try { current = JSON.parse(await readFile(file, 'utf8')); } catch { return; }
            if (current.candidateId !== checkpoint.candidateId) return;
            if (typeof text !== 'string' || !text.trim()) { await rm(file, { force: true }); await removeSession(home, chosen.sessionId); return; }
            current.history.at(-1).content = text;
            const pending = file + '.' + randomUUID() + '.tmp';
            try { await writeFile(pending, JSON.stringify(current), { mode: 0o600 }); await rename(pending, file); }
            catch { await rm(file, { force: true }); await removeSession(home, chosen.sessionId); }
            finally { await rm(pending, { force: true }); }
          } finally { lanes.delete(key); }
        } });
      }
      return result;
    } finally {
      // A failed/cancelled native turn can contain partial output. It must never be resumed.
      if (!committed) {
        await removeSession(home, chosen.sessionId);
        if (chosen.resume) await rm(file, { force: true });
      }
    }
  } finally { lanes.delete(key); }
}
