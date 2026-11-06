import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assistantDataDir, withConversationScope } from './conversation.js';
import { readChatOptions } from './chat-preferences.js';
import { chatOptionsPrompt, replyResult } from '../match/replyStyle.js';
import { readSelectedPersona } from './persona.js';
import { classifyAiFailure, normalizeAiFailure } from './ai-request.js';
import { StoryMemory, storyCatalog, storyKey, storySimilarity } from './idle-stories.js';
import { randomUUID } from 'node:crypto';
import { compileCard, characterContext, hasInventedUserHistory } from '../companion/materials.js';
import { petProfile } from '../companion/profile.js';
import { companionLibrary, directRoom } from '../companion/library.js';
import { batchPrompt, parseSpeechBatch, batchGroundingProblem } from '../companion/batches.js';
import { IdleCache } from './idle-cache.js';
let batchGenerating = null;

const personaVersion = () => { try { const s = statSync(join(assistantDataDir(), 'stronghold-persona.json')); return s.mtimeMs + ':' + s.size; } catch { return ''; } };
const memoryFile = () => join(assistantDataDir(), 'stronghold-idle-memory.json');
const characters = new Intl.Segmenter('zh', { granularity: 'grapheme' });
const textLength = text => Array.from(characters.segment(text)).length;
export function chooseIdleStyle(random = Math.random, manual = false) {
  if (manual) return { minChars: 50, maxChars: 100, grounded: true };
  const short = random() < .4;
  return { minChars: short ? 1 : 50, maxChars: short ? 49 : 100, grounded: random() < .8 };
}
export function extractStorySeeds(card) {
  const compiled = compileCard(card);
  const rows = compiled.units.filter(row => row.kind === 'background' && ['self', 'world'].includes(row.ownership)
    && row.facet !== 'appearance' && !['mes_example', 'first_mes', 'personality'].includes(row.title));
  const narrative = rows.filter(row => !(row.path === '/description' && row.start === 0 && row.text.length < 160
    && !/小时候|曾经|那年|学生|有一次|有一年|过去|第一次/u.test(row.text)));
  return (narrative.length ? narrative : rows).flatMap(row => {
    const text = row.text.replaceAll('{{char}}', compiled.speaker?.name || '当前人物').replaceAll('{{user}}', '你');
    return row.facet === 'personality' ? ['对此习惯的感受', '眼下一个小想法', '明确是假想的小计划'].map(angle => '【性格/习惯，不是过去事件；角度：' + angle + '】' + text) : [text];
  });
}
function readRecent(pet = 'main') {
  try {
    const saved = JSON.parse(readFileSync(pet === 'main' ? memoryFile() : join(assistantDataDir(), 'idle-' + Buffer.from(pet).toString('hex') + '.json'), 'utf8'));
    if (saved.version === 2) {
      const card = petProfile(pet).card;
      const key = card ? storyKey(card) : saved.activeKey?.startsWith('default-') ? saved.activeKey : null;
      return (saved.cards?.[key]?.recent || []).filter(row => typeof row.text === 'string').slice(-48).map(row => row.text);
    }
    if (saved.persona === personaVersion() && Array.isArray(saved.lines)) return saved.lines.filter(x => typeof x === 'string').slice(-6);
  } catch { /* no proactive history yet */ }
  return [];
}
export function displayedStoryEvidence(card, history = []) {
  const shown = history.findLast(event => event.type === 'assistant' && event.sourceKind === 'idle' && event.deliveryState === 'displayed');
  const selected = shown && storyCatalog(extractStorySeeds(card)).find(row => row.topic === shown.topicId);
  return selected ? '\n【刚才主动话题的原始证据，仅用于承接】\n' + selected.text
    + '\n保持原文的时间与完成状态：过去经历不能改成现在尚未完成的计划；已展示台词中的扩写不是新增正史。只据玩家真正的问题续说，不虚构后续事件。' : '';
}
export function recentIdleContext(pet = 'main', question = '') {
  const lines = readRecent(pet).slice(-6);
  const profile = petProfile(pet);
  const evidence = /刚才|继续|接着|后来|那件事|那个故事/u.test(question)
    ? displayedStoryEvidence(profile.card, profile.library?.visibleHistory(profile.actorId)) : '';
  return (lines.length ? '\n【最近自己主动说过的话，不是玩家发言】\n' + lines.join('\n') : '') + evidence;
}

/** Renderer idle time is checked again here: multiple surfaces cannot trigger duplicate requests. */
export class IdleChat {
  constructor({ now = Date.now, options = readChatOptions, stamp = personaVersion, read = readRecent, save = () => {}, random = Math.random, stories = new StoryMemory(), cache } = {}) {
    Object.assign(this, { now, options, stamp, read, save, random, stories, cache });
    this.lastActivity = now(); this.lastManual = -Infinity; this.pending = null;
    this.ready = null; this.localReady = null; this.retryAt = 0; this.prefetching = false;
  }
  stop() { this.pending?.abort(); }
  activity() { this.lastActivity = this.now(); this.ready = null; this.localReady = null; this.stop(); }
  warmPacket(input, { manual, prepare }) {
    if (!this.cache || this.ready && this.ready.stamp === this.stamp() && this.ready.expires >= this.now()) return null;
    const options = this.options(), due = this.lastActivity + (options.idleSeconds || 30) * 1000;
    if (!manual && (!options.proactive || !prepare && this.now() < due)) return { prepared: true };
    if (this.localReady?.stamp !== this.stamp() || this.localReady?.expires < this.now()) this.localReady = null;
    if (!this.localReady) {
      const row = this.cache.warm(input)[0];
      if (!row) return this.pending || this.prefetching || this.now() < this.retryAt
        ? { prepared: true, retryAfterMs: Math.max(1000, this.retryAt - this.now()) } : null;
      this.localReady = { ...row, stamp: this.stamp(), input, expires: this.now() + 180000 };
    }
    if (!manual && this.now() < due) return { prepared: true };
    const row = this.localReady;
    return { text: row.text, deliveryId: row.id, origin: row.origin, segmentIndex: 0, segmentsTotal: 1, cacheHit: true };
  }
  async prefetch(getInput, generate) {
    if (this.ready && (this.ready.stamp !== this.stamp() || this.ready.expires < this.now())) this.ready = null;
    if (this.pending || this.prefetching || this.ready || this.now() < this.retryAt) return;
    this.prefetching = true;
    try {
      const input = await getInput(); if (!input || this.cache?.warm(input).some(row => row.origin === 'model-cache')) return;
      const out = await this.run(async () => input, generate, undefined, { prepare: true, prefetch: true });
      if (out.error || out.reason === 'busy') this.retryAt = this.now() + (out.failure?.kind === 'rate' ? 30000 : 15000);
    } catch { this.retryAt = this.now() + 15000; }
    finally { this.prefetching = false; }
  }
  acknowledge(id) {
    const local = this.localReady;
    if (local?.id === id) {
      if (local.committing || local.stamp !== this.stamp() || local.expires < this.now()) return { ok: false };
      local.committing = true;
      return (async () => { try {
        await local.input.onDisplayed?.({ id, text: local.text, sourceKind: local.origin === 'local' ? 'idle-local' : 'idle',
          topicId: local.topicId, topicFinal: local.topicFinal });
        this.cache.consume(local.input, id, local.text);
        if (this.localReady === local) this.localReady = null;
        this.lastActivity = this.now(); return { ok: true };
      } catch { local.committing = false; return { ok: false }; } })();
    }
    const ready = this.ready;
    if (!ready || ready.id !== id || ready.stamp !== this.stamp() || ready.expires < this.now()) return { ok: false };
    if (ready.batch) return this.commitBatch(ready);
    this.stories.record(ready.entry, ready.selected, ready.text, ready.catalog);
    try { this.save(ready.entry.recent.map(row => row.text)); } catch { /* history remains in durable story memory */ }
    this.ready = null; this.lastActivity = this.now(); return { ok: true };
  }
  packet(ready, cacheHit = true) {
    return { text: ready.text, deliveryId: ready.id, batchId: ready.batch.id, segmentIndex: ready.index,
      segmentsTotal: ready.batch.segments.length, sourceId: ready.selected.id, grounded: ready.batch.grounded, target: ready.batch.segments[ready.index].target, cacheHit };
  }
  async commitBatch(ready) {
    if (ready.committing) return { ok: false };
    ready.committing = true;
    try {
      const final = ready.index + 1 === ready.batch.segments.length;
      await ready.onDisplayed?.({ id: ready.id, text: ready.text, topicId: ready.selected.topic, topicFinal: final && !ready.batch.incomplete, batchId: ready.batch.id, segmentIndex: ready.index });
      if (ready.cacheInput) this.cache?.consume(ready.cacheInput, ready.id, ready.text);
      this.stories.recordPart(ready.entry, ready.selected, ready.text, { id: ready.id, final: final && !ready.batch.incomplete });
      try { this.save(ready.entry.recent.map(row => row.text)); } catch { /* Durable timeline is authoritative. */ }
      if (this.ready === ready) {
        this.lastActivity = this.now();
        const next = ready.batch.segments[ready.index + 1];
        this.ready = !final && ready.stamp === this.stamp() ? { ...ready, committing: false, index: next.index, id: next.id, text: next.text,
          notBefore: this.now() + (this.options().idleSeconds || 30) * 1000 } : null;
      }
      return { ok: true };
    } catch { ready.committing = false; return { ok: false }; }
  }
  async runBatch(input, generate, controller, config) {
    if (batchGenerating && batchGenerating !== controller) return { skipped: true, reason: 'busy' };
    batchGenerating = controller;
    const { entry, catalog, style, card, stamp, notBefore, prepare } = config;
    const started = new Set(Object.entries(entry.progress || {}).filter(([, progress]) => progress.heard.length).map(([topic]) => topic));
    const dialogue = (input.history || []).filter(m => m.role === 'assistant' && m.source?.kind !== 'idle').slice(-8);
    for (const row of catalog) if (dialogue.some(m => storySimilarity(m.content, row.text) >= .55)) started.add(row.topic);
    let grounded = config.grounded, selected = this.stories.select(entry, catalog, grounded, started);
    if (!selected && grounded) { grounded = false; selected = this.stories.select(entry, catalog, false, started); }
    if (!selected) { batchGenerating = null; return { skipped: true, reason: 'stories-exhausted' }; }
    const targets = Array.from({ length: 3 }, () => {
      const pick = chooseIdleStyle(this.random, controller.manual);
      return { minChars: pick.minChars === 1 ? 20 : pick.minChars, maxChars: pick.maxChars };
    });
    const policy = { ...this.options(), mode: 'unlimited' }, compiled = compileCard(card);
    const context = (card ? characterContext(card, '', { purpose: 'idle', userName: input.playerPersona?.name }) : input.system)
      + (input.speakerStyle ? '\n【表达风格】' + input.speakerStyle : '')
      + (input.playerPersona?.description ? '\n【玩家虚构身份，不是玩家已经说过的话】' + input.playerPersona.description : '')
      + batchPrompt(selected, targets, { grounded, heard: entry.progress?.[selected.topic]?.heard || [], previous: entry.recent.map(r => r.text) });
    const accept = batch => {
      const grounding = batchGroundingProblem(batch, selected, catalog);
      if (grounding) throw new Error('batch-' + grounding);
      const continuing = !!entry.progress?.[selected.topic]?.heard?.length;
      const compared = continuing ? { ...entry, recent: entry.recent.filter(r => r.topic !== selected.topic) } : entry;
      if (this.stories.repeated(batch.segments[0].text, compared, catalog, selected)) throw new Error('batch-repeat');
      this.ready = { batch, index: 0, id: batch.segments[0].id, text: batch.segments[0].text, stamp,
        notBefore: prepare ? notBefore : 0, expires: this.now() + 180000, entry, catalog, selected, style, onDisplayed: input.onDisplayed, cacheInput: input };
      this.cache?.remember(input, batch, selected);
      return !controller.manual && this.ready.notBefore > this.now() ? { prepared: true } : this.packet(this.ready, false);
    };
    let correction = '', lastError;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted || stamp !== this.stamp()) return { skipped: true };
        const references = (input.history || []).filter(m => m.role === 'user').slice(-2).map(m => m.content).join('\n').slice(-400);
        const result = await withConversationScope(() => generate({ ...input, history: [], pool: [], actions: [],
          system: context + (references ? '\n【已完成的真实玩家提问，仅供了解玩家，不能当成当前待答问题】\n' + references : '') + correction,
          userText: '请直接返回这组连贯口语的JSON。' }), { proactive: true, batch: true, manual: controller.manual, petId: input.companionPetId || 'main',
          signal: controller.signal, chatOptions: policy, onProgress: info => Object.assign(controller, info) });
        if (!result.ok) { const info = result.failure || classifyAiFailure({ message: result.message }); return { error: normalizeAiFailure({ status: info.status, code: info.code }).message, failure: info }; }
        if (controller.signal.aborted || stamp !== this.stamp()) return { skipped: true };
        try {
          return accept(parseSpeechBatch(result.text, { selected, targets, grounded, name: compiled.speaker?.name, history: input.history }));
        } catch (e) {
          if (e.prefix?.length) {
            try { return accept({ id: e.batchId, topicId: selected.topic, grounded, segments: e.prefix, incomplete: true }); } catch { /* Repeated prefixes need a fresh generation. */ }
          }
          lastError = e.message;
          correction = '\n【本地校验要求重写本批次】问题代码：' + lastError + '。严格检查每段目标字数和证据id，改成直接口语，不复述已讲内容；重新返回完整JSON。';
        }
      }
      return { error: '这组话没有通过口语、字数或重复检查，请稍后再试。', failure: { kind: 'speech', code: lastError } };
    } finally { if (batchGenerating === controller) batchGenerating = null; }
  }
  status() {
    const request = this.pending;
    return request ? { pending: true, manual: request.manual, elapsedMs: Math.max(0, this.now() - request.started),
      stage: request.stage || 'generating', attempt: request.attempt, attempts: request.attempts } : { pending: false };
  }
  async run(getInput, generate, signal, { manual = false, prepare = false, prefetch = false } = {}) {
    const options = this.options();
    if (this.pending) return { skipped: true, reason: 'busy' };
    if (this.ready && this.ready.stamp === this.stamp() && this.ready.expires >= this.now()) return !manual && this.ready.notBefore > this.now()
      ? { prepared: true } : this.ready.batch ? this.packet(this.ready) : { text: this.ready.text, deliveryId: this.ready.id };
    this.ready = null;
    if (!prefetch && (manual ? this.now() - this.lastManual < 1000
      : !options.proactive || this.now() - this.lastActivity < (prepare ? Math.min(5000, (options.idleSeconds || 30) * 500) : (options.idleSeconds || 30) * 1000))) return { skipped: true };
    const notBefore = this.lastActivity + (options.idleSeconds || 30) * 1000;
    const controller = new AbortController(), stamp = this.stamp();
    controller.manual = manual;
    controller.started = this.now(); controller.stage = 'generating';
    if (manual) this.lastManual = this.now();
    const stop = () => controller.abort();
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    this.pending = controller; if (!prepare) this.lastActivity = this.now();
    const deadline = setTimeout(stop, 120000); deadline.unref?.();
    try {
      const input = await getInput();
      if (!input || controller.signal.aborted) return { skipped: true };
      const lines = this.read();
      const style = chooseIdleStyle(this.random, manual);
      const card = input.storyCard ?? readSelectedPersona(join(assistantDataDir(), 'stronghold-persona.json'));
      if (!input.storySeeds && compileCard(card).needsSpeaker) return { skipped: true, reason: 'needs-speaker' };
      const seeds = input.storySeeds ?? extractStorySeeds(card);
      const catalog = storyCatalog(seeds);
      const entry = this.stories.entry(storyKey(card, seeds, input.personaKey), catalog, lines);
      if (input.storyBatch) this.stories.reconcile(entry, catalog, input.history);
      const grounded = style.grounded;
      if (grounded && !catalog.length && !input.storyBatch) return { skipped: true, reason: 'stories-exhausted' };
      if (input.storyBatch) return await this.runBatch(input, generate, controller, { entry, catalog, style, grounded, card, stamp, notBefore, prepare });
      const policy = { ...options, mode: 'daily', maxChars: style.maxChars };
      const excluded = new Set();
      for (let attempt = 0; attempt < 2; attempt++) {
      const selected = this.stories.select(entry, catalog, grounded, excluded);
      if (!selected) return { skipped: true, reason: attempt ? 'duplicate' : 'stories-exhausted' };
      const material = grounded ? '【背景取材】只讲本次指定的一件事，不照抄，不混入卡中其他经历。\n【本次唯一故事素材】'
        + JSON.stringify({ text: selected.text }) + '\n'
        : '【日常即兴】只围绕本次未用角度：' + selected.text + '。可以谈眼下的小想法或假想情境，不编造既定身世。';
      const instruction = '【空闲主动聊天】' + (manual ? '玩家点了碎碎念。' : '玩家安静了一会儿。')
        + '用当前角色身份自然说一小段，让玩家逐渐了解你。完整角色卡只用于维持身份和语气，本次话题由指定素材限定，不得自行选回熟悉的旧事。'
        + `本次必须 ${style.minChars}–${style.maxChars} 字，包含标点；不要标题或字数说明。`
        + (style.minChars === 50 ? '尽量写70–90字，用两三句带具体细节的完整话，不要只回一句短评。' : '尽量写20–49字，至少讲出一个具体细节。')
        + '不每次自我介绍，不杜撰重大身世，不与卡中设定冲突；不催回复，不播报游戏状态，不搜索或配图。'
        + material + '不要重复以下已讲主题；换措辞、改时间或拼接细节仍算重复：'
        + JSON.stringify(entry.recent.slice(-12).map(row => row.summary))
        + '。每次只讲一件新事情，不要固定使用同一套开场或把熟悉的爱好拼作结尾。';
      const produce = userText => withConversationScope(() => generate({ ...input, pool: [], actions: [],
        system: (card ? characterContext(card, '', { purpose: 'idle' }) : input.system) + '\n' + instruction + chatOptionsPrompt(policy), userText }),
      { proactive: true, manual, signal: controller.signal, chatOptions: policy,
        onProgress: info => Object.assign(controller, info) });
      const result = await produce('现在自然地讲给玩家听。');
      if (controller.signal.aborted || stamp !== this.stamp()) return { skipped: true };
      const answer = replyResult(result, policy);
      if (controller.signal.aborted || stamp !== this.stamp() || (!manual && !this.options().proactive)) return { skipped: true };
      if (!result.ok || !answer.ok) {
        if (result.ok && !answer.ok) return { error: answer.message, failure: answer.failure };
        const info = result.failure || classifyAiFailure({ message: result.message });
        if (info.kind === 'busy') return { skipped: true, reason: 'busy' };
        return { error: normalizeAiFailure({ status: info.status, code: info.code }, undefined).message, failure: info };
      }
      // Length is a generation target. Never throw away real speech or spend another model call padding it.
      if (!textLength(answer.text || '')) return { error: '模型没有返回正文，请稍后重试。' };
      if (!answer.text?.trim()) return { skipped: true };
      if (hasInventedUserHistory(answer.text, input.history || [])) { this.stories.reject(entry, selected); excluded.add(selected.topic); continue; }
      if (this.stories.repeated(answer.text, entry, catalog, selected)) {
        this.stories.reject(entry, selected); excluded.add(selected.topic); continue;
      }
      if (input.requireDeliveryAck) {
        const id = randomUUID();
        this.ready = { id, stamp, notBefore: prepare ? notBefore : 0, expires: this.now() + 120000, entry, selected, catalog, text: answer.text.trim() };
        if (!manual && this.ready.notBefore > this.now()) return { prepared: true };
        return { text: answer.text.trim(), deliveryId: id };
      }
      this.stories.record(entry, selected, answer.text.trim(), catalog);
      try { this.save(entry.recent.map(row => row.text)); } catch { /* do not suppress speech */ }
      return { text: answer.text };
      }
      return { skipped: true, reason: 'duplicate' };
    } catch (error) {
      if (controller.signal.aborted) return { skipped: true };
      const info = classifyAiFailure(error);
      if (info.kind === 'busy') return { skipped: true, reason: 'busy' };
      return { error: normalizeAiFailure(error, error).message, failure: info };
    } finally {
      if (this.pending === controller) this.pending = null;
      clearTimeout(deadline);
      if (!prepare || !this.ready) this.lastActivity = Math.max(this.lastActivity, this.now());
      signal?.removeEventListener('abort', stop);
    }
  }
}
const idles = new Map();
function idleFor(pet = 'main') {
  if (!idles.has(pet)) idles.set(pet, new IdleChat({
    cache: new IdleCache(() => join(assistantDataDir(), 'stronghold-idle-start.json')),
    stamp: () => { const profile = petProfile(pet); return assistantDataDir() + ':' + pet + ':' + personaVersion() + ':' + profile.revision + ':' + (profile.library?.contextEpoch(profile.actorId) || 'start'); },
    read: () => readRecent(pet),
    stories: new StoryMemory(pet === 'main' ? memoryFile : () => join(assistantDataDir(), 'idle-' + Buffer.from(pet).toString('hex') + '.json')),
  }));
  return idles.get(pet);
}
export const noteConversationActivity = () => { for (const idle of idles.values()) idle.activity(); };
export const idleStatusRoute = (pet = 'main') => ({ kind: 'json', status: 200, obj: idleFor(pet).status() });
export const stopIdleChat = () => { for (const idle of idles.values()) if (!idle.pending?.manual) idle.activity(); };
export function warmIdleStartup() {
  try {
    const main = petProfile('main'), pets = Object.keys(main.library?.snapshot().bindings || { main: 'main' });
    for (const pet of pets) {
      const profile = petProfile(pet);
      idleFor(pet).cache.warm({ companionPetId: pet, storyCard: profile.card, speakerStyle: profile.preset?.style,
        cacheActor: profile.actorId, cacheRevision: profile.revision, cacheEpoch: profile.library?.contextEpoch(profile.actorId),
        history: profile.library?.visibleHistory(profile.actorId).filter(e => e.type === 'assistant').map(e => ({ role: 'assistant', content: e.text })) || [] });
    }
  } catch { /* Optional local preparation must never prevent the pet from starting. */ }
}
export async function idleChatRoute(method, raw, signal, getInput, generate) {
  const result = (status, obj) => ({ kind: 'json', status, obj });
  if (method === 'DELETE') { noteConversationActivity(); return result(200, { skipped: true }); }
  if (!['POST', 'PATCH'].includes(method)) return result(405, { error: 'METHOD_NOT_ALLOWED' });
  let body; try { body = JSON.parse(raw); } catch { /* invalid */ }
  if (!body || typeof body.pet !== 'string' || !body.pet || body.pet.length > 80
    || (body.manual !== undefined && typeof body.manual !== 'boolean')
    || (body.warmStart !== undefined && typeof body.warmStart !== 'boolean')) return result(400, { error: 'BAD_PET' });
  const idle = idleFor(body.pet);
  const build = async () => {
    const input = await getInput(body.pet); if (!input) return null;
    const profile = petProfile(body.pet), library = profile.library || companionLibrary(assistantDataDir());
    const actor = library.actor(body.pet), revision = library.snapshot().revision, epoch = library.contextEpoch(actor.id);
    return { ...input, storyCard: profile.card, requireDeliveryAck: true, cacheActor: actor.id, cacheRevision: revision, cacheEpoch: epoch,
      storyBatch: process.env.SP_COMPANION_SINGLE_TEST !== '1',
      onDisplayed: event => library.event(actor.id, directRoom(actor.id), { ...event, type: 'assistant', sourceKind: event.sourceKind || 'idle', deliveryState: 'displayed',
        expectedCardId: actor.assetId, expectedRevision: revision, expectedContextEpoch: epoch }) };
  };
  if (method === 'PATCH') {
    const ack = await idle.acknowledge(body.deliveryId);
    if (ack.ok && body.warmStart) void idle.prefetch(build, generate);
    return result(200, ack);
  }
  const input = await build();
  if (!input) { idle.activity(); return result(200, { skipped: true }); }
  const flags = { manual: body.manual === true, prepare: body.prepare === true };
  if (body.warmStart && input.storyBatch) {
    const cached = idle.warmPacket(input, flags); if (cached) return result(200, cached);
    if (idle.now() < idle.retryAt) return result(200, { prepared: true, retryAfterMs: idle.retryAt - idle.now() });
  }
  return result(200, await idle.run(async () => input, generate, signal, flags));
}
