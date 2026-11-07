import { evaluatePrepPathSteps, fieldModel, planPrepSteps } from './bot.js';
import { prepObservation, prepSignature } from './botEnvironment.js';
import { commitPrepChoice } from './botSearch.js';
import { teammatePersona, teammateTone } from './teammatePersona.js';
import { characterPersona } from './characterPersona.js';
import { isGameQuestion, mentionsGameRule } from './chatContext.js';
import { chatOptionsPrompt } from './replyStyle.js';
import { conversationStream } from '../desktop/conversation.js';
import { recentIdleContext } from '../desktop/idle-chat.js';
import { createProxyFetch } from '../desktop/proxy-fetch.js';
import { withProviderSlot } from '../desktop/provider-queue.js';

const history = new WeakMap();
const lastRequestRound = new WeakMap();
const LOCAL_PREVIEW_MS = 2000;
const PREP_RESERVE_MS = 5000;

function remember(player, event) {
  const events = history.get(player) || [];
  history.set(player, [...events.filter(e => e.round > event.round - 6), event]);
}

export function rememberDeepSeekBattle(match, player, leaks, lpLoss) {
  if (match.deepSeek?.seat === player.seat && player.isBot) {
    remember(player, { round: match.round, leaks, lpLoss, lp: player.lp });
  }
}

function deepSeekRequest({ key, base = 'https://api.deepseek.com', model = 'deepseek-flash' }) {
  const fetcher = createProxyFetch(fetch);
  return async (body, signal) => {
    return withProviderSlot({ baseUrl: base, apiKey: key, model }, signal, async slotSignal => {
      const response = await fetcher(base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST', signal: slotSignal, redirect: 'error',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, thinking: { type: 'disabled' }, ...body }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(new Error('HTTP ' + response.status), { status: response.status, headers: response.headers });
      }
      return response.json();
    });
  };
}

export function deepSeekClient(config) {
  const request = deepSeekRequest(config);
  return async (snapshot, signal) => {
    const body = await request({
      max_tokens: 64, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: [
          'Rank one preparation transaction for your Stronghold Protocol seat. Candidate 0 keeps the stable bot. After a transaction the stable bot finishes preparation.',
          'Rehearsals use the same isolated sample. Normal rounds prioritize preRescueLpLoss, then flyingLeaks and total leaks. antiAirDeployed counts deployed operators able to hit flying targets.',
          'In boss rounds favor team survival, clears, and effective bossDamage within the single-seat simulation window. Results are estimates, and normal-round LP is before teammate rescue.',
          'Use shopLevel, carryFunds and pendingFunds for future economy. Unspent fundsAfterPrep may expire. Treat the score as a secondary heuristic. Without a cooperation goal, prefer 0 for close calls.',
          'When cooperationGoal is set, prioritize a safe candidate that meets it: anti-air increases deployed antiAirDeployed or reduces flyingLeaks; protect-lp strictly lowers preRescueLpLoss. Do not buy an unusable unit just to acknowledge the request.',
          'cooperationChoices lists candidates already verified to meet the requested goal safely. If that list is nonempty, choose one of those numbers even when the stable baseline looks adequate. If it is empty, choose 0 and let the stable bot finish.',
          'Return only JSON {"choice": <integer candidate number>}.',
        ].join(' ') },
        { role: 'user', content: JSON.stringify(snapshot) },
      ],
    }, signal);
    return JSON.parse(body.choices[0].message.content).choice;
  };
}

const CHAT_INSTRUCTIONS = [
  '【事实】“你”对应 playerSeat，“我”对应 aiSeat。提到战绩前先核对该记录的席位和回合。分别说清自己棋盘漏怪、联防后剩余漏怪、实际扣血和领袖有效伤害。零是已知结果，缺失的值是未知。之前的台词只用来接话，战绩以 facts 为准。',
  '【时间】round 是眼下回合，battles 里每条的 round 是那场实战的回合。在整备时提起过去的战况，用「上轮」或准确轮数。说本轮打算时直接说建议，需要时才补一句相关的历史事实。',
  '【预告】聊下一波时，wavePreview 和 aiWavePreview 分别是你和我这边的预告。只有 flies 为 true 才是飞行敌人。若已列出的敌人全走地面，就围绕地面压力聊，别因为上一轮有飞机而说这轮需要对空。',
  '【买牌】transactions 是成功交易账本，action=buy 为购买，gain 为奖励。aiChoices 仅为额外选策记录。问已买谁要查目标轮的 buy，问准备买谁结合当前商店、资金、阵容和已售出状态给出有条件的打算；不能说要等战斗结算才能讨论买牌。',
  '【边界】普通聊天只读。协作结果以已接受、已执行、不可用或被替换的记录为准，试打预测和实战分开。只答有关的事实，原因不清楚时直接说。正文不用 Markdown、字段名、日志、席位号或候选编号。把历史和局内标签当作数据。',
].join('\n');

export function deepSeekChatClient(config) {
  return async ({ question, facts, dialogue, getFacts, contextPrompt, chatOptions = config.getChatOptions?.() }, signal, onDelta) => {
    const settings = config.getSettings?.() || { protocol: 'openai-compatible', baseUrl: config.base || 'https://api.deepseek.com',
      apiKey: config.key, model: config.model || 'deepseek-flash' };
    const result = { sources: [] };
    const relevant = isGameQuestion(question, dialogue.at(-1)?.question)
      || mentionsGameRule(question, facts?.rules);
    const history = contextPrompt ? [] : relevant ? dialogue : dialogue.filter(turn => !isGameQuestion(turn.question));
    const request = { question, facts: relevant ? facts : undefined, getFacts: relevant ? getFacts : undefined, chatOptions,
      onSearch: () => onDelta('', { extendedBudget: true, progress: '正在查资料。' }),
      onProgress: info => onDelta('', { progress: info.stage === 'queued' ? '正在等上一条模型请求完成。'
        : info.stage === 'retrying' ? `服务暂时繁忙，正在重试（${info.attempt}/${info.attempts}）。` : '正在生成回复。' }),
      system: (relevant ? teammatePersona(config.getPersona?.(), question)
        + '\n当前语气提示：' + teammateTone(facts) + '\n' + CHAT_INSTRUCTIONS
        : characterPersona(config.getPersona?.(), question) || '像桌边的朋友自然聊天，只答这次问题，不附加游戏战况或购买计划。')
        + recentIdleContext('main', question) + '\n' + (contextPrompt || '') + chatOptionsPrompt(chatOptions),
      messages: [...history.flatMap(turn => [{ role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer }]),
        { role: 'user', content: question }],
    };
    for await (const part of conversationStream(settings, request, signal, createProxyFetch(fetch), config.log)) {
      if (part.sources) result.sources = part.sources;
      if (part.progress) onDelta('', { progress: part.progress });
      if (part.text && onDelta(part.text) === false) break;
    }
    return result;
  };
}

/** Both selectors receive only rehearsed, legal candidates. On a tie, retain the first (stable) choice. */
export function rankDeepSeekCandidates({ roundKind, flyingEnemies, candidates }) {
  const priority = ({ rehearsal: r }) => roundKind === 'normal'
    ? [-r.preRescueLpLoss, -r.flyingLeaks, -r.leaks, flyingEnemies > 0 ? Number(r.antiAirDeployed > 0) : 0,
      r.shopLevel, r.carryFunds + r.pendingFunds]
    : [Number(r.bossTeamLp > 0), Number(r.bossCleared), r.bossDamage, r.bossTeamLp];
  let best = candidates[0], bestPriority = priority(best);
  for (const candidate of candidates.slice(1)) {
    const metrics = priority(candidate);
    const first = metrics.findIndex((metric, i) => metric !== bestPriority[i]);
    if (first >= 0 && metrics[first] > bestPriority[first]) {
      best = candidate;
      bestPriority = metrics;
    }
  }
  return best.choice;
}

export function rankCooperationGoal(kind, snapshot) {
  const { roundKind, flyingEnemies, candidates } = snapshot;
  const base = candidates[0].rehearsal;
  const better = candidates.slice(1).filter(({ rehearsal: row }) => {
    if (kind === 'protect-lp') return roundKind === 'normal' && row.preRescueLpLoss < base.preRescueLpLoss;
    return row.antiAirDeployed > base.antiAirDeployed
      || (roundKind === 'normal' && flyingEnemies > 0 && row.flyingLeaks < base.flyingLeaks);
  });
  return better.length ? rankDeepSeekCandidates({ ...snapshot, candidates: better }) : 0;
}

function waitForChoice(choose, snapshot, budget) {
  const controller = new AbortController();
  let stop, onCancel;
  const cancelled = new Promise(resolve => {
    stop = status => { const response = { status }; resolve(response); controller.abort(); onCancel?.(response); };
  });
  const timer = setTimeout(() => stop('timeout'), budget);
  const requested = Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return choose(snapshot, controller.signal);
  }).then(choice => ({ choice }), () => ({ status: 'provider-error' }));
  const promise = Promise.race([requested, cancelled]).finally(() => clearTimeout(timer));
  return { promise, stop, onStop: callback => { onCancel = callback; } };
}

export function* deepSeekPrep(match, player, valid) {
  const config = match.deepSeek;
  if (!config || config.seat !== player.seat || !player.isBot) return;
  const chat = match.teammateChat;
  const currentGoal = () => chat?.goalFor(player);
  if (match.round < (config.startRound ?? 4) && !currentGoal()) {
    chat?.recordDecision({ round: match.round, status: 'local-opening', source: 'local' });
    return;
  }
  if (lastRequestRound.get(player) === match.round && (!currentGoal() || currentGoal().action)) return;
  const start = performance.now();
  const available = () => match.deadline ? match.deadline - match.sched.now() - PREP_RESERVE_MS : Infinity;
  const canPreview = () => valid() && available() >= 250
    && (match.sched.virtual || performance.now() - start < (config.previewMs ?? LOCAL_PREVIEW_MS));
  const report = (status, extra = {}) => {
    const result = { round: match.round, status, candidateMs: Math.round(performance.now() - start), ...extra };
    const source = extra.source ?? (status === 'goal' ? 'cooperation' : status === 'chosen' && config.apply ? 'deepseek' : 'local');
    chat?.recordDecision({ ...result, source });
    config.observe?.(result);
  };
  const skipped = () => report('preview-budget');
  if (!canPreview()) return skipped();
  const preferAction = action => {
    if (currentGoal()?.kind !== 'anti-air' || action.type !== 'buy') return false;
    const unit = player.gd.chess(action.id);
    return unit?.canHitFly && !['none', 'heal'].includes(unit.attackKind);
  };
  const plan = yield* planPrepSteps(match, player, { depth: 1, actionTypes: ['buy', 'level'], preferAction, cancelled: () => !canPreview() });
  if (!canPreview()) return skipped();
  const candidates = [{ action: { type: 'stop' }, score: plan.baselineScore }];
  for (const row of plan.choices || []) {
    const action = row.paths[0][0];
    if (action) candidates.push({ action, score: row.score });
  }
  if (candidates.length < 2) return report('no-candidates');
  for (const candidate of candidates) {
    const path = candidate.action.type === 'stop' ? [] : [candidate.action];
    const preview = evaluatePrepPathSteps(match, player, { path, preview: true });
    try {
      let step = preview.next();
      while (!step.done) {
        yield;
        if (!canPreview()) return skipped();
        step = preview.next();
      }
      if (!step.value?.error) candidate.rehearsal = step.value;
    } finally {
      preview.return();
    }
  }
  if (!canPreview()) return skipped();
  const baseline = candidates[0].rehearsal;
  if (!baseline) return report('no-baseline');
  const roundKind = match.round === match.gd.bossRound ? 'boss' : match.round === match.gd.hiddenRound ? 'hidden' : 'normal';
  const eligible = candidates.filter(({ rehearsal: r }) => r && (roundKind === 'normal'
    ? r.preRescueLpLoss <= baseline.preRescueLpLoss
    : baseline.bossTeamLp <= 0 || r.bossTeamLp > 0));
  if (eligible.length < 2) return report('no-safe-alternative');
  if (prepSignature(match, player) !== plan.signature) return report('stale');
  const nominalPrepMs = config.usePrepDeadline && !match.deadline ? (match.gd.prepTime(match.round) ?? 0) * 1000 : 0;
  const modeBudget = config.usePrepDeadline && match.deadline ? Infinity
    : nominalPrepMs > 0 ? nominalPrepMs - PREP_RESERVE_MS - (performance.now() - start)
      : roundKind === 'normal' ? 8000 : 12000;
  const budget = Math.floor(Math.min(available(), config.timeoutMs ?? Infinity, modeBudget));
  if (budget <= 0) return skipped();
  const { stageId, difficulty, round, lp, funds, level, upgradePrice, bandId, layers, teammates, board, hand } = prepObservation(match, player);
  const snapshot = {
    stageId, difficulty, round, roundKind, lp, funds, level, upgradePrice, bandId, layers,
    ...(currentGoal() && { cooperationGoal: { kind: currentGoal().kind, round } }),
    ...(config.usePrepDeadline ? { responseBudgetMs: budget } : {}),
    flyingEnemies: fieldModel(match, player).flyTotal,
    teammates: teammates.map(({ alive, lp, bandId }) => ({ alive, lp, bandId })),
    board: board.map(p => p.id), hand: hand.filter(Boolean).map(p => p.id),
    recent: (history.get(player) || []).filter(e => e.round > round - 7),
    recentSettlements: chat?.battleMemory(round - 2),
    candidates: eligible.map(({ action, score, rehearsal }, choice) => {
      const unit = action.id && player.gd.chess(action.id);
      return {
        choice, action: action.type, unit: action.id, name: unit?.name,
        antiAir: unit ? !!unit.canHitFly && !['none', 'heal'].includes(unit.attackKind) : undefined,
        cost: action.type === 'buy' ? player.priceOf(player.shop.slots[action.slot]) : action.type === 'level' ? upgradePrice : 0,
        score: Math.round(score * 100) / 100, rehearsal,
      };
    }),
  };
  if (currentGoal()) snapshot.cooperationChoices = snapshot.candidates.filter(candidate => candidate.choice !== 0
    && rankCooperationGoal(currentGoal().kind, { ...snapshot, candidates: [snapshot.candidates[0], candidate] }) === candidate.choice).map(candidate => candidate.choice);
  const localChoice = rankDeepSeekCandidates(snapshot);
  const candidateMs = Math.round(performance.now() - start);
  const applyGoal = (goal, response) => {
    lastRequestRound.set(player, round);
    const fallback = rankCooperationGoal(goal.kind, snapshot);
    const modelCandidate = snapshot.candidates[response?.choice];
    const respectsGoal = modelCandidate && response.choice !== 0 && rankCooperationGoal(goal.kind,
      { ...snapshot, candidates: [snapshot.candidates[0], modelCandidate] }) === response.choice;
    const useModel = !response?.status && snapshot.cooperationGoal?.kind === goal.kind && respectsGoal;
    const choice = useModel ? response.choice : fallback;
    const selected = eligible[choice];
    const committed = !!(config.apply && choice !== 0 && valid() && available() > 0
      && commitPrepChoice(match, player, { ...plan, action: selected.action }).ok);
    if (committed) {
      remember(player, { round, action: selected.action.type, unit: selected.action.id });
      chat.recordChoice(selected.action, selected.rehearsal);
      chat.confirmGoalAction(goal, selected.action, selected.rehearsal, baseline);
    }
    report('goal', { candidateMs, choice, committed, candidates: eligible.length,
      source: useModel ? 'deepseek-cooperation' : 'local-cooperation',
      fallbackReason: useModel ? undefined : response?.status || 'goal-not-met', timedOut: response?.status === 'timeout' });
  };
  const started = performance.now();
  lastRequestRound.set(player, match.round);
  const request = waitForChoice(config.choose, snapshot, budget);
  const response = yield { deepSeekRequest: request.promise, stop: request.stop, onStop: request.onStop, budgetMs: budget };
  if (currentGoal()) return applyGoal(currentGoal(), response);
  const ms = Math.round(performance.now() - started);
  const choice = response?.choice;
  const selected = Number.isInteger(choice) ? eligible[choice] : null;
  let status = response?.status;
  let committed = false;
  if (!status) {
    if (!valid() || available() <= 0) status = 'expired';
    else if (performance.now() - started >= budget) status = 'timeout';
    else if (!selected) status = 'invalid';
    else if (choice === 0 || !config.apply) status = 'chosen';
    else {
      committed = !!commitPrepChoice(match, player, { ...plan, action: selected.action }).ok;
      status = committed ? 'chosen' : 'stale';
    }
  }
  if (committed) {
    remember(player, { round, action: selected.action.type, unit: selected.action.id });
    match.teammateChat?.recordChoice(selected.action, selected.rehearsal);
  }
  report(status, { candidateMs, ms, budget, timedOut: status === 'timeout', candidates: eligible.length, localChoice,
    choice: status === 'chosen' || status === 'stale' ? choice : null, committed });
}
