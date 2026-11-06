import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { companionLibrary } from '../companion/library.js';
import { createPersonaStore, parsePersona, MAX_PERSONA_BODY_BYTES } from './persona.js';
import { cancelConversation } from './conversation.js';
import { noteConversationActivity } from './idle-chat.js';

/** The HTTP plugin also reads the standalone listener's bounded replay stream. */
export async function readPersonaBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_PERSONA_BODY_BYTES) throw Object.assign(new Error('request body too large'), { code: 'body-too-large' });
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Return the upstream RouteResult shape for both the authenticated HTTP route and native helper pipe. */
export function createPersonaRoute(file, log = console) {
  const store = createPersonaStore(file, log);
  const result = (status, obj) => ({ kind: 'json', status, obj });
  return async (method, raw = '') => {
    const personas = await store;
    if (method === 'GET') return result(200, { name: personas.get()?.name ?? '默认肥鱼' });
    if (method !== 'POST') return result(405, { error: '请使用 POST 切换人设' });
    if (Buffer.byteLength(raw) > MAX_PERSONA_BODY_BYTES) return result(413, { error: '请选择 8 MB 以内的角色卡' });
    let body;
    try { body = JSON.parse(raw); } catch { /* invalid JSON */ }
    if (!body || (body.reset !== true && (typeof body.file !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(body.file)))) {
      return result(400, { error: '请选择有效的 JSON 或 PNG 角色卡' });
    }
    try {
      const bytes = body.reset === true ? null : Buffer.from(body.file, 'base64');
      const card = bytes ? parsePersona(bytes) : null;
      const library = companionLibrary(dirname(file));
      if (card) await library.importCard(card, bytes, body.pet || 'main');
      else await library.update(undefined, data => {
        const actor = library.actor(body.pet || 'main', data); actor.assetId = null; actor.overrides = {}; actor.name = '默认人物'; actor.speaker = null; actor.embeddedBook = null;
      });
      if (!body.pet || body.pet === 'main') await personas.select(bytes);
      noteConversationActivity();
      await cancelConversation('SP_PERSONA_CHANGED');
      return result(200, { name: card?.name ?? '默认肥鱼' });
    } catch (error) {
      log.warn('[desktop] Persona selection failed');
      return result(error.code ? 500 : 400, { error: error.code ? '人设保存失败，请稍后重试' : error.message });
    }
  };
}

let handle;
export function standalonePersonaRoute(method, body) {
  handle ??= createPersonaRoute(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet', 'stronghold-persona.json'));
  return handle(method, body);
}
