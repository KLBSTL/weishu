import { mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

// Coordinate the game and standalone host without sharing credentials or blocking the game scheduler.
export async function withProviderSlot(settings, signal, task, { background = false, onWait = () => {} } = {}) {
  const dir = process.env.SP_DSH_PET_RUNTIME_FILE ? dirname(process.env.SP_DSH_PET_RUNTIME_FILE)
    : join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet');
  const account = new URL(settings.baseUrl || 'https://api.deepseek.com').origin;
  const digest = createHash('sha256').update([account, settings.apiKey].join('\0')).digest('hex').slice(0, 24);
  const file = join(dir, '.provider-' + digest + '.lock');
  const cooldownFile = join(dir, '.provider-' + digest + '.cooldown');
  const owner = randomUUID();
  await mkdir(dir, { recursive: true });
  while (true) {
    signal.throwIfAborted();
    try {
      const handle = await open(file, 'wx');
      try { await handle.writeFile(JSON.stringify({ owner, pid: process.pid, expires: Date.now() + 200000 })); }
      finally { await handle.close(); }
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const data = JSON.parse(await readFile(file, 'utf8'));
        let dead = false;
        if (Number.isInteger(data.pid) && data.pid > 0) {
          try { process.kill(data.pid, 0); } catch (error) { dead = error.code === 'ESRCH'; }
        }
        if (dead || (Number.isFinite(data.expires) && data.expires < Date.now())) { await unlink(file); continue; }
      } catch {
        try { if (Date.now() - (await stat(file)).mtimeMs > 200000) await unlink(file); } catch { /* another holder closed */ }
      }
      onWait();
      if (background) throw Object.assign(new Error('Provider is busy'), { code: 'SP_PROVIDER_BUSY' });
      await delay(80, undefined, { signal });
    }
  }
  try {
    let cooldown;
    try { cooldown = JSON.parse(await readFile(cooldownFile, 'utf8')); } catch { /* account has not been limited */ }
    const remaining = Number(cooldown?.until) - Date.now();
    if (remaining > 0 && remaining <= 300000) {
      onWait();
      if (background) throw Object.assign(new Error('Provider cooldown'), { code: 'SP_PROVIDER_BUSY' });
      await delay(remaining, undefined, { signal });
    }
    const result = await task();
    if (cooldown?.failures) { try { await writeFile(cooldownFile, JSON.stringify({ until: 0, failures: 0 })); } catch { /* optional pacing state */ } }
    return result;
  } catch (error) {
    if (error.status === 429 && !signal.aborted) {
      let previous;
      try { previous = JSON.parse(await readFile(cooldownFile, 'utf8')); } catch { /* first limit */ }
      const failures = Math.min(3, (previous?.failures || 0) + 1);
      const raw = error.headers?.get?.('retry-after') ?? error.headers?.['retry-after'];
      const parsed = raw == null ? NaN : Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
      const pause = Number.isFinite(parsed) ? Math.max(0, Math.min(300000, parsed)) : 15000 * 2 ** (failures - 1);
      try { await writeFile(cooldownFile, JSON.stringify({ until: Date.now() + pause, failures })); } catch { /* retain the original provider error */ }
    }
    throw error;
  } finally {
    try { if (JSON.parse(await readFile(file, 'utf8')).owner === owner) await unlink(file); } catch { /* already closed */ }
  }
}
