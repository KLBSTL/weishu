import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fingerprint, compileCard, activateLore, automaticSpeaker } from './materials.js';

const libraries = new Map();
const copy = value => structuredClone(value);
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export const directRoom = actor => 'direct:' + actor;
export const actorSpeakerKey = actor => actor.speaker?.name ? fingerprint(actor.speaker.name).slice(0, 12) : 'default';
export const actorSessionKey = (actor, room = directRoom(actor.id)) => actor.id + ':' + room + ':' + (actor.assetId || 'default') + (actor.speaker?.name ? ':' + actorSpeakerKey(actor) : '');
function initial(directory) {
  const data = { version: 1, revision: 0, assets: [], actors: [{ id: 'main', name: '默认人物', assetId: null, overrides: {}, bookIds: [] }],
    bindings: { main: 'main' }, userPersona: { name: '你', description: '' }, preset: { style: '自然口语，先回应本次问题，减少小说旁白。' },
    rooms: [], events: [], states: {} };
  try {
    const card = JSON.parse(readFileSync(join(directory, 'stronghold-persona.json'), 'utf8'));
    if (card) {
      const id = 'card-' + fingerprint(card).slice(0, 24);
      data.assets.push({ id, kind: 'card', name: card.name, card, sourceComplete: false });
      Object.assign(data.actors[0], { name: card.name, assetId: id });
    }
  } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
  return data;
}

export class CompanionLibrary {
  constructor(directory) { this.directory = directory; this.file = join(directory, 'companion-library.json'); this.queue = Promise.resolve(); }
  snapshot() {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.actors) || !Array.isArray(data.assets)) throw error('资料库格式不受支持');
      return data;
    } catch (e) { if (e.code === 'ENOENT') return initial(this.directory); throw e; }
  }
  async update(expectedRevision, edit, { configuration = true } = {}) {
    const pending = this.queue.then(async () => {
      const next = this.snapshot();
      if (expectedRevision !== undefined && expectedRevision !== next.revision) throw error('资料已更新，请重新载入后再保存。', 409);
      const result = await edit(next);
      if (configuration) next.revision++;
      else next.eventRevision = (next.eventRevision || 0) + 1;
      await mkdir(this.directory, { recursive: true });
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      try { await writeFile(temporary, JSON.stringify(next), { flag: 'wx' }); await rename(temporary, this.file); }
      finally { await rm(temporary, { force: true }); }
      return { revision: next.revision, result };
    });
    this.queue = pending.catch(() => {}); return pending;
  }
  actor(pet = 'main', data = this.snapshot(), byId = false) {
    const id = byId ? pet : data.bindings[pet] || pet;
    const actor = data.actors.find(a => a.id === id);
    if (!actor) throw error('未找到该桌宠绑定的人物', 404);
    const source = data.assets.find(a => a.id === actor.assetId)?.card, raw = source?.data || source;
    const legacyName = !['auto', 'explicit'].includes(actor.speakerMode)
      && (actor.overrides?.name && actor.overrides.name !== raw?.name || actor.name !== raw?.name);
    if (!actor.speaker?.name && source && !legacyName && compileCard(source).sceneCard) {
      // Stable migration on read; the next atomic event/config write persists it.
      actor.speaker = automaticSpeaker(source); actor.speakerMode = 'auto';
    }
    return actor;
  }
  card(pet = 'main', data = this.snapshot(), byId = false) {
    const actor = this.actor(pet, data, byId), asset = data.assets.find(a => a.id === actor.assetId);
    if (!asset) return null;
    const raw = copy(asset.card.data || asset.card), overrides = actor.overrides || {};
    for (const key of ['name', 'description', 'personality', 'scenario', 'mes_example']) if (typeof overrides[key] === 'string'
      && !(key === 'name' && ['explicit', 'auto'].includes(actor.speakerMode))) raw[key] = overrides[key];
    raw.extensions = { ...raw.extensions, ark_companion: { ...raw.extensions?.ark_companion } };
    if (compileCard(asset.card).sceneCard) raw.extensions.ark_companion.sceneCard = true;
    if (actor.speaker?.name) raw.extensions.ark_companion.speaker = copy(actor.speaker);
    else if (!['explicit', 'auto'].includes(actor.speakerMode) && (overrides.name && overrides.name !== (asset.card.data || asset.card).name || actor.name !== (asset.card.data || asset.card).name)) {
      raw.extensions.ark_companion.speaker = { name: overrides.name || actor.name, description: overrides.description || '', personality: overrides.personality || '', background: overrides.background || '' };
    }
    if (!raw.extensions.ark_companion.speaker?.name && compileCard(asset.card).sceneCard) {
      raw.extensions.ark_companion.speaker = automaticSpeaker(asset.card);
    }
    if (actor.embeddedBook) raw.character_book = copy(actor.embeddedBook);
    const bound = data.assets.filter(a => a.kind === 'lorebook' && actor.bookIds.includes(a.id));
    if (bound.length) raw.character_book = { ...raw.character_book, entries: [...(raw.character_book?.entries || []), ...bound.flatMap(a => (a.book.entries || []).map(e => ({ ...e, id: a.id + ':' + e.id })))] };
    return raw;
  }
  visibleHistory(actorId, roomId = directRoom(actorId), data = this.snapshot()) {
    if (!roomId.startsWith('direct:')) {
      const room = data.rooms.find(r => r.id === roomId);
      if (!room?.members.includes(actorId)) throw error('人物没有加入这个会话', 403);
    } else if (roomId !== directRoom(actorId)) throw error('不能读取另一人物的私聊', 403);
    const actor = this.actor(actorId, data, true);
    return data.events.filter(e => e.deliveryState !== 'generated' && e.deliveryState !== 'cancelled' && e.roomId === roomId && (!e.audience || e.audience.includes(actorId))
      && (!roomId.startsWith('direct:') || e.cardId === actor.assetId && (e.speakerKey || 'default') === actorSpeakerKey(actor))).slice(-40);
  }
  inspect(pet, question = '', byId = false) {
    const data = this.snapshot(), actor = this.actor(pet, data, byId), card = this.card(pet, data, byId), compiled = compileCard(card);
    return { actor, revision: data.revision, needsSpeaker: compiled.needsSpeaker, speaker: compiled.speaker, candidates: compiled.candidates || [], units: compiled.units,
      idleEligible: compiled.units.filter(u => u.kind === 'background' && u.facet !== 'appearance' && ['self', 'world'].includes(u.ownership) && !['first_mes', 'mes_example', 'personality'].includes(u.title)),
      diagnostics: [...compiled.diagnostics, ...activateLore(compiled, question).diagnostics] };
  }
  async importCard(card, originalBytes, pet = 'main') {
    return this.update(undefined, data => {
      const id = 'card-' + fingerprint(card).slice(0, 24);
      if (!data.assets.some(a => a.id === id)) data.assets.push({ id, kind: 'card', name: card.name || card.data?.name, card: copy(card),
        originalBytes: originalBytes?.toString('base64'), sourceFormat: originalBytes?.[0] === 137 ? 'png' : 'json', sourceComplete: !!originalBytes });
      let actor = data.actors.find(a => a.id === (data.bindings[pet] || pet));
      if (!actor) { actor = { id: randomUUID(), bookIds: [], overrides: {} }; data.actors.push(actor); }
      Object.assign(actor, { assetId: id, name: card.name || card.data?.name, overrides: {},
        speaker: compileCard(card).sceneCard ? automaticSpeaker(card, { random: Math.random }) : null,
        speakerMode: 'auto', embeddedBook: null }); data.bindings[pet] = actor.id;
      return actor;
    });
  }
  async event(actorId, roomId, event) {
    this.visibleHistory(actorId, roomId);
    return this.update(undefined, data => {
      if (event.id && data.events.some(e => e.id === event.id)) return { duplicate: true };
      const actor = this.actor(actorId, data, true);
      if (event.expectedCardId !== undefined && actor.assetId !== event.expectedCardId
        || event.expectedRevision !== undefined && data.revision !== event.expectedRevision
        || event.expectedContextEpoch !== undefined && this.contextEpoch(actorId, data) !== event.expectedContextEpoch) throw error('本次人物或对话已经变化', 409);
      const row = { ...copy(event), id: event.id || randomUUID(), actorId, cardId: actor.assetId, speakerKey: actorSpeakerKey(actor),
        speakerName: compileCard(this.card(actor.id, data, true)).speaker?.name || actor.name, roomId, at: Date.now() };
      data.events.push(row); return row;
    }, { configuration: false });
  }
  contextEpoch(actorId, data = this.snapshot()) {
    const actor = this.actor(actorId, data, true);
    return data.events.findLast(e => e.actorId === actorId && e.cardId === actor.assetId && (e.speakerKey || 'default') === actorSpeakerKey(actor) && e.roomId === directRoom(actorId) && e.type === 'user')?.id || 'start';
  }
  async acknowledgeChat(pet, id) {
    return this.update(undefined, data => {
      const actor = this.actor(pet, data), event = data.events.find(e => e.id === id && e.actorId === actor.id && e.cardId === actor.assetId && (e.speakerKey || 'default') === actorSpeakerKey(actor) && e.roomId === directRoom(actor.id));
      if (!event || event.type !== 'assistant' || event.sourceKind !== 'chat') return { ok: false };
      if (event.deliveryState === 'displayed') return { ok: true, duplicate: true };
      if (event.deliveryState !== 'generated' || event.expectedRevision !== data.revision || event.expectedContextEpoch !== this.contextEpoch(actor.id, data) || Date.now() - event.at > 180000) return { ok: false };
      event.deliveryState = 'displayed'; event.displayedAt = Date.now(); return { ok: true };
    }, { configuration: false }).then(result => result.result);
  }
}

export function companionLibrary(directory) {
  if (!libraries.has(directory)) libraries.set(directory, new CompanionLibrary(directory));
  return libraries.get(directory);
}

export function safeStatePatch(current, schema, patch) {
  if (!Array.isArray(patch) || patch.length > 64) throw error('状态补丁数量无效');
  const next = copy(current);
  for (const item of patch) {
    if (!['add', 'replace'].includes(item.op) || !/^\/(story|actor|room)\/[A-Za-z0-9_-]+$/u.test(item.path || '')) throw error('只允许修改声明的剧情动态状态');
    const [scope, key] = item.path.slice(1).split('/');
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw error('无效状态路径');
    if (scope === 'actor' && ['name', 'identity', 'description', 'system_prompt', 'apiKey', 'model'].includes(key)) throw error('动态状态不能修改人物身份或模型设置');
    const rule = schema?.[scope]?.[key];
    if (!rule || typeof item.value !== rule.type || (rule.type === 'number' && (!Number.isFinite(item.value)
      || (rule.min !== undefined && item.value < rule.min) || (rule.max !== undefined && item.value > rule.max)))
      || (rule.type === 'string' && item.value.length > (rule.maxLength || 1000))) throw error('状态类型或范围不符合Schema');
    next[scope] ??= {}; next[scope][key] = item.value;
  }
  return next;
}
