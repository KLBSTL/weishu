import { randomUUID } from 'node:crypto';
import { ERR, PHASE } from '../../shared/constants.js';
import { msg, wireMessage } from '../../shared/i18n.js';
import { OK, fail } from './match/common.js';
import { DEFAULT_CHAT_OPTIONS, UNLIMITED_CHAT_OPTIONS, chatProfile, replyText } from './replyStyle.js';
import { liveChatFacts } from './chatContext.js';
import { normalizeAiFailure } from '../desktop/ai-request.js';

const DETAIL_ROUNDS = 3;
const KEEP_TURNS = 4;
const MAX_REPLY = 1200;

function requestedGoal(text) {
  const command = text.trim().replace(/^(?:R\s*\d{1,2}\b|第\s*\d{1,2}\s*轮)\s*/iu, '').replace(/[。！？!?]+$/u, ''); // i18n-ignore: chat grammar
  if (/^(?:(?:这轮|本轮)?(?:帮我)?补对空|我这轮缺对空[，,]你能补吗|cover anti-air)$/i.test(command)) return 'anti-air'; // i18n-ignore: exact chat command
  if (/^(?:(?:这轮|本轮)?先保血|prioritize survival)$/i.test(command)) return 'protect-lp'; // i18n-ignore: exact chat command
  return null;
}

function lineup(player) {
  return [...player.board.values()].map(({ id, kind }) =>
    (kind === 'chess' ? player.gd.chess(id) : player.gd.item(id))?.name || id);
}


export class TeammateChat {
  constructor(match, { seat, chat, chatTimeoutMs, getChatOptions, getPersona }, playerId) {
    this.match = match;
    this.identity = { matchId: randomUUID(), seat };
    this.playerId = playerId;
    this.stream = chat;
    this.getChatOptions = getChatOptions;
    this.getPersona = getPersona;
    this.transactions = [];
    this.historyStartsAtRound = match.round;
    this.timeoutMs = chatTimeoutMs;
    this.battles = [];
    this.choices = [];
    this.decisions = new Map();
    this.dialogue = [];
    this.turns = [];
    this.active = null;
    this.lastStarted = -Infinity;
    this.goals = new Map();
    this.closedGoalRound = 0;
    this.followUpRound = null;
    this.announced = false;
  }

  recordNormal(player, result, leaks, lpLoss, { payableLeaks, uniteRole, afterUniteLeaks } = {}) {
    const enemies = Object.create(null);
    for (const leak of result.leaked || []) {
      if (!leak || leak.counted === false) continue;
      const name = this.match.gd.enemy(leak.enemyKey)?.name || leak.enemyKey;
      if (name) enemies[name] = (enemies[name] || 0) + 1;
    }
    this.recordBattle({ kind: 'normal', seat: player.seat, leaks, payableLeaks, uniteRole, afterUniteLeaks, lpLoss,
      lpBefore: player.lp + lpLoss, lp: Math.max(0, player.lp), kills: result.killed,
      enemies: Object.entries(enemies).sort((a, b) => b[1] - a[1]).slice(0, 6),
      ...(player.isBot ? { lineup: lineup(player) } : {}),
    });
    if (player.seat === this.identity.seat) this.announce(msg('协作战报：第 {round} 轮我漏了 {leaks} 个敌人，实际扣除 {loss} LP。',
      { round: this.match.round, leaks, loss: lpLoss }));
  }

  recordBoss(hidden, victory) {
    const facts = this.bossFacts(hidden);
    this.recordBattle({ ...facts, cleared: victory });
    this.announce(msg('协作战报：第 {round} 轮我对领袖造成了 {damage} 点有效伤害。',
      { round: this.match.round, damage: facts.damage.find(p => p.seat === this.identity.seat)?.damage ?? 0 }));
  }

  bossFacts(hidden) {
    const { bossPool, teamLp, gd, bossId, hiddenBossId, order } = this.match;
    return { kind: hidden ? 'hidden' : 'boss',
      name: gd.boss(hidden ? hiddenBossId : bossId)?.name,
      hp: Math.max(0, Math.round(bossPool.hp)), teamLp: Math.max(0, Math.round(teamLp)),
      damage: order.map(p => ({ seat: p.seat, damage: Math.round(bossPool.byPlayer.get(p.playerId) || 0) })),
    };
  }

  recordBattle(event) {
    const { round } = this.match;
    this.battles.push({ round, ...event });
  }

  battleMemory(fromRound = 1, targetRound = null) {
    const recent = this.match.round - DETAIL_ROUNDS;
    return this.battles.filter(battle => battle.round >= fromRound).map(battle => {
      if (battle.round >= recent || battle.round === targetRound || battle.kind !== 'normal') return battle;
      const { enemies: _enemies, lineup: _lineup, ...summary } = battle;
      return summary;
    });
  }

  recordDecision({ round, status, source, choice, committed, candidates }) {
    this.decisions.set(round, { round, status, source, choice, committed, candidates });
  }

  recordTransaction(player, event) {
    if (this.match._botPlanningBranch || this.match.players.get(player.playerId) !== player) return;
    const unit = (event.kind === 'item' ? this.match.gd.item(event.id) : this.match.gd.chess(event.id))?.name;
    this.transactions.push({ seq: this.transactions.length + 1, round: this.match.round, phase: this.match.phase,
      seat: player.seat, at: Date.now(), ...event, ...(unit && { unit }) });
  }

  facts(player, question) { return liveChatFacts(this, player, question); }

  recordChoice(action, rehearsal) {
    const { round, gd } = this.match;
    this.choices.push({ round, action: action.type, unit: gd.chess(action.id)?.name ?? gd.item(action.id)?.name,
      preview: rehearsal && { preRescueLpLoss: rehearsal.preRescueLpLoss, bossDamage: rehearsal.bossDamage },
    });
    this.match.markPublic();
  }

  goalFor(player) {
    return player.seat === this.identity.seat ? this.goals.get(this.match.round) : undefined;
  }

  closeGoalWindow(player) {
    if (player.seat === this.identity.seat) this.closedGoalRound = this.match.round;
  }

  confirmGoalAction(goal, action, rehearsal, baseline) {
    if (this.goals.get(goal.round) !== goal) return;
    const { gd } = this.match;
    goal.action = { type: action.type, unit: gd.chess(action.id)?.name ?? gd.item(action.id)?.name };
    if (goal.kind === 'protect-lp') goal.estimatedLpSaved = baseline.preRescueLpLoss - rehearsal.preRescueLpLoss;
  }

  closeGoals() {
    const round = this.match.round;
    for (const [target, goal] of this.goals) {
      if (target > round && !this.match.ended) continue;
      this.goals.delete(target);
      if (target === round && goal.action && !this.match.ended) {
        if (goal.kind === 'anti-air') {
          const player = this.match.order.find(p => p.seat === this.identity.seat);
          goal.antiAirDeployed = [...player.board.values()].filter(p => {
            const raw = p.kind === 'chess' && player.gd.chess(p.id);
            const unit = raw && (player.fieldRecord(raw) || raw);
            return unit?.canHitFly && !['none', 'heal'].includes(unit.attackKind);
          }).length;
        }
        this.publishGoal(goal, 'applied', msg('第 {round} 轮已执行协作方案。', { round }));
        if (!this.announced) this.followUpRound = round;
      } else this.publishGoal(goal, 'unavailable', msg('第 {round} 轮未找到可执行的安全调整。', { round: target }));
    }
  }

  requestGoal(kind, requestId, question, explicitRound) {
    const { match } = this;
    const old = [...this.goals.values()].find(goal => goal.requestId === requestId);
    if (old) { this.send(this.playerId, old.frame); return OK; }
    const player = match.order.find(p => p.seat === this.identity.seat);
    const reopen = match.phase === PHASE.PREP && (player.ready || this.closedGoalRound === match.round)
      && (!match.deadline || match.deadline - match.sched.now() > 5000);
    const canPlan = reopen || [PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP].includes(match.phase) && !player.ready
      && this.closedGoalRound !== match.round;
    const next = canPlan ? match.round : match.round + 1;
    const round = explicitRound ?? next;
    const goal = { kind, round, requestId, question };
    if (!player.alive || round !== next || round < 1 || round > Math.max(match.gd.lastRound, match.gd.hiddenRound ?? 0)) {
      this.publishGoal(goal, 'unavailable', msg('第 {round} 轮已无法接收这个协作目标。', { round }));
      return OK;
    }
    const previous = this.goals.get(round);
    if (previous) this.publishGoal(previous, 'superseded', msg('第 {round} 轮的协作目标已被替换。', { round }));
    this.goals.set(round, goal);
    this.publishGoal(goal, 'accepted', msg('已收到。我会在第 {round} 轮尝试这个目标。', { round }));
    if (reopen) {
      this.closedGoalRound = 0;
      player.setReady(false);
      match.scheduleBotPrep(player, 0);
    } else if (canPlan && match.phase === PHASE.PREP) match._deepSeekWait?.stop('goal');
    return OK;
  }

  publishGoal(goal, status, message) {
    const { requestId, question, round, kind, action, estimatedLpSaved, antiAirDeployed } = goal;
    goal.frame = { ...this.identity, requestId, question, round: this.match.round, referenceRound: round, state: 'complete',
      goal: { kind, round, status, action, estimatedLpSaved, antiAirDeployed }, ...wireMessage(message) };
    this.publish(goal.frame);
  }

  announce(message) {
    const round = this.match.round;
    if (this.announced || this.followUpRound !== round) return;
    this.announced = true;
    this.publish({ ...this.identity, requestId: randomUUID(), round, referenceRound: round,
      state: 'complete', kind: 'battle-update', ...wireMessage(message) });
  }

  publish(frame, options = this.getChatOptions ? (this.getChatOptions() ?? DEFAULT_CHAT_OPTIONS) : UNLIMITED_CHAT_OPTIONS) {
    if (options.mode === 'daily' && typeof frame.text === 'string') {
      frame.text = replyText(frame.text, options);
      delete frame.msgid; delete frame.params;
    }
    this.turns = [...this.turns.filter(turn => turn.requestId !== frame.requestId).slice(1 - KEEP_TURNS), frame];
    this.send(this.playerId, frame);
  }

  publicStatus() {
    const { round, phase } = this.match;
    const last = this.choices.at(-1);
    const action = last?.round === round ? { type: last.action, unit: last.unit } : null;
    const signature = JSON.stringify([round, phase, action]);
    if (signature !== this.statusSignature) {
      this.statusSignature = signature;
      this.status = { ...this.identity, round, phase, seq: (this.status?.seq ?? 0) + 1, action };
    }
    return this.status;
  }

  ask(player, { matchId, seat, requestId, text, goal: requested }) {
    if (!this.authorized(player, matchId, seat)) return fail(ERR.BAD_TARGET);
    if (this.active?.frame.requestId === requestId) return OK;
    const previous = this.turns.find(turn => turn.requestId === requestId);
    if (previous) { this.send(player.playerId, previous); return OK; }
    const question = text.trim();
    const { match } = this;
    const askedRound = /\bR\s*(\d{1,2})\b|第\s*(\d{1,2})\s*轮/i.exec(question); // i18n-ignore: recognizes round numbers in questions
    const targetRound = askedRound ? Number(askedRound[1] ?? askedRound[2])
      : /上(?:一)?轮|last round/iu.test(question) ? Math.max(1, match.round - 1) : null; // i18n-ignore: chat grammar
    const goal = requested ?? requestedGoal(question);
    if (goal) {
      const explicitRound = targetRound ?? (/这轮|本轮/u.test(question) ? match.round : null); // i18n-ignore: chat grammar
      return this.requestGoal(goal, requestId, question, explicitRound);
    }
    const now = performance.now();
    if (this.active || now - this.lastStarted < 1000) return fail(ERR.RATE);
    const facts = this.facts(player, question);
    const focusRound = facts.requestedRound;
    const dialogue = this.dialogue.slice();
    const request = {
      playerId: player.playerId,
      frame: { ...this.identity, requestId, question, round: match.round, referenceRound: focusRound ?? match.round },
      controller: new AbortController(), text: '', timer: null, lastDelta: -Infinity,
      rawText: '', factRound: facts.round, started: performance.now(), persona: JSON.stringify(this.getPersona?.()),
      chatOptions: chatProfile(question, this.getChatOptions ? (this.getChatOptions() ?? DEFAULT_CHAT_OPTIONS) : UNLIMITED_CHAT_OPTIONS).options,
    };
    this.lastStarted = now;
    this.active = request;
    this.send(request.playerId, { ...request.frame, state: 'streaming', text: '' });
    const failed = error => {
      const visible = normalizeAiFailure(error, error, request.controller.signal, (level, text) => this.match.log[level]?.(text));
      this.finish(request, 'error', { text: visible.message, reason: 'provider', sources: request.sources || [] });
    };
    request.timer = setTimeout(() => this.finish(request, 'error', { text: '回复等待超时，可以重试或取消。', reason: 'timeout' }),
      this.timeoutMs ?? chatProfile(question, request.chatOptions).timeoutMs);
    request.timer.unref?.();
    Promise.resolve().then(async () => {
      if (this.active !== request) return;
      const result = await this.stream({ question, facts, dialogue, getFacts: async () => this.facts(player, question),
        contextPrompt: request.contextPrompt,
        chatOptions: request.chatOptions }, request.controller.signal, (delta, meta = {}) => {
        if (this.active !== request) return false;
        if (meta.progress) request.progress = meta.progress;
        if (meta.extendedBudget) {
          request.extendedBudget = true;
          clearTimeout(request.timer);
          request.timer = setTimeout(() => this.finish(request, 'error', { text: '回复等待超时，可以重试。', reason: 'timeout' }),
            Math.max(0, request.started + chatProfile(question, request.chatOptions).extendedTimeoutMs - performance.now()));
          request.timer.unref?.();
          if (request.chatOptions.mode === 'daily') request.chatOptions = { ...request.chatOptions, maxChars: Math.max(300, request.chatOptions.maxChars) };
        }
        request.rawText += delta.slice(0, MAX_REPLY - request.rawText.length);
        request.text = replyText(request.rawText, request.chatOptions);
        const now = performance.now();
        if (request.text.trim() && now - request.lastDelta >= 50) {
          request.lastDelta = now;
          this.send(request.playerId, { ...request.frame, state: 'streaming', text: request.text });
        }
        return request.rawText.length < MAX_REPLY;
      });
      if (this.getPersona && JSON.stringify(this.getPersona()) !== request.persona) {
        this.finish(request, 'cancelled', { text: '已切换人设，请重新提问。' });
      } else if (request.text.trim()) this.finish(request, 'complete', { text: request.text.trim(), sources: result?.sources || [] });
      else failed(new Error('Standalone AI returned no text.'));
    }).catch(failed);
    return OK;
  }


  authorized(player, matchId, seat) {
    return player.playerId === this.playerId && player.connected && !player.left
      && matchId === this.identity.matchId && seat === this.identity.seat;
  }

  cancel(player, { matchId, seat, requestId }) {
    if (!this.authorized(player, matchId, seat)) return fail(ERR.BAD_TARGET);
    if (this.active?.frame.requestId === requestId) this.stop(player.playerId);
    return OK;
  }

  stop(playerId = this.active?.playerId) {
    if (this.active && this.active.playerId === playerId) this.finish(this.active, 'cancelled', { text: '' });
  }

  finish(request, state, body) {
    if (this.active !== request) return;
    this.active = null;
    clearTimeout(request.timer);
    request.controller.abort();
    const frame = { ...request.frame, state, complex: request.extendedBudget || chatProfile(request.frame.question).complex, ...body };
    if (state === 'complete' && this.match.round !== request.factRound) {
      frame.text = `你刚问第 ${request.factRound} 轮时：` + frame.text;
    }
    if (state === 'complete' && request.chatOptions.mode === 'daily') {
      frame.text = replyText(frame.text, request.chatOptions);
      // The fallback translation must not expand a capped literal response again on the client.
      delete frame.msgid; delete frame.params;
    }
    if (state === 'complete') this.dialogue = [...this.dialogue.slice(-2),
      { question: frame.question, answer: frame.text, round: frame.referenceRound }];
    this.publish(frame, request.chatOptions);
  }

  replay(player) {
    if (!this.authorized(player, this.identity.matchId, this.identity.seat)) return;
    for (const turn of this.turns) this.send(player.playerId, turn);
    for (const goal of this.goals.values()) if (!this.turns.includes(goal.frame)) this.send(player.playerId, goal.frame);
    if (this.active) this.send(player.playerId, { ...this.active.frame, state: 'streaming', text: this.active.text });
  }

  send(playerId, frame) {
    if (this.match.players.get(playerId)?.connected) this.match.sendTo(playerId, { t: 'm.teammateChat', ...frame });
  }
}
