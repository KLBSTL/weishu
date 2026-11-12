import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, writeFile, rename, rm, mkdtemp } from 'node:fs/promises';
import { join, dirname, basename, isAbsolute } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { runHarness } from './dsh-transport.js';
import { createProxyFetch } from './proxy-fetch.js';
import { classifyAiFailure } from './ai-request.js';

const exec = promisify(execFile);
const modes = ['direct', 'dsh-api', 'dsh-official'];
const fail = code => Object.assign(new Error(code), { code });
const directory = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet');
let service;

function validExecutable(path) {
  try { return isAbsolute(path) && basename(path).toLowerCase() === 'deepseek harness.exe' && statSync(path).isFile()
    && existsSync(join(dirname(path), 'resources', 'app.asar')); } catch { return false; }
}
export async function discoverHarness() {
  const candidates = [process.env.SP_DSH_EXECUTABLE,
    ...[process.env.LOCALAPPDATA, process.env.ProgramFiles].filter(Boolean).flatMap(root =>
      [join(root, 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe'), join(root, 'DeepSeek Harness', 'DeepSeek Harness.exe')])];
  if (process.platform === 'win32' && !candidates.some(validExecutable)) {
    const shell = process.env.SP_PWSH_EXECUTABLE || 'pwsh.exe';
    try {
      const { stdout } = await exec(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        "$s=New-Object -ComObject WScript.Shell; try { foreach($f in @('Programs','CommonPrograms')) { $p=Join-Path ([Environment]::GetFolderPath($f)) 'DeepSeek Harness.lnk'; if(Test-Path -LiteralPath $p) { $s.CreateShortcut($p).TargetPath } } } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($s) }"],
      { windowsHide: true, timeout: 5000, maxBuffer: 8192 });
      candidates.push(...stdout.trim().split(/\r?\n/u));
    } catch { /* A manual path remains available on machines without PowerShell on PATH. */ }
  }
  return candidates.find(validExecutable) || '';
}
function validate(input) {
  if (!input || !modes.includes(input.mode) || typeof input.executable !== 'string' || input.executable.length > 2048
    || /[\x00-\x1f]/u.test(input.executable) || typeof input.model !== 'string' || !/^[\w.:-]{1,120}$/u.test(input.model)) throw fail('invalid-settings');
  return { mode: input.mode, executable: input.executable.trim(), model: input.model };
}
function apiPatch(input = {}) {
  const fields = ['protocol', 'baseUrl', 'model', 'apiKey'];
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !fields.includes(key))) throw fail('invalid-settings');
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string' || value.length > (key === 'apiKey' ? 4096 : 2048) || /[\x00-\x1f]/u.test(value)) throw fail('invalid-settings');
    if (key !== 'apiKey' || value) patch[key] = value.trim();
  }
  return patch;
}
function checkApi(settings) {
  if (!['openai-compatible', 'anthropic'].includes(settings.protocol) || !settings.model || !settings.apiKey) throw fail('api-incomplete');
  let url; try { url = new URL(settings.baseUrl); } catch { throw fail('api-incomplete'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[\s\\]/u.test(settings.baseUrl)) throw fail('invalid-settings');
}
export function effectiveConnection(settings, config) {
  return { ...settings, backend: config.mode === 'direct' ? 'direct' : 'dsh', harnessRoute: config.mode === 'dsh-official' ? 'official' : 'configured',
    harnessExecutable: config.executable,
    ...(config.mode === 'dsh-official' ? { model: config.model, auth: 'deepseek-account', baseUrl: 'https://api.deepseek.com/anthropic', apiKey: undefined } : {}) };
}
/** Attach at the pinned host's provider boundary, so model selection and readiness agree with streaming. */
export function attachAiConnection(runtime, stream) {
  const file = join(directory(), 'ai-connection.json'), original = runtime.store.current.bind(runtime.store);
  let config = { mode: process.env.SP_AI_BACKEND === 'dsh' ? process.env.SP_DSH_ROUTE === 'official' ? 'dsh-official' : 'dsh-api' : 'direct',
    executable: process.env.SP_DSH_EXECUTABLE || '', model: 'deepseek-flash' }, loadError = false, probing = false;
  try { config = validate(JSON.parse(readFileSync(file, 'utf8'))); } catch (error) { loadError = error.code !== 'ENOENT'; }
  runtime.store.current = () => effectiveConnection(original(), config);
  runtime.ready = () => !runtime.disposed && !runtime.paused && !runtime.saving && !loadError
    && (config.mode === 'dsh-official' ? validExecutable(config.executable) : !!original().model && !!original().baseUrl && !!original().apiKey
      && (config.mode === 'direct' || validExecutable(config.executable)));
  const snapshot = async () => ({ connection: config, api: runtime.store.publicSettings(), ready: runtime.ready(), loadError,
    detectedExecutable: validExecutable(config.executable) ? config.executable : await discoverHarness() });
  const prepare = async body => {
    const next = validate(body.connection), patch = apiPatch(body.api);
    if (next.mode !== 'direct') {
      next.executable ||= await discoverHarness();
      if (!validExecutable(next.executable)) throw fail('runtime-missing');
    }
    const settings = { ...original(), ...patch };
    if (next.mode !== 'dsh-official') checkApi(settings);
    return { next, patch, settings: effectiveConnection(settings, next) };
  };
  const localCheck = settings => runHarness(settings, { action: 'check', sessionId: randomUUID(), timeoutMs: 8000 }, undefined);
  const action = async (body, signal) => {
    if (runtime.disposed) throw fail('unavailable');
    if (body.action === 'detect') return { executable: await discoverHarness() };
    if (!['save', 'check', 'test'].includes(body.action)) throw fail('invalid-settings');
    if (runtime.saving || probing) throw fail('busy');
    if (body.action === 'check') {
      const next = validate(body.connection); next.executable ||= await discoverHarness();
      if (!validExecutable(next.executable)) throw fail('runtime-missing');
      probing = true;
      try { await localCheck({ harnessExecutable: next.executable }); return { ok: true, code: 'runtime-ready', executable: next.executable }; }
      finally { probing = false; }
    }
    // Claim before the asynchronous discovery step to prevent racing saves/tests.
    if (body.action === 'save') runtime.saving = true; else probing = true;
    let temp;
    try {
      const { next, patch, settings } = await prepare(body);
      if (body.action === 'save') {
        if (next.mode !== 'direct') await localCheck(settings);
        const previous = original(), active = runtime.active;
        active?.abort(); await active?.finished;
        await mkdir(directory(), { recursive: true });
        temp = file + '.' + randomUUID() + '.tmp';
        await writeFile(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
        try {
          if (next.mode !== 'dsh-official') await runtime.store.save(patch);
          await rename(temp, file);
        } catch {
          try { await runtime.store.save({ ...previous, ...(!previous.apiKey && { clearApiKey: true }) }); }
          catch { runtime.paused = true; }
          throw fail('save-failed');
        }
        config = next; loadError = false; runtime.paused = false;
        return { ok: true, code: 'saved' };
      }
      const started = performance.now(), deadline = AbortSignal.timeout(25000), combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      if (next.mode !== 'direct') {
        temp = await mkdtemp(join(tmpdir(), 'ark-connection-'));
        const probeSettings = { ...settings };
        if (next.mode === 'dsh-api' && /^deepseek-/u.test(settings.model) && /^https:\/\/discovery-api\.intern-ai\.org\.cn(?:\/|$)/u.test(settings.baseUrl)) {
          probeSettings.protocol = 'anthropic'; probeSettings.baseUrl = settings.baseUrl.replace(/\/v1\/?$/u, '');
        }
        const answer = await runHarness(probeSettings, { directory: temp, sessionId: randomUUID(),
          prompt: 'Reply with OK.', system: 'This is a public connection test.', maxTokens: 128, effort: 'low', timeoutMs: 25000 }, combined);
        if (!answer.content?.trim()) throw fail('SP_EMPTY');
      } else {
        let answer = '';
        for await (const part of stream({ ...settings, maxTokens: 128, timeoutMs: 25000 },
          { system: 'This is a public connection test.', messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 128 }, combined, createProxyFetch(runtime.fetcher))) answer += part.text || '';
        if (!answer.trim()) throw fail('SP_EMPTY');
      }
      return { ok: true, code: 'connected', elapsedMs: Math.round(performance.now() - started) };
    } finally {
      if (body.action === 'save') runtime.saving = false; else probing = false;
      if (temp) await rm(temp, { recursive: body.action === 'test', force: true }).catch(() => {});
    }
  };
  service = { snapshot, action };
  return service;
}
function errorCode(error) {
  if (['invalid-settings', 'api-incomplete', 'runtime-missing', 'busy', 'save-failed', 'unavailable'].includes(error.code)) return error.code;
  const failure = classifyAiFailure(error);
  if (failure.kind === 'auth' || /AUTH|SIGN_IN|TOKEN_INVALID|invalid_api_key/u.test(error.code || '')) return 'auth';
  if (['quota', 'rate'].includes(failure.kind)) return 'quota';
  if (failure.kind === 'timeout' || error.code === 'ETIMEDOUT') return 'timeout';
  if (/SP_DSH/u.test(error.code || '')) return 'runtime-incompatible';
  return 'connection-failed';
}
export async function aiConnectionRoute(method, raw, signal) {
  const result = (status, obj) => ({ kind: 'json', status, obj });
  if (!service) return result(503, { code: 'unavailable' });
  try {
    if (method === 'GET') return result(200, await service.snapshot());
    if (method !== 'POST') return result(405, { code: 'invalid-settings' });
    let body; try { body = JSON.parse(raw); } catch { throw fail('invalid-settings'); }
    if (!body || typeof body !== 'object') throw fail('invalid-settings');
    return result(200, await service.action(body, signal));
  } catch (error) { return result(error.code === 'busy' ? 409 : 400, { ok: false, code: errorCode(error) }); }
}
