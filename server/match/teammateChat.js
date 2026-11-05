import { randomUUID } from 'node:crypto';
import { ERR, PHASE } from '../../shared/constants.js';
import { msg, wireMessage } from '../../shared/i18n.js';
import { OK, fail } from './match/common.js';
import { DEFAULT_CHAT_OPTIONS, UNLIMITED_CHAT_OPTIONS, replyText } from './replyStyle.js';

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

function wavePreview(match, player) {
  return match.nextEnemiesFor(player).filter(e => e.source === 'wave' || e.boss).slice(0, 12).map(e => ({
    name: match.gd.enemy(e.enemyKey)?.name || e.enemyKey, count: e.count, gate: e.gate, flies: e.fly,
  }));
}

function ruleCards(match, question) {
  const query = question.toLowerCase();
  const matches = (...names) => names.some(name => name && query.includes(name.toLowerCase()));
  const chess = Object.values(match.data.chess || {}).filter(c => c.visible !== false && !c.isGolden
    && matches(c.name, c.appellation, c.chessId)).slice(0, 4).map(c => ({
    name: c.name, tier: c.tier, canHitFly: !!c.canHitFly && !['none', 'heal'].includes(c.attackKind),
    skill: c.skill?.name, skillDescription: c.skill?.desc?.slice(0, 280),
  }));
  const bonds = Object.values(match.data.bonds || {}).filter(b => matches(b.bondId, b.name?.length > 1 && b.name)).slice(0, 4)
    .map(b => ({ name: b.name, thresholds: b.thresholds, description: (b.effectDesc || b.desc || '').slice(0, 280) }));
  return { normalLpCap: match.gd.lpCapPerRound, chess, bonds };
}

export class TeammateChat {
  constructor(match, { seat, chat, chatTimeoutMs = 12000, getChatOptions }, playerId) {
    this.match = match;
    this.identity = { matchId: randomUUID(), seat };
    this.playerId = playerId;
    this.stream = chat;
    this.getChatOptions = getChatOptions;
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
    const canPlan = [PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP].includes(match.phase) && !player.ready
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
    if (canPlan && match.phase === PHASE.PREP) match._deepSeekWait?.stop('goal');
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
    const prior = this.dialogue.at(-1);
    const focusRound = targetRound ?? (!/刚才那(?:一)?轮/u.test(question)
      && /那(?:一)?轮|that round/iu.test(question) ? prior?.round : null) ?? null; // i18n-ignore: follow-up grammar
    const fromRound = focusRound ?? (/整局|全局|总结|whole match|summary/iu.test(question) ? 1 : Math.max(1, match.round - 6)); // i18n-ignore: chat grammar
    const focused = row => focusRound == null || row.round === focusRound;
    const inWindow = row => row.round >= fromRound && focused(row);
    const battles = this.battleMemory(fromRound, focusRound).filter(focused);
    const aboutTeammate = /你自己|你[这那]边|^你(?:刚才(?:那(?:一)?轮)?|上(?:一)?轮|这轮|本轮)?(?:打得|守得|漏了|掉血)|^(?:how did you (?:do|hold)|did you (?:leak|lose))/iu.test(question); // i18n-ignore: fallback subject
    const subjectSeat = aboutTeammate ? seat : player.seat;
    const relevant = battles.filter(e => e.kind !== 'normal' || e.seat === subjectSeat);
    const latest = relevant.at(-1);
    const ai = match.order.find(p => p.seat === seat);
    const includeCurrent = focusRound == null || focusRound >= match.round;
    const facts = {
      round: match.round, phase: match.phase, stage: match.stageId, difficulty: match.difficulty,
      requestedRound: focusRound, lastSettledRound: this.battles.at(-1)?.round ?? null, playerSeat: player.seat, aiSeat: seat,
      currentBoss: includeCurrent && match.bossPool && (match.phase === PHASE.FINAL_ASSAULT || match.phase === PHASE.HIDDEN_CORE)
        ? this.bossFacts(match.phase === PHASE.HIDDEN_CORE) : null,
      current: match.order.map(p => ({ seat: p.seat, lp: Math.max(0, p.lp), alive: p.alive,
        ...(includeCurrent && { band: p.gd.band(p.bandId)?.name, shopLevel: p.shop.level, lineup: lineup(p) }) })),
      ...(includeCurrent && { wavePreview: wavePreview(match, player), aiWavePreview: ai?.alive ? wavePreview(match, ai) : [] }),
      battles, aiChoices: this.choices.filter(inWindow), aiDecisions: [...this.decisions.values()].filter(inWindow),
      cooperation: this.turns.filter(turn => turn.goal && focused(turn.goal)).map(turn => turn.goal), rules: ruleCards(match, question),
    };
    const dialogue = this.dialogue.slice();
    const request = {
      playerId: player.playerId,
      frame: { ...this.identity, requestId, question, round: match.round, referenceRound: focusRound ?? latest?.round ?? match.round },
      controller: new AbortController(), text: '', timer: null, lastDelta: -Infinity,
      rawText: '', chatOptions: this.getChatOptions ? (this.getChatOptions() ?? DEFAULT_CHAT_OPTIONS) : UNLIMITED_CHAT_OPTIONS,
    };
    this.lastStarted = now;
    this.active = request;
    this.send(request.playerId, { ...request.frame, state: 'streaming', text: '' });
    const fallback = () => this.finish(request, 'complete', wireMessage(this.fallback(latest, subjectSeat, focusRound, facts.round)));
    request.timer = setTimeout(fallback, this.timeoutMs);
    request.timer.unref?.();
    Promise.resolve().then(async () => {
      if (this.active !== request) return;
      await this.stream({ question, facts, dialogue, chatOptions: request.chatOptions }, request.controller.signal, (delta) => {
        if (this.active !== request) return false;
        request.rawText += delta.slice(0, MAX_REPLY - request.rawText.length);
        request.text = replyText(request.rawText, request.chatOptions);
        const now = performance.now();
        if (request.text.trim() && now - request.lastDelta >= 50) {
          request.lastDelta = now;
          this.send(request.playerId, { ...request.frame, state: 'streaming', text: request.text });
        }
        return request.rawText.length < MAX_REPLY;
      });
      if (request.text.trim()) this.finish(request, 'complete', { text: request.text.trim() });
      else fallback();
    }).catch(fallback);
    return OK;
  }

  fallback(battle, seat, targetRound, round) {
    if (seat === this.identity.seat && battle?.kind === 'normal') return msg('我刚看了下，第 {round} 轮我这边漏了 {leaks} 个，掉了 {loss} 点血。',
      { round: battle.round, leaks: battle.leaks, loss: battle.lpLoss });
    if (battle?.kind === 'normal') return msg('我刚看了下，第 {round} 轮你漏了 {leaks} 个，掉了 {loss} 点血。',
      { round: battle.round, leaks: battle.leaks, loss: battle.lpLoss });
    if (seat === this.identity.seat && battle) return msg('我看了下，第 {round} 轮我打了领袖 {damage} 点伤害。',
      { round: battle.round, damage: battle.damage.find(p => p.seat === seat)?.damage ?? 0 });
    if (battle) return msg('我看了下，第 {round} 轮你打了领袖 {damage} 点伤害。',
      { round: battle.round, damage: battle.damage.find(p => p.seat === seat)?.damage ?? 0 });
    return msg('第 {round} 轮的结果我还没看到，等结算了再聊。', { round: targetRound ?? round });
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
    const frame = { ...request.frame, state, ...body };
    if (request.chatOptions.mode === 'daily') {
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
