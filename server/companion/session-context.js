import { fingerprint } from './materials.js';

/** Derived from authoritative visible events; never persists another copy of private history. */
export function sessionProjection(events, scope, { budget = 6000 } = {}) {
  const valid = events.filter(e => !e.deleted && !e.forgotten && e.characterId === scope.characterId && e.roomId === scope.roomId
    && (!e.audience || e.audience.includes(scope.actorId))
    && (e.type === 'user' || e.type === 'assistant' && e.deliveryState === 'displayed'));
  const recent = [], earlier = []; let remaining = budget;
  for (let i = valid.length - 1; i >= 0; i--) {
    const event = valid[i], text = String(event.text || '');
    // Keep complete quotations: truncating a memory can remove its negation or condition.
    if (!text || text.length > remaining) continue;
    const row = { id: event.id, role: event.type, text };
    (i >= valid.length - 12 ? recent : earlier).unshift(row); remaining -= text.length;
    if (earlier.length >= 16) break;
  }
  return { id: fingerprint([scope.characterId, scope.roomId, scope.historyEpoch || 'start']),
    revision: scope.memoryEpoch, recent, earlier, omitted: valid.length - recent.length - earlier.length };
}
export function sessionPrompt(projection, reserved = []) {
  if (!projection) return '';
  return '\n【同一持久会话的已展示历史】以下是已完成的对话参考，不能重新回答旧问题，也不能将旧事件换措辞重讲；继续时补充未讲细节或新的感受。较早要点为完整原文摘录，带事件ID，不是新设定。'
    + JSON.stringify(projection)
    + (reserved.length ? '\n【尚未展示的预留话题】这些是待播草稿，玩家还没听见；本次补货避开这些话题，不据此声称已经讲过。' + JSON.stringify(reserved) : '');
}
