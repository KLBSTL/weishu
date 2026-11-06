import { randomUUID } from 'node:crypto';
import { companionLibrary } from './library.js';
import { petProfile, profilePrompt } from './profile.js';
import { compileCard } from './materials.js';
import { speechProblem } from './speech.js';
import { readChatOptions } from '../desktop/chat-preferences.js';
import { withConversationScope } from '../desktop/conversation.js';
import { replyResult } from '../match/replyStyle.js';

const directors = new Map();
export class GroupDirector {
  constructor(directory) { this.directory = directory; this.library = companionLibrary(directory); this.job = null; this.waiting = null; this.last = null; }
  status() {
    return this.job ? { running: true, chainId: this.job.id, roomId: this.job.roomId, completed: this.job.completed, waitingForDisplay: !!this.waiting }
      : { running: false, ...this.last };
  }
  delivery(pet) { return this.waiting?.pet === pet ? { id: this.waiting.id, text: this.waiting.text, actorId: this.waiting.actorId, chainId: this.waiting.chainId } : null; }
  stop() { this.job?.controller.abort(); this.waiting?.resolve(false); this.waiting = null; }
  async acknowledge(pet, id) {
    const item = this.waiting;
    if (!item || item.pet !== pet || item.id !== id || item.committing) return { ok: false };
    if (this.library.snapshot().revision !== item.revision || this.job?.controller.signal.aborted) { this.stop(); return { ok: false }; }
    item.committing = true;
    await this.library.event(item.actorId, item.roomId, { id, type: 'assistant', speakerId: item.actorId, text: item.text, chainId: item.chainId });
    this.waiting = null; item.resolve(true); return { ok: true };
  }
  async start({ roomId, topic = '', limit = 2 }, deps) {
    if (this.job) throw Object.assign(new Error('已有一段角色对话，请先停止。'), { status: 409 });
    if (!deps?.getInput || !deps?.generate) throw new Error('人物生成接口未接通');
    const data = this.library.snapshot(), room = data.rooms.find(r => r.id === roomId);
    if (!room || room.members.length < 2) throw new Error('请先建立至少两个人物的房间');
    const bindings = room.members.map(actorId => { const compiled = compileCard(this.library.card(actorId, data, true));
      if (compiled.needsSpeaker) throw new Error('请先为剧情卡指定实际扮演人物');
      return { actorId, speakerName: compiled.speaker?.name || this.library.actor(actorId, data, true).name, pet: Object.keys(data.bindings).find(pet => data.bindings[pet] === actorId) };
    });
    if (bindings.some(b => !b.pet)) throw new Error('请先给房间中的每个人物绑定桌宠实例');
    const controller = new AbortController(), id = randomUUID();
    const job = { id, roomId, completed: 0, controller, revision: data.revision };
    if (topic) await this.library.event(bindings[0].actorId, roomId, { type: 'user', speakerId: 'player', text: topic });
    if (this.job) throw new Error('已有另一段对话开始');
    this.job = job;
    const timer = setTimeout(() => controller.abort(), 180000); timer.unref?.();
    job.finished = this.run(job, bindings, Math.min(3, Math.max(1, Number(limit) || 2)), topic, deps)
      .catch(() => { this.last = { error: controller.signal.aborted ? '对话已停止或达到时间上限。' : '本次角色对话未完成，请稍后重试。', completed: job.completed }; })
      .finally(() => { clearTimeout(timer); if (this.job === job) this.job = null; if (this.waiting?.chainId === id) this.waiting = null; });
    return { started: true, chainId: id };
  }
  async run(job, bindings, limit, topic, deps) {
    for (let turn = 0; turn < limit; turn++) {
      job.controller.signal.throwIfAborted();
      if (this.library.snapshot().revision !== job.revision) throw new Error('资料已变化');
      const { actorId, pet } = bindings[turn % bindings.length], profile = petProfile(pet, this.directory);
      const base = await deps.getInput(pet);
      if (!base) throw new Error('桌宠实例不存在或正在睡眠');
      const history = this.library.visibleHistory(actorId, job.roomId).filter(e => ['user', 'assistant'].includes(e.type))
        .map(e => ({ role: e.type === 'user' ? 'user' : 'assistant', content: e.type === 'user' ? e.text : `【${e.speakerName || e.speakerId}的公开发言，不是玩家发言】${e.text}`, ts: e.at }));
      const options = readChatOptions();
      const output = await withConversationScope(() => deps.generate({ ...base, history,
        system: profilePrompt(profile, topic) + '\n【人物间短对话】本次只有你发言。其他公开人物：' + bindings.filter(b => b.actorId !== actorId).map(b => b.speakerName).join('、')
          + '。只根据已给出的公开对话自然回应，不替其他人物或玩家说话，不编造玩家旧发言，不调用工具。',
        userText: turn ? '自然接上已经公开显示的上一句，只说自己的下一句。' : '围绕本次话题或自己的背景，向在场另一人物开启一小段自然对话。', pool: [], actions: [],
      }), { proactive: true, manual: true, group: true, petId: pet, signal: job.controller.signal, chatOptions: options });
      const answer = replyResult(output, options);
      if (!answer.ok || !answer.text?.trim() || speechProblem(answer.text, compileCard(profile.card).speaker?.name)) throw new Error('没有完整口语正文');
      job.controller.signal.throwIfAborted();
      const shown = await new Promise(resolve => {
        const id = randomUUID();
        const abort = () => resolve(false);
        job.controller.signal.addEventListener('abort', abort, { once: true });
        this.waiting = { id, pet, actorId, text: answer.text, roomId: job.roomId, chainId: job.id, revision: job.revision,
          resolve: value => { job.controller.signal.removeEventListener('abort', abort); resolve(value); } };
      });
      if (!shown) break;
      job.completed++;
    }
    this.last = { completed: job.completed };
  }
}
export function groupDirector(directory) {
  if (!directors.has(directory)) directors.set(directory, new GroupDirector(directory));
  return directors.get(directory);
}
