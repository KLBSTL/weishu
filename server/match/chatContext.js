import { PHASE } from '../../shared/constants.js';

const clean = (value, n = 1600) => typeof value === 'string' ? value.replace(/<[^>]*>/gu, '').slice(0, n) : value;
const gameTopic = /卫戍|干员|盟约|整备|阵容|棋盘|商店|棋子|部署|联防|漏怪|击杀|对空|保血|战况|战绩|掉血|买牌|买谁|买哪些|准备补|打得怎么样|这[轮局把波]|本轮|[上下](?:一)?[轮波]|第\s*\d+\s*轮|\bLP\b|\bR\d+\b/iu;
export function isGameQuestion(question, previous = '') {
  const text = String(question || '');
  return gameTopic.test(text) || (/^(?:那|所以)?(?:为什么|怎么办|怎么补|然后呢|刚才呢|继续|接着说)[？?。！!\s]*$/u.test(text.trim()) && gameTopic.test(previous));
}
export function mentionsGameRule(question, records = []) {
  const text = String(question || '').trim();
  return records.some(row => typeof row.name === 'string' && (row.name.length > 1 ? text.includes(row.name)
    : text.startsWith(row.name) && text.length < 20 && /怎么样|如何|技能|值得买|怎么用|好用/u.test(text)));
}
export function gamePrimer(data) {
  return ['这是本地同人版《卫戍协议：盟约》，具体数值以本版数据为准，可能不同于官方。',
    '整备时用资金购买当前商店里的干员、装备，刷新或升级商店；布置棋盘与装备。整备结束进行自动战斗，漏怪、联防与实际扣血分别结算，领袖战另算有效伤害。',
    '合成、盟约激活与技能有各自条件，不能按其他模式或角色背景猜机制。钱够不等于买到了，购买成功以交易账本为准。当前商店没有的干员只能作为后续意向。',
    '普通聊天只读，不会代替实际交易；选策仍由现有 AI 执行。人物卡的示例不是本局发生的事。',
    '当前数据类别：' + Object.keys(data || {}).filter(k => ['chess', 'items', 'bonds', 'bands', 'enemies', 'modes', 'stages'].includes(k)).join('、'),
  ].join('\n');
}
export function lookupRules(data, query = '') {
  const q = String(query).normalize('NFKC').toLowerCase().slice(0, 500);
  const words = q.split(/[\s，。？！、,:;]+/u).filter(Boolean);
  const rows = [];
  for (const category of ['chess', 'items', 'bonds', 'bands', 'enemies', 'modes', 'stages']) {
    for (const [id, rec] of Object.entries(data?.[category] || {})) {
      if (!rec || typeof rec !== 'object' || rec.visible === false) continue;
      const name = typeof rec.name === 'string' ? rec.name : id;
      const searchable = JSON.stringify(rec).toLowerCase();
      const score = (q.includes(name.toLowerCase()) ? 50 : 0) + words.reduce((n, word) =>
        n + (word.length > 1 && searchable.includes(word) ? 2 : 0), 0);
      if (!score) continue;
      const details = Object.fromEntries(Object.entries(rec).filter(([key]) =>
        /name|desc|skill|trait|tier|cost|price|threshold|effect|canHitFly|attackKind|bond|recruit|time|round|hp|atk|def|res|range|block|attack|stat|position|token|speed/iu.test(key))
        .map(([key, value]) => [key, clean(typeof value === 'object' ? JSON.stringify(value) : value)]));
      rows.push({ category, id, name, elite: !!rec.isGolden, score, details });
    }
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, 10).map(({ score: _score, ...row }) => row);
}

export function recordChatEvent(player, event) {
  const match = player.m;
  if (match?._botPlanningBranch || match?.players?.get(player.playerId) !== player) return;
  match.teammateChat?.recordTransaction(player, event);
}

export function liveChatFacts(chat, player, question = '') {
  const match = chat.match, seat = chat.identity.seat;
  const ai = match.order.find(p => p.seat === seat);
  const explicit = /\bR\s*(\d{1,2})\b|第\s*(\d{1,2})\s*轮/iu.exec(question);
  const requestedRound = explicit ? Number(explicit[1] ?? explicit[2])
    : /上(?:一)?轮|last round/iu.test(question) ? (match.round > 1 ? match.round - 1 : null)
      : /那(?:一)?轮|that round/iu.test(question) ? chat.dialogue.at(-1)?.round ?? null : null;
  const describe = piece => piece && ({ id: piece.id, kind: piece.kind, name: (piece.kind === 'chess' ? match.gd.chess(piece.id) : match.gd.item(piece.id))?.name || piece.id,
    elite: !!match.gd.chess(piece.id)?.isGolden, items: piece.items?.map(item => ({ id: item.id, name: match.gd.item(item.id)?.name || item.id })) });
  const state = p => ({ seat: p.seat, lp: Math.max(0, p.lp), alive: p.alive,
    band: p.gd.band(p.bandId)?.name, shopLevel: p.shop.level,
    lineup: [...p.board.values()].map(describe).filter(Boolean),
    board: [...p.board.entries()].map(([tile, piece]) => ({ tile, ...describe(piece) })),
    ...(p.seat === seat && {
      funds: p.funds, pendingFunds: p.pendingFunds, ready: !!p.ready, upgradePrice: p.shop.upgradePrice,
      hand: p.hand.map(describe), overflow: p.temp.map(describe), bonds: p.bonds,
      shop: p.shop.slots.map((slot, index) => slot && ({ index, id: slot.id,
        name: (slot.kind === 'chess' ? p.gd.chess(slot.id) : p.gd.item(slot.id))?.name || slot.id,
        kind: slot.kind, price: p.priceOf(slot), sold: !!slot.sold, frozen: !!slot.frozen,
        ...(slot.kind === 'chess' && { tier: p.gd.chess(slot.id)?.tier,
          canHitFly: !!p.gd.chess(slot.id)?.canHitFly && !['none', 'heal'].includes(p.gd.chess(slot.id)?.attackKind),
          normalCopiesOwned: p.countCopies(p.gd.baseIdOf(slot.id)), mergeCount: p.gd.mergeCount(slot.id) }) })),
    }),
  });
  const preview = p => p?.alive ? match.nextEnemiesFor(p).filter(e => e.source === 'wave' || e.boss).slice(0, 12)
    .map(e => ({ name: match.gd.enemy(e.enemyKey)?.name || e.enemyKey, count: e.count, gate: e.gate, flies: e.fly })) : [];
  const current = match.order.map(state);
  let signature = 2166136261;
  for (const char of JSON.stringify(current)) signature = Math.imul(signature ^ char.charCodeAt(0), 16777619) >>> 0;
  return { matchId: chat.identity.matchId, sampledAt: Date.now(), version: [match.round, match.phase, chat.transactions.length, signature].join(':'),
    round: match.round, phase: match.phase, stage: match.stageId, difficulty: match.difficulty,
    remainingPrepMs: match.phase === PHASE.PREP && match.deadline ? Math.max(0, match.deadline - match.sched.now()) : null,
    requestedRound, lastSettledRound: chat.battles.at(-1)?.round ?? null, playerSeat: player.seat, aiSeat: seat,
    historyStartsAtRound: chat.historyStartsAtRound, transactions: chat.transactions.filter(e => requestedRound == null || e.round === requestedRound),
    current, wavePreview: preview(player), aiWavePreview: preview(ai),
    currentBoss: match.bossPool && [PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE].includes(match.phase) ? chat.bossFacts(match.phase === PHASE.HIDDEN_CORE) : null,
    battles: chat.battleMemory(1, requestedRound).filter(e => requestedRound == null || e.round === requestedRound),
    aiChoices: chat.choices.filter(e => requestedRound == null || e.round === requestedRound),
    aiDecisions: [...chat.decisions.values()].filter(e => requestedRound == null || e.round === requestedRound),
    cooperation: chat.turns.filter(e => e.goal).map(e => e.goal),
    primer: gamePrimer(match.data), rules: lookupRules(match.data, question),
  };
}
