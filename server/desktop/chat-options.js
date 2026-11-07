import { chatOptionsPrompt, chatProfile, replyResult } from '../match/replyStyle.js';
import { localizeGenerationResult } from './ai-request.js';
import { hasGameConnection, relayGameChat, withConversationScope } from './conversation.js';
import { chatOptionsFile, readChatOptions, saveChatOptions } from './chat-preferences.js';
import { noteConversationActivity, stopIdleChat, recentIdleContext } from './idle-chat.js';
import { hasLibrary, petProfile } from '../companion/profile.js';
import { directRoom } from '../companion/library.js';
import { groupDirector } from '../companion/turns.js';
import { companionDirectory } from '../companion/profile.js';
import { randomUUID } from 'node:crypto';
import { compileCard } from '../companion/materials.js';
import { speechProblem, speechFailure } from '../companion/speech.js';
import { conversationEngine } from '../companion/engine.js';
import { knowledgeProblem, extensionProposals } from '../companion/knowledge.js';
import { runGenerationJob } from '../companion/broker.js';
export { chatOptionsFile, readChatOptions, saveChatOptions } from './chat-preferences.js';

export async function chatOptionsRoute(method, raw = '', file = chatOptionsFile()) {
  const result = (status, obj) => ({ kind: 'json', status, obj });
  if (method === 'GET') return result(200, readChatOptions(file));
  if (method !== 'POST') return result(405, { error: '请使用 POST 修改对话模式' });
  if (Buffer.byteLength(raw) > 2048) return result(413, { error: '设置内容过长' });
  let patch;
  try { patch = JSON.parse(raw); } catch { return result(400, { error: '设置格式无效' }); }
  try { const saved = await saveChatOptions(patch, file); if (patch.proactive === false) stopIdleChat(); return result(200, saved); }
  catch (error) { return result(error.code ? 500 : 400, { error: error.code ? '设置保存失败，请稍后重试' : error.message }); }
}

export function generatePetChat(generate, input) {
  return runGenerationJob('chat', () => generatePetChatInner(generate, input), chatProfile(input.userText, readChatOptions()).timeoutMs);
}
async function generatePetChatInner(generate, input) {
  noteConversationActivity();
  groupDirector(companionDirectory()).stop();
  const options = chatProfile(input.userText, readChatOptions()).options;
  const petId = input.companionPetId || 'main';
  let profile = hasLibrary() ? petProfile(petId) : null;
  if (profile?.library) {
    const context = await conversationEngine.prepare(profile.library, petId, input.userText);
    profile = context.profile; input = { ...input, system: input.system + '\n' + context.prompt, recallContext: context.prompt };
  }
  let chatEpoch;
  if (profile?.card && compileCard(profile.card).needsSpeaker) return { ok: false, message: '这张剧情卡还没有固定人物，请在「角色扮演 → 资料管理」选择实际扮演人物。', failure: { kind: 'speaker' } };
  if (profile?.library) {
    const history = profile.library.visibleHistory(profile.actorId).filter(e => ['user', 'assistant'].includes(e.type)).slice(-12);
    input = { ...input, history: history.map(e => ({ role: e.type, content: e.text, ts: e.at })) };
    if (input.userText) await profile.library.event(profile.actorId, directRoom(profile.actorId), { type: 'user', text: input.userText });
    chatEpoch = profile.library.contextEpoch(profile.actorId);
  }
  const finish = async result => {
    const out = replyResult(result, result.complex && options.mode === 'daily' ? { ...options, maxChars: Math.max(300, options.maxChars) } : options);
    if (profile?.library && out.ok && out.text) {
      const id = randomUUID();
      await profile.library.event(profile.actorId, directRoom(profile.actorId), { id, type: 'assistant', text: out.text, sourceKind: 'chat', deliveryState: 'generated',
        extensionProposals: extensionProposals(out.text, profile.card),
        expectedCardId: profile.actor.assetId, expectedRevision: profile.revision, expectedContextEpoch: chatEpoch });
      return { ...out, deliveryId: id };
    }
    return out;
  };
  if (petId === 'main' && hasGameConnection()) {
    const relayed = await relayGameChat({ ...input, chatOptions: options });
    if (relayed) return finish(relayed);
  }
  try {
    const controller = new AbortController(), started = Date.now(), budget = chatProfile(input.userText, options);
    let timer = setTimeout(() => controller.abort(), budget.timeoutMs); timer.unref?.();
    try {
      const result = localizeGenerationResult(await withConversationScope(async () => {
        let correction = '';
        for (let attempt = 0; attempt < 2; attempt++) {
          if (controller.signal.aborted) return { ok: false, message: '本次回复已取消或超时。' };
          const out = await generate({ ...input, system: input.system + recentIdleContext(petId, input.userText) + chatOptionsPrompt(options) + correction,
            ...(options.mode === 'daily' && { pool: [] }) });
          if (!out.ok || (!speechProblem(out.text, profile ? compileCard(profile.card).speaker?.name : '', { allowImages: options.mode === 'unlimited' })
            && !knowledgeProblem(out.text, profile?.card))) return out;
          correction = '\n【请重写】上一版未通过口语或人物事实校验。只返回人物亲口说的自然台词，使用“我”，不写动作或人物名标签；重大身世/关系和明确偏好遵守原卡，可以改聊不冲突的日常小事。';
        }
        return speechFailure();
      }, { chatOptions: options, petId, signal: controller.signal, extendDeadline: () => {
        clearTimeout(timer); timer = setTimeout(() => controller.abort(), Math.max(0, started + budget.extendedTimeoutMs - Date.now())); timer.unref?.();
      } }));
      return await finish(result);
    } finally { clearTimeout(timer); }
  } finally { noteConversationActivity(); }
}
export async function generatePetWhisper(generate, ctx, input) {
  const options = readChatOptions();
  const request = { ...input, system: input.system + chatOptionsPrompt(options) };
  if (options.mode === 'daily') delete request.meme;
  return replyResult(localizeGenerationResult(await generate(ctx, request)), options);
}
