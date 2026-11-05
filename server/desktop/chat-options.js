import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_CHAT_OPTIONS, chatOptionsPrompt, replyResult } from '../match/replyStyle.js';
import { localizeGenerationResult } from './ai-request.js';

const queues = new Map();
export function chatOptionsFile() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet', 'stronghold-chat-options.json');
}
function valid(value) {
  return value && ['daily', 'unlimited'].includes(value.mode)
    && Number.isInteger(value.maxChars) && value.maxChars >= 1 && value.maxChars <= 2000;
}
export function readChatOptions(file = chatOptionsFile()) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (valid(value)) return { mode: value.mode, maxChars: value.maxChars };
  } catch { /* missing or invalid preferences use the default */ }
  return { ...DEFAULT_CHAT_OPTIONS };
}
export async function saveChatOptions(patch, file = chatOptionsFile()) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
    || !Object.keys(patch).length || Object.keys(patch).some(key => !['mode', 'maxChars'].includes(key))
    || !valid({ ...DEFAULT_CHAT_OPTIONS, ...patch })) throw new Error('请选择有效模式和 1–2000 的整数回复字数');
  const run = (queues.get(file) || Promise.resolve()).then(async () => {
    const next = { ...readChatOptions(file), ...patch };
    const temp = file + '.' + randomUUID() + '.tmp';
    await mkdir(dirname(file), { recursive: true });
    try { await writeFile(temp, JSON.stringify(next), { flag: 'wx' }); await rename(temp, file); }
    finally { await rm(temp, { force: true }); }
    return next;
  });
  const tail = run.catch(() => {});
  queues.set(file, tail);
  void tail.finally(() => { if (queues.get(file) === tail) queues.delete(file); });
  return run;
}

export async function chatOptionsRoute(method, raw = '', file = chatOptionsFile()) {
  const result = (status, obj) => ({ kind: 'json', status, obj });
  if (method === 'GET') return result(200, readChatOptions(file));
  if (method !== 'POST') return result(405, { error: '请使用 POST 修改对话模式' });
  if (Buffer.byteLength(raw) > 2048) return result(413, { error: '设置内容过长' });
  let patch;
  try { patch = JSON.parse(raw); } catch { return result(400, { error: '设置格式无效' }); }
  try { return result(200, await saveChatOptions(patch, file)); }
  catch (error) { return result(error.code ? 500 : 400, { error: error.code ? '设置保存失败，请稍后重试' : error.message }); }
}

export async function generatePetChat(generate, input) {
  const options = readChatOptions();
  return replyResult(localizeGenerationResult(await generate({ ...input, system: input.system + chatOptionsPrompt(options),
    ...(options.mode === 'daily' && { pool: [] }) })), options);
}
export async function generatePetWhisper(generate, ctx, input) {
  const options = readChatOptions();
  const request = { ...input, system: input.system + chatOptionsPrompt(options) };
  if (options.mode === 'daily') delete request.meme;
  return replyResult(localizeGenerationResult(await generate(ctx, request)), options);
}
