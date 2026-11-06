import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { companionLibrary, safeStatePatch, directRoom, actorSessionKey } from './library.js';
import { renderReadOnlyTemplate } from './template.js';
import { companionDirectory } from './profile.js';
import { parsePersona, createPersonaStore } from '../desktop/persona.js';
import { noteConversationActivity } from '../desktop/idle-chat.js';
import { cancelConversation, conversationMetrics } from '../desktop/conversation.js';
import { groupDirector } from './turns.js';
import { compileCard } from './materials.js';

const result = (status, obj) => ({ kind: 'json', status, obj });
const validId = value => typeof value === 'string' && /^[\p{L}\p{N}_:-]{1,80}$/u.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const bad = message => { throw Object.assign(new Error(message), { status: 400 }); };
const text = (value, max = 16000) => { if (typeof value !== 'string' || value.length > max) bad('文字内容无效或过长'); return value; };

export function staticCardDocument(html) {
  const safe = String(html).replace(/<(script|iframe|object|embed|form|meta|base|link)\b[^>]*>[\s\S]*?<\/\1>/giu, '')
    .replace(/<\/?(?:script|iframe|object|embed|form|meta|base|link)\b[^>]*>/giu, '')
    .replace(/\s(?:on[\w-]+|href|src|action|formaction|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, '');
  return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src data:; form-action \'none\'; base-uri \'none\'"></head><body>' + safe + '</body></html>';
}

/** Sensitive material only travels through authenticated POST; GET serves static UI only. */
export async function libraryRoute(url, rest, method, raw, signal, deps = {}) {
  const staticFiles = { 'stronghold/library-ui': 'manager.html', 'stronghold/library-client.js': 'manager.js', 'stronghold/library-style.css': 'manager.css',
    'stronghold/library-playing.webm': '../desktop/playing.webm' };
  if (staticFiles[rest]) return method === 'GET' ? { kind: 'file', file: fileURLToPath(new URL('./' + staticFiles[rest], import.meta.url)),
    contentType: rest.endsWith('.webm') ? 'video/webm' : rest.endsWith('.js') ? 'text/javascript' : rest.endsWith('.css') ? 'text/css' : 'text/html' } : result(405, { error: '只读页面' });
  if (rest !== 'stronghold/library') return result(404, { error: '未知资料接口' });
  if (method !== 'POST') return result(405, { error: '资料接口必须使用POST' });
  const dir = companionDirectory(), library = companionLibrary(dir);
  let body; try { body = JSON.parse(raw); } catch { return result(400, { error: '请求格式错误' }); }
  if (!body || !validId(body.pet || 'main')) return result(400, { error: '无效桌宠身份' });
  const pet = body.pet || 'main', action = body.action;
  try {
    if (action === 'open') {
      const runtime = JSON.parse(readFileSync(join(dir, 'standalone-runtime.json'), 'utf8'));
      if (runtime.pid !== process.pid || !/^[A-Za-z0-9_-]{43}$/u.test(runtime.token) || !Number.isInteger(runtime.port)) bad('请通过独立桌宠启动脚本打开资料管理');
      return result(200, { url: `http://127.0.0.1:${runtime.port}/dsh-pet-7340/stronghold/library-ui#token=${runtime.token}&pet=${encodeURIComponent(pet)}` });
    }
    if (action === 'snapshot') {
      const data = library.snapshot();
      return result(200, { ...data, actors: data.actors.map(actor => { const compiled = compileCard(library.card(actor.id, data, true));
        return { ...actor, sessionKey: actorSessionKey(actor), resolvedSpeaker: compiled.needsSpeaker ? null : compiled.speaker };
      }), assets: data.assets.map(({ originalBytes: _bytes, ...asset }) => asset), events: data.events.slice(-80),
        embeddedBooks: data.actors.flatMap(actor => {
          const source = data.assets.find(a => a.id === actor.assetId)?.card, book = actor.embeddedBook || (source?.data || source)?.character_book;
          return book ? [{ id: 'embedded:' + actor.id, actorId: actor.id, name: (actor.speaker?.name || actor.name) + (actor.embeddedBook ? ' · 卡内（本地覆盖）' : ' · 卡内'), book }] : [];
        }),
        capabilities: { materialVersion: 2, staticPreview: true, readOnlyTemplates: true, arbitraryScripts: false, statePatches: true, groupTurns: true, speechBatches: true }, metrics: conversationMetrics(), petIds: deps.petIds?.() || Object.keys(data.bindings), group: groupDirector(dir).status() });
    }
    if (action === 'analyze-card') {
      const asset = library.snapshot().assets.find(a => a.kind === 'card' && a.id === body.assetId);
      if (!asset) bad('角色卡不存在');
      const compiled = compileCard(asset.card);
      return result(200, { needsSpeaker: compiled.needsSpeaker, speaker: compiled.speaker, candidates: compiled.candidates || [] });
    }
    if (action === 'ack-chat') return result(200, await library.acknowledgeChat(pet, body.deliveryId));
    if (action === 'inspect') return result(200, library.inspect(body.actorId || pet, text(body.question || '', 2000), !!body.actorId));
    if (action === 'preview') {
      const data = library.snapshot(), actor = library.actor(body.actorId || pet, data, !!body.actorId), room = body.roomId || directRoom(actor.id);
      library.visibleHistory(actor.id, room, data);
      return result(200, { html: staticCardDocument(renderReadOnlyTemplate(text(body.html || '', 128000), {
        char: actor.name, user: data.userPersona.name, state: data.states[actorSessionKey(actor, room)]?.value || {},
      })) });
    }
    if (action === 'export') {
      if (body.actorId && !body.original) {
        const data = library.snapshot(), actor = library.actor(body.actorId, data, true);
        const card = library.card(actor.id, data, true), speaker = card?.extensions?.ark_companion?.speaker;
        if (speaker?.name) Object.assign(card, { name: speaker.name, description: speaker.description || card.description, personality: speaker.personality || card.personality });
        return result(200, { name: speaker?.name || actor.name, document: { spec: 'chara_card_v3', spec_version: '3.0', data: card } });
      }
      const data = library.snapshot(), asset = data.assets.find(a => a.id === body.assetId);
      if (!asset) bad('资料不存在');
      if (body.original && asset.originalBytes) return result(200, { file: asset.originalBytes, name: asset.name, extension: asset.sourceFormat || 'json', original: true });
      return result(200, { name: asset.name, document: asset.kind === 'card' ? { spec: 'chara_card_v3', spec_version: '3.0', data: asset.card.data || asset.card } : asset.book });
    }
    if (action === 'import-card') {
      if (typeof body.file !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(body.file)) bad('请选择JSON或PNG角色卡');
      const bytes = Buffer.from(body.file, 'base64'), card = parsePersona(bytes);
      const saved = await library.importCard(card, bytes, pet);
      if (pet === 'main') await (await createPersonaStore(join(dir, 'stronghold-persona.json'))).select(bytes);
      noteConversationActivity(); await cancelConversation('SP_PERSONA_CHANGED');
      return result(200, saved);
    }
    if (action === 'delivery') {
      const actor = library.actor(pet);
      return result(200, { actor: { id: actor.id, name: actor.name }, delivery: groupDirector(dir).delivery(pet), group: groupDirector(dir).status() });
    }
    if (action === 'ack') return result(200, await groupDirector(dir).acknowledge(pet, body.deliveryId));
    if (action === 'stop-group') { groupDirector(dir).stop(); return result(200, { ok: true }); }
    if (action === 'start-group') {
      noteConversationActivity();
      const started = await groupDirector(dir).start({ roomId: body.roomId, topic: text(body.topic || '', 2000), limit: body.limit || 2 }, deps);
      return result(200, started);
    }
    const saved = await library.update(body.expectedRevision, data => {
      if (action === 'save-actor') {
        const value = body.actor || {}, name = text(value.name || '', 80).trim(); if (!name) bad('请填写人物名字');
        let actor = data.actors.find(a => a.id === body.actorId);
        if (!actor) { if (data.actors.length >= 16) bad('目前最多16个人物'); actor = { id: randomUUID() }; data.actors.push(actor); }
        if (value.assetId && !data.assets.some(a => a.id === value.assetId && a.kind === 'card')) bad('原卡不存在');
        const overrides = { ...actor.overrides };
        for (const k of ['name', 'description', 'personality', 'scenario', 'background', 'mes_example']) if (Object.hasOwn(value.overrides || {}, k)) overrides[k] = text(value.overrides[k]);
        overrides.name = name;
        if (value.assetId !== actor.assetId) { actor.embeddedBook = null; actor.speaker = null; }
        if (Object.hasOwn(value, 'speakerName')) {
          actor.speakerMode = 'explicit';
          actor.speaker = value.speakerName?.trim() ? {
            name: text(value.speakerName.trim(), 80), description: overrides.description || '', personality: overrides.personality || '', background: overrides.background || '',
          } : null;
        }
        Object.assign(actor, { name, assetId: value.assetId || null, overrides, bookIds: (value.bookIds || []).filter(id => data.assets.some(a => a.kind === 'lorebook' && a.id === id)) });
        if (!actor.assetId) {
          const card = parsePersona(Buffer.from(JSON.stringify({ name, description: overrides.description || '自定义人物。', personality: overrides.personality })));
          const id = 'card-' + randomUUID(); data.assets.push({ id, kind: 'card', name, card, sourceComplete: true }); actor.assetId = id;
        }
        return actor;
      }
      if (action === 'bind') {
        if (!data.actors.some(a => a.id === body.actorId)) bad('人物不存在');
        data.bindings[pet] = body.actorId; return { pet, actorId: body.actorId };
      }
      if (action === 'save-book' || action === 'save-embedded-book') {
        const book = structuredClone(body.book || {});
        if (book.entries && !Array.isArray(book.entries)) book.entries = Object.entries(book.entries).map(([id, entry]) => ({ ...entry, id: entry.id ?? entry.uid ?? id }));
        const normalized = parsePersona(Buffer.from(JSON.stringify({ name: '世界书', description: '独立世界书。', character_book: book }))).character_book;
        if (action === 'save-embedded-book') {
          const actor = library.actor(body.actorId, data, true); actor.embeddedBook = normalized;
          return { id: 'embedded:' + actor.id, actorId: actor.id, name: actor.name + ' · 卡内（本地覆盖）', book: normalized };
        }
        let asset = data.assets.find(a => a.kind === 'lorebook' && a.id === body.assetId);
        if (!asset) { asset = { id: 'book-' + randomUUID(), kind: 'lorebook' }; data.assets.push(asset); }
        Object.assign(asset, { name: text(body.name || book.name || '世界书', 120), book: normalized }); return asset;
      }
      if (action === 'save-persona') {
        data.userPersona = { name: text(body.persona?.name || '你', 80), description: text(body.persona?.description || '', 4000) };
        data.preset = { style: text(body.style || '', 4000) }; return data.userPersona;
      }
      if (action === 'save-room') {
        const members = [...new Set(body.members || [])];
        if (members.length < 2 || members.length > 4 || !members.every(id => data.actors.some(a => a.id === id))) bad('请选择2–4个已有人物');
        let room = data.rooms.find(r => r.id === body.roomId);
        if (!room) { room = { id: 'room-' + randomUUID() }; data.rooms.push(room); }
        Object.assign(room, { name: text(body.name || '角色客厅', 80), members, turnLimit: 3 }); return room;
      }
      if (action === 'state-schema') {
        const actor = library.actor(body.actorId || pet, data, !!body.actorId), schema = body.schema;
        const room = body.roomId || directRoom(actor.id), stateKey = actorSessionKey(actor, room);
        library.visibleHistory(actor.id, room, data);
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) bad('Schema格式错误');
        for (const [scope, fields] of Object.entries(schema)) {
          if (!['actor', 'story', 'room'].includes(scope) || !fields || typeof fields !== 'object' || Array.isArray(fields)) bad('Schema作用域无效');
          for (const [key, rule] of Object.entries(fields)) if (!validId(key) || !['number', 'string', 'boolean'].includes(rule?.type)) bad('Schema字段无效');
        }
        data.states[stateKey] = { revision: (data.states[stateKey]?.revision || 0) + 1, schema, value: data.states[stateKey]?.value || {} }; return data.states[stateKey];
      }
      if (action === 'state-patch') {
        const actor = library.actor(body.actorId || pet, data, !!body.actorId), room = body.roomId || directRoom(actor.id);
        library.visibleHistory(actor.id, room, data);
        const state = data.states[actorSessionKey(actor, room)];
        if (!state || state.revision !== body.stateRevision) throw Object.assign(new Error('状态已变化，请重新读取'), { status: 409 });
        state.value = safeStatePatch(state.value, state.schema, body.patch); state.revision++; return state;
      }
      bad('未支持的资料操作');
    });
    // Main game reader consumes the same selected profile, while partner edits stay isolated.
    const main = library.card('main');
    if (main) await (await createPersonaStore(join(dir, 'stronghold-persona.json'))).select(Buffer.from(JSON.stringify(main)));
    noteConversationActivity(); groupDirector(dir).stop(); await cancelConversation('SP_PERSONA_CHANGED');
    return result(200, saved);
  } catch (e) { return result(e.status || 400, { error: e.status === 500 ? '资料保存失败' : e.message }); }
}
