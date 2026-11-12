import { createHash, randomUUID } from 'node:crypto';

export function createPlan({ kind = 'chat', timeoutMs = 120000, ...context } = {}) {
  return { id: randomUUID(), kind, createdAt: Date.now(), deadline: Date.now() + timeoutMs, decisions: {}, phases: {}, ...context };
}
export function planDraw(plan, key) {
  if (plan.decisions[key] === undefined) plan.decisions[key] = createHash('sha256').update(plan.id + ':' + key).digest().readUInt32BE(0) / 0x100000000;
  return plan.decisions[key];
}
export function planMatches(plan, context) {
  return ['characterId', 'cardRevision', 'memoryEpoch', 'roomId'].every(key => plan[key] === undefined || plan[key] === context[key]);
}
export function markPhase(plan, phase) { if (plan) plan.phases[phase] ??= Date.now(); }
