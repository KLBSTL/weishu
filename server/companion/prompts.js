import { characterContext, compileCard, fingerprint } from './materials.js';
import { SPOKEN_CONTRACT, contextualExamples } from './speech.js';
import { DAILY_EXTENSION_POLICY, memoryPrompt } from './knowledge.js';
import { renderReadOnlyTemplate } from './template.js';
import { isFollowUp, followUpPrompt } from './follow-up.js';
import { t } from '../../shared/i18n.js';

export const PROMPT_TASKS = {
  chat: '先直接回答玩家当前的问题，再以人物自己的方式表达态度。只谈本次问题，不附带未被问到的游戏或身世。',
  background: '亲口聊本次事件的未讲细节。保持前因后果，资料不足时少说，不重复介绍身份。',
  smalltalk: '主动聊一个符合性格的新感受、小事或愿望，区别愿望与过去经历，不假定玩家问过问题。',
  continue: '接着尚未讲完的这件事，补充新的细节或感受，不从头重讲，不回答已结束的旧问题。',
  game: '先回答本次游戏问题，只使用有来源和时间的游戏信息，区分购买意向与已成交操作。',
};
export const VOICE_FIELDS = ['address', 'register', 'rhythm', 'emotion', 'response'];
const labels = { address: '自称与称呼', register: '用词与正式程度', rhythm: '句子节奏', emotion: '表达情绪', response: '回应习惯' };
const valid = value => value && typeof value === 'object' && !Array.isArray(value);
/** A portable, declarative preset: never imports actor IDs, credentials, history or executable plugins. */
export function importPromptPreset(value) {
  if (!valid(value) || value.format !== 'ark-companion-prompt' || value.version !== 1 || !valid(value.settings)
    || ['voice', 'tasks'].some(key => value.settings[key] !== undefined && !valid(value.settings[key]))
    || typeof value.name !== 'string' || value.name.length > 100 || JSON.stringify(value).length > 65536) {
    throw new Error(t('提示预设格式或版本不受支持'));
  }
  return { name: value.name, settings: validatePromptSettings(value.settings) };
}
export function exportPromptPreset(settings, name = '') {
  return { format: 'ark-companion-prompt', version: 1, name: String(name).slice(0, 100), settings: validatePromptSettings(settings) };
}
export function validatePromptSettings(value) {
  if (!valid(value)) throw new Error('提示词设置格式无效');
  const result = { voice: {}, tasks: {}, blocks: [] };
  for (const field of VOICE_FIELDS) if (Object.hasOwn(value.voice || {}, field)) {
    if (typeof value.voice[field] !== 'string' || value.voice[field].length > 1000) throw new Error('表达设置过长');
    result.voice[field] = value.voice[field];
  }
  for (const kind of Object.keys(PROMPT_TASKS)) if (Object.hasOwn(value.tasks || {}, kind)) {
    if (typeof value.tasks[kind] !== 'string' || value.tasks[kind].length > 3000) throw new Error('场景提示过长');
    result.tasks[kind] = value.tasks[kind];
  }
  if (value.blocks !== undefined && (!Array.isArray(value.blocks) || value.blocks.length > 12)) throw new Error('附加提示最多12项');
  const ids = new Set();
  for (const b of value.blocks || []) {
    if (!valid(b) || !/^custom-[\w-]{1,40}$/u.test(b.id) || ids.has(b.id) || typeof b.content !== 'string' || b.content.length > 3000
      || typeof b.enabled !== 'boolean' || !Array.isArray(b.appliesTo) || !b.appliesTo.every(k => Object.hasOwn(PROMPT_TASKS, k))) throw new Error('附加提示格式无效');
    ids.add(b.id); result.blocks.push({ id: b.id, content: b.content, enabled: b.enabled, appliesTo: b.appliesTo,
      order: Math.max(30, Math.min(85, Math.round(Number(b.order) || 60))) });
  }
  return result;
}
/** Portable card defaults are read only while this card is active. */
export function characterPromptLayer(data, actor) {
  const saved = data.promptSettings?.characters?.[actor.characterId];
  if (saved) return { source: 'character', settings: saved };
  const card = data.assets?.find(asset => asset.id === actor.assetId)?.card;
  const preset = (card?.data ?? card)?.extensions?.ark_companion?.prompt_preset;
  if (preset != null) {
    try {
      return { source: 'card', settings: importPromptPreset(preset).settings };
    } catch {
      // Unknown versions and malformed optional settings leave the card usable.
    }
  }
  return { source: 'character', settings: undefined };
}
export function resolvePromptSettings(data, actor, roomId = 'direct:' + actor.id) {
  const store = data.promptSettings || {}, key = actor.characterId + ':' + roomId;
  const character = characterPromptLayer(data, actor);
  const layers = [['global', store.global], [character.source, character.settings], ['room', store.rooms?.[key]]];
  const value = { voice: {}, tasks: {}, blocks: [] }, origins = {};
  for (const [source, layer] of layers) if (layer) {
    for (const field of ['voice', 'tasks']) for (const [k, v] of Object.entries(layer[field] || {})) { value[field][k] = v; origins[field + '.' + k] = source; }
    for (const block of layer.blocks || []) { value.blocks = value.blocks.filter(b => b.id !== block.id); value.blocks.push(block); origins[block.id] = source; }
  }
  return { ...value, origins, revision: fingerprint(value) };
}
export function setPromptLayer(data, actor, scope, settings, roomId = 'direct:' + actor.id) {
  if (!['global', 'character', 'room'].includes(scope)) throw new Error('请选择设置范围');
  const store = data.promptSettings ||= { global: {}, characters: {}, rooms: {} };
  if (scope === 'global') store.global = settings || {};
  else { const map = scope === 'character' ? (store.characters ||= {}) : (store.rooms ||= {});
    const key = scope === 'character' ? actor.characterId : actor.characterId + ':' + roomId;
    if (settings) map[key] = settings; else delete map[key];
  }
}
export function voiceProfile(profile) {
  const card = profile.card?.data || profile.card || {}, speaker = compileCard(profile.card).speaker;
  const text = [...new Set([speaker?.personality, card.personality].filter(Boolean))].join('\n');
  const explicit = [speaker?.description, card.description].filter(Boolean).join('\n').split('\n').filter(l => /^\s*(?:自称|称呼|口吻|语气|说话方式)\s*[:：]/u.test(l)).slice(0, 6).join('\n');
  return [text.slice(0, 1800), explicit, ...VOICE_FIELDS.map(k => profile.promptSettings?.voice?.[k] ? labels[k] + '：' + profile.promptSettings.voice[k] : '')].filter(Boolean).join('\n')
    || '按人物资料自然交谈；没有写明的口吻保持中性，不强加口头禅。';
}
export function compilePromptBlocks(blocks, kind) {
  const unique = new Map();
  for (const b of blocks) if (b.enabled !== false && (!b.appliesTo || b.appliesTo.includes(kind)) && b.content?.trim()) unique.set(b.id, b);
  const ordered = [...unique.values()].sort((a, b) => a.order - b.order), chosen = new Set(), omitted = [];
  const priority = b => b.id.startsWith('contract.') || b.id.startsWith('task.') || b.id === 'dialogue.anchor' ? 0 : ['character.core', 'character.voice', 'memory.relevant'].includes(b.id) ? 1 : 2;
  let used = 0;
  for (const b of [...ordered].sort((a, b) => priority(a) - priority(b) || a.order - b.order)) {
    if (used + b.content.length + 1 > 30000) { omitted.push({ id: b.id, reason: 'character-budget' }); continue; }
    chosen.add(b.id); used += b.content.length + 1;
  }
  const selected = ordered.filter(b => chosen.has(b.id));
  return { system: selected.map(b => b.content).join('\n'), blocks: selected.map(b => ({ ...b, characters: [...b.content].length })), omitted };
}
/** No network, persistence, random draw or state mutation occurs while compiling. */
export function buildPrompt(profile, { question = '', kind = 'chat', memories = [], recent = [], task = '', selected, heard = [], anchor, now, fallbackSystem = '' } = {}) {
  if (!Object.hasOwn(PROMPT_TASKS, kind)) kind = 'chat';
  const raw = profile.card?.data || profile.card || {}, settings = profile.promptSettings || {}, blocks = [];
  const add = (id, order, content, source = 'application') => blocks.push({ id, order, content, source, revision: settings.revision || '', role: 'system', slot: 'system', kind });
  add('contract.speech', 0, SPOKEN_CONTRACT);
  add('contract.facts', 1, DAILY_EXTENSION_POLICY);
  add('character.core', 10, profile.card ? characterContext(profile.card, question, { purpose: ['background', 'smalltalk', 'continue'].includes(kind) ? 'idle' : 'chat',
    userName: profile.userPersona?.name, state: profile.state, contracts: false, includeExamples: false, voiceSeparate: true }) : fallbackSystem, 'character');
  if (profile.card || Object.keys(settings.voice || {}).length) add('character.voice', 20, '【表达方式，保持人物特点；不是每次必须重复的台词】\n' + voiceProfile(profile), 'character');
  if (profile.preset?.style) add('style.legacy', 25, '【表达偏好】' + profile.preset.style, 'global');
  if (profile.userPersona?.description) add('player.persona', 30, '【玩家虚构身份，不是玩家已经说过的话】' + profile.userPersona.description, 'persona');
  add('memory.relevant', 40, memoryPrompt(memories), 'memory');
  if (recent.length) add('dialogue.context', 50, '【近期已展示的承接资料，不是新的提问】\n' + recent.slice(-2).map(r => (r.type || r.role) + '：' + (r.text || r.content || '').slice(0, 320)).join('\n'), 'history');
  if (selected) add('story.progress', 55, '【本次选材与进度】\n' + JSON.stringify({ event: selected.eventId, factIds: selected.factIds, time: selected.timeState,
    covered: heard.length, next: selected.angles?.[Math.min(heard.length, 2)] || '补充一个未讲的细节' }), 'story');
  if (Number.isFinite(now)) add('runtime.present', 70, '【当下】本机时间：' + new Date(now).toString() + '。过去经历与现在的聊天分别理解。', 'clock');
  for (const b of settings.blocks || []) blocks.push({ ...b, role: 'system', slot: 'system', kind, source: settings.origins?.[b.id] || 'character',
    content: renderReadOnlyTemplate(b.content, { char: compileCard(profile.card).speaker?.name, user: profile.userPersona?.name, state: { task: kind, ...profile.state } }) });
  add('task.' + kind, 90, '【本次任务】' + (settings.tasks?.[kind] ?? PROMPT_TASKS[kind]) + (task ? '\n' + task : ''), settings.origins?.['tasks.' + kind] || 'application');
  if (['chat', 'game'].includes(kind) && isFollowUp(question)) add('dialogue.anchor', 95, followUpPrompt(anchor), 'display-receipt');
  const built = compilePromptBlocks(blocks, kind);
  return { ...built, kind, revision: settings.revision || fingerprint(settings), examples: contextualExamples(raw.mes_example, compileCard(profile.card).speaker?.name, question || selected?.text || '', kind),
    diagnostics: (settings.blocks || []).filter(b => /<%|TavernHelper|MVU/iu.test(b.content)).map(b => ({ id: b.id, reason: 'unsupported-executable-template' })) };
}

// Full request text stays in bounded process memory only, never in metrics, exports or SQLite.
const requests = new Map();
export function rememberPromptRequest(key, payload, stage = 'transport') {
  if (!key) return;
  const copy = JSON.parse(JSON.stringify(payload, (name, value) => {
    if (['apiKey', 'key', 'Authorization', 'reasoning_content'].includes(name)) return undefined;
    if (Array.isArray(value)) return value.filter(v => !['thinking', 'redacted_thinking'].includes(v?.type));
    return value;
  }));
  if (JSON.stringify(copy).length > 200000) return;
  const rows = requests.get(key) || []; rows.push({ stage, at: Date.now(), payload: copy });
  requests.delete(key); requests.set(key, rows.slice(-4));
  if (requests.size > 16) requests.delete(requests.keys().next().value);
}
export const lastPromptRequests = key => structuredClone(requests.get(key) || []);
export const forgetPromptRequests = key => requests.delete(key);
