import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { companionLibrary } from '../companion/library.js';

export const MAX_CARD_BYTES = 8 * 1024 * 1024;
export const MAX_PERSONA_BODY_BYTES = Math.ceil(MAX_CARD_BYTES / 3) * 4 + 1024;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const warned = new Set();

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('角色卡内容无效');
  const data = raw.data ?? raw;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('角色卡内容无效');
  // Retain standard/community metadata; execution and prompt projection remain separate.
  const card = structuredClone(data);
  for (const key of ['name', 'description', 'personality', 'scenario', 'system_prompt',
    'post_history_instructions', 'mes_example', 'first_mes']) {
    if (data[key] !== undefined && typeof data[key] !== 'string') throw new Error('角色卡字段格式无效');
    card[key] = (data[key] || '').trim();
  }
  if (!card.description && !card.personality && !card.scenario && !card.mes_example && !card.first_mes) throw new Error('角色卡缺少性格或说话示例');
  if (!card.name) card.name = '自定义人设';
  if (card.name.length > 80 || ['description', 'personality', 'scenario', 'system_prompt', 'post_history_instructions', 'mes_example', 'first_mes'].reduce((n, key) => n + card[key].length, 0) > 32000) throw new Error('角色卡正文过长，请精简到 32000 字以内');
  const depth = raw.data?.extensions?.depth_prompt?.prompt ?? data.extensions?.depth_prompt?.prompt ?? data.depth_prompt;
  if (typeof depth === 'string') card.depth_prompt = depth.slice(0, 4000);
  const book = data.character_book;
  if (book !== undefined) {
    if (!book || !Array.isArray(book.entries) || book.entries.length > 200) throw new Error('角色卡世界书格式无效或条目过多');
    let chars = 0;
    const keys = values => Array.isArray(values)
      ? values.filter(value => typeof value === 'string').slice(0, 32).map(value => value.slice(0, 160)) : [];
    card.character_book = { ...structuredClone(book), entries: book.entries.map((entry, index) => {
      if (!entry || typeof entry.content !== 'string') throw new Error('角色卡世界书条目格式无效');
      chars += entry.content.length;
      return { ...structuredClone(entry), content: entry.content, keys: keys(entry.keys ?? entry.key), secondary_keys: keys(entry.secondary_keys ?? entry.keysecondary),
        enabled: entry.enabled !== false && entry.disable !== true, constant: entry.constant === true,
        selective: entry.selective === true,
        insertion_order: Number.isFinite(Number(entry.insertion_order)) ? Number(entry.insertion_order) : index };
    }) };
    if (chars > 512000) throw new Error('角色卡世界书过长，请精简到 512000 字以内');
  }
  return Object.freeze(card);
}

/** SillyTavern V1/V2/V3 JSON and PNG tEXt metadata, matching the local Luker reader. */
export function parsePersona(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_CARD_BYTES) throw new Error('请选择 8 MB 以内的角色卡');
  if (!bytes.subarray(0, 8).equals(PNG)) {
    try { return normalize(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''))); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error('文件不是有效的 JSON 或 PNG 角色卡', { cause: error });
      throw error;
    }
  }
  const metadata = new Map();
  let end = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (size > bytes.length - offset - 12) throw new Error('PNG 文件不完整');
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (kind === 'tEXt') {
      const data = bytes.subarray(offset + 8, offset + 8 + size);
      const zero = data.indexOf(0);
      const key = data.subarray(0, zero).toString('ascii').toLowerCase();
      if (zero > 0 && ['chara', 'ccv3'].includes(key)) metadata.set(key, data.subarray(zero + 1).toString('ascii'));
    }
    offset += size + 12;
    if (kind === 'IEND') { end = true; break; }
  }
  if (!end) throw new Error('PNG 文件不完整');
  const encoded = metadata.get('ccv3') || metadata.get('chara');
  if (!encoded) throw new Error('PNG 内没有 SillyTavern 角色卡数据');
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new Error('PNG 角色卡编码无效');
  return parsePersona(Buffer.from(encoded, 'base64'));
}

/** Both the standalone host and the game read the latest atomically saved choice. */
export function readSelectedPersona(file, log = console) {
  try {
    if (basename(file) === 'stronghold-persona.json' && (existsSync(join(dirname(file), 'companion-library.json')) || existsSync(join(dirname(file), 'companion.sqlite')))) {
      const bound = companionLibrary(dirname(file)).card('main');
      return bound ? normalize(bound) : null;
    }
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return raw === null ? null : normalize(raw);
  } catch (error) {
    if (error.code !== 'ENOENT' && !warned.has(file)) {
      warned.add(file);
      log.warn('[desktop] Saved persona could not be read. Using the default voice.');
    }
    return null;
  }
}

export async function createPersonaStore(file, log = console) {
  let queue = Promise.resolve();
  return {
    get: () => readSelectedPersona(file, log),
    async select(bytes) {
      const next = bytes === null ? null : parsePersona(bytes);
      const save = queue.then(async () => {
        await mkdir(dirname(file), { recursive: true });
        const temporary = file + '.' + randomBytes(8).toString('hex') + '.tmp';
        try {
          await writeFile(temporary, JSON.stringify(next), { flag: 'wx' });
          await rename(temporary, file);
        } finally { await rm(temporary, { force: true }); }
        return next;
      });
      queue = save.catch(() => {});
      return save;
    },
  };
}
