import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_CHAT_OPTIONS } from '../match/replyStyle.js';

const queues = new Map();
export function chatOptionsFile() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet', 'stronghold-chat-options.json');
}
function valid(value) {
  return value && ['daily', 'unlimited'].includes(value.mode)
    && Number.isInteger(value.maxChars) && value.maxChars >= 1 && value.maxChars <= 2000
    && ['low', 'medium', 'high'].includes(value.effort) && typeof value.proactive === 'boolean'
    && [10, 15, 20, 30, 45, 60].includes(value.idleSeconds)
    && [15, 20, 30, 60, 120].includes(value.bubbleSeconds);
}
export function readChatOptions(file = chatOptionsFile()) {
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const value = Object.fromEntries(Object.keys(DEFAULT_CHAT_OPTIONS).map(key => [key, saved[key] ?? DEFAULT_CHAT_OPTIONS[key]]));
    if (valid(value)) return value;
  } catch { /* old or missing preferences use defaults */ }
  return { ...DEFAULT_CHAT_OPTIONS };
}
export async function saveChatOptions(patch, file = chatOptionsFile()) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length
    || Object.keys(patch).some(key => !Object.hasOwn(DEFAULT_CHAT_OPTIONS, key))
    || !valid({ ...DEFAULT_CHAT_OPTIONS, ...patch })) throw new Error('请选择有效的对话模式、强度、碎碎念间隔、气泡时长和 1–2000 的整数回复字数');
  const run = (queues.get(file) || Promise.resolve()).then(async () => {
    const next = { ...readChatOptions(file), ...patch }, temp = file + '.' + randomUUID() + '.tmp';
    await mkdir(dirname(file), { recursive: true });
    try { await writeFile(temp, JSON.stringify(next), { flag: 'wx' }); await rename(temp, file); }
    finally { await rm(temp, { force: true }); }
    return next;
  });
  const tail = run.catch(() => {}); queues.set(file, tail);
  void tail.finally(() => { if (queues.get(file) === tail) queues.delete(file); });
  return run;
}
