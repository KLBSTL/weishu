import { PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { Match } from './Match.js';
import { fieldModel } from './bot.js';
import { legalTiles, parseKey, placeClass } from './board.js';
import { legalPrepActions, prepObservation } from './botEnvironment.js';
import { cardView } from './choices.js';
import { bossPoolHp } from './finalAssault.js';
import { DELAYS } from './match/common.js';

const PREP_ACTIONS = ['g.buy', 'g.sell', 'g.refresh', 'g.freeze', 'g.levelUp', 'g.reward', 'g.move', 'g.equip', 'g.art',
  'g.destroy', 'g.recruitOpen', 'g.recruitCancel', 'g.recruitPick', 'g.choice', 'g.ready'];
const MAX_BATCHES = 8;
const MAX_ACTIONS = 16;
const RULES = [
  'Survive normal waves, keep team LP, and damage the shared leader in boss rounds. Battles run automatically after Ready.',
  'Most bands lose unspent funds at the end of prep. The shop draws from shared stock. Buying duplicates can merge and create a reward.',
  'Coordinates are [row,col]. Larger rows are higher on screen. Range offsets are for RIGHT; directions are RIGHT, LEFT, UP and DOWN.',
  'Use tiles.melee for melee placement, tiles.high for high-only placement, and tiles.all for ranged or unrestricted placement. Owner-bound summons have additional placement rules.',
  'Reply with {requestId,actions:[{t,...fields}]}. Drafts take one action. A Ready action must be last with ready:true.',
  'After a purchase, reward, refresh, level, Art, recruitment or personal choice, the engine stops the batch and sends the new state. Use observed UIDs only.',
];

function record(gd, { kind, id }) {
  return kind === 'chess' ? gd.chess(id) : kind === 'token' ? gd.token(id) : gd.item(id);
}

function unitCard(ps, piece) {
  const raw = record(ps.gd, piece);
  const rec = piece.kind === 'chess' && raw ? ps.fieldRecord(raw) || raw : raw;
  if (!rec) return null;
  if (piece.kind === 'item') return { name: rec.name, type: rec.itemType, description: rec.desc?.slice(0, 220), rangeRight: rec.rangeGrid };
  const { maxHp, atk, def, res, blockCnt, bat } = rec.stats || {};
  return { name: rec.name, position: placeClass(ps, raw), tier: rec.tier, hp: maxHp, atk, def, res, block: blockCnt, attackInterval: bat,
    antiAir: !!rec.canHitFly && !['none', 'heal'].includes(rec.attackKind), attackKind: rec.attackKind, damageType: rec.dmgType,
    rangeRight: rec.rangeGrid, bonds: rec.bonds, skill: rec.skill?.desc?.slice(0, 180) };
}

function prepSnapshot(match, player) {
  const { board, hand, temp, shop, offers, funds, pendingFunds, level, freeRefreshes, upgradePrice, bonds, layers } = prepObservation(match, player);
  const recruitment = player.recruitmentView();
  const recruits = (recruitment?.offer?.ids || []).map(id => ({ kind: 'chess', id }));
  const pieces = [...board, ...hand, ...temp, ...shop, ...(offers[0]?.slots || []), ...recruits].filter(Boolean);
  const cards = Object.fromEntries([...new Map(pieces.map(p => [p.id, p])).values()]
    .map(p => [p.id, unitCard(player, p)]).filter(([, card]) => card));
  const wave = match.wave || match.bossGroupOf(player)?.wave;
  const battleKind = match.round === match.gd.bossRound ? 'boss' : match.round === match.gd.hiddenRound ? 'hidden' : 'normal';
  const bossId = battleKind === 'hidden' ? match.hiddenBossId : match.bossId;
  const foes = [...new Set((wave?.spawns || []).map(s => s.enemyKey))].map(id => {
    const e = match.gd.enemy(id), s = e?.stats;
    return [id, { name: e?.name, fly: e?.isFlyEnemy, baseHp: s?.maxHp, def: s?.def, res: s?.res, baseSpeed: s?.moveSpeed }];
  });
  return {
    battleKind, lpLossCap: match.gd.lpCapPerRound,
    boss: battleKind === 'normal' ? null : { id: bossId, name: match.gd.boss(bossId)?.name,
      poolHp: bossPoolHp(match.gd, bossId, match.alivePlayers().length),
      teamLp: match.teamLp ?? match.alivePlayers().reduce((sum, p) => sum + Math.max(0, p.lp), 0) },
    funds, pendingFunds, level, upgradePrice, refreshPrice: player.gd.refreshPrice, freeRefreshes, frozen: player.shop.frozen,
    carryFunds: player.gd.leftoverKeptBands.includes(player.bandId), deployCap: player.deployCap,
    board: board.map(({ at, ...piece }) => ({ ...piece, at: parseKey(at) })), hand, temp,
    shop: shop.map((s, i) => s && { id: s.id, kind: s.kind, cost: player.priceOf(player.shop.slots[i]), sold: !!s.sold }),
    reward: offers[0]?.slots, recruitment, artsLeft: Math.max(0, player.gd.maxArtsPerRound - player.round.arts),
    personalChoice: player.personalChoice && { id: player.personalChoice.id, cards: player.personalChoice.cards.map(cardView) },
    economyActions: legalPrepActions(match, player).filter(a => a.type !== 'stop'), cards, bonds, layers,
    tiles: Object.fromEntries(['melee', 'high', 'all'].map(pos => [pos, legalTiles(player.deployMap(), pos)])),
    routes: fieldModel(match, player).routes.map(({ n, fly, tiles }) => ({ n, fly, tiles: tiles.map(parseKey) })),
    enemies: Object.fromEntries(foes),
    templateRoutes: (wave?.routes || []).map(({ start, end, checkpoints }) => ({ start, end, checkpoints })),
    spawns: (wave?.spawns || []).map(({ enemyKey, routeIndex, time, count, interval }) => ({ enemyKey, templateRoute: routeIndex, time, count, interval })),
  };
}

function draftSnapshot(match, player) {
  if (match.phase === PHASE.SP_DRAFT) return { cards: match.sp.cards.filter(c => match.sp.taken[c.idx] == null).map(cardView) };
  return { bands: match.gd.bandIds().filter(id => !match.bandTaken(id, player.playerId) && !match.recruitmentBandOff(id))
    .map(id => { const band = match.gd.band(id); return { id, name: band.name, description: band.desc }; }),
  canSkip: !match.isSolo && match.draft.skipsLeft[player.playerId] > 0 && match.draft.idx < match.draft.order.length - 1 };
}

function stateKey(match, player) {
  if (match.phase !== PHASE.PREP) return match._turnToken;
  const { teammates, ...own } = prepObservation(match, player);
  void teammates;
  return JSON.stringify([own, player.personalChoice?.id, player.recruitmentView()]);
}

/** The provider selects normal player intents for one actual bot seat. Other seats use the existing AI. */
export class FullDecisionMatch extends Match {
  constructor({ fullDecision, ...opts }) {
    super(opts);
    if (!this.order.some(p => p.seat === fullDecision?.seat && p.isBot) || typeof fullDecision.decide !== 'function') {
      throw new TypeError('Full decision requires a bot seat and a decision provider');
    }
    this.fullDecision = fullDecision;
    this.decisionSeq = 0;
    this.decisionPending = null;
    this.decisionTurn = null;
    this.decisionSettlements = [];
  }

  controls(player) { return player?.isBot && player.seat === this.fullDecision.seat; }

  scheduleBandBot() {
    const player = this.players.get(this.draftTurn());
    if (!this.controls(player)) return super.scheduleBandBot();
    this.scheduleDecision(player, 0, () => super.scheduleBandBot());
  }

  scheduleSpBot() {
    const player = this.players.get(this.spTurn());
    if (!this.controls(player)) return super.scheduleSpBot();
    this.scheduleDecision(player, this.scaled(DELAYS.BOT_ACTION), () => super.scheduleSpBot());
  }

  scheduleBotPrep(player, index = 0) {
    if (!this.controls(player)) return super.scheduleBotPrep(player, index);
    this.scheduleDecision(player, this.scaled(DELAYS.BOT_ACTION + index * DELAYS.BOT_STAGGER), () => super.scheduleBotPrep(player, 0));
  }

  scheduleDecision(player, delay, fallback) {
    const { round, phase, _turnToken } = this;
    const key = `${phase}:${round}:${_turnToken}`;
    if (this.decisionTurn?.key === key) return;
    const started = performance.now();
    const turn = { key, batch: 0, feedback: null, stop: null };
    this.decisionTurn = turn;
    const valid = () => !this.disposed && !this.ended && this.phase === phase && this.round === round && this._turnToken === _turnToken
      && player.alive && (phase !== PHASE.PREP || !player.ready) && (!this.deadline || this.deadline > this.sched.now());
    const recover = status => {
      this.fullDecision.observe?.({ phase, round, status, fallback: true });
      if (valid()) fallback();
    };
    const next = () => {
      if (!valid()) return;
      const remaining = Math.min((this.fullDecision.timeoutMs ?? 30000) - (performance.now() - started),
        this.deadline ? this.deadline - this.sched.now() - 3000 : Infinity);
      if (++turn.batch > MAX_BATCHES || remaining < 250) return recover('budget');
      const requestId = ++this.decisionSeq, version = stateKey(this, player);
      const snapshot = { requestId, phase, round, remainingMs: Math.floor(remaining), stage: this.stageId, difficulty: this.difficulty,
        seat: player.seat, lp: player.lp, band: player.bandId, rules: RULES, feedback: turn.feedback,
        teammates: this.order.filter(p => p !== player).map(p => ({ seat: p.seat, band: p.bandId, lp: p.lp, alive: p.alive })),
        recent: this.decisionSettlements,
        ...(phase === PHASE.PREP ? { allowed: PREP_ACTIONS, ...prepSnapshot(this, player) } : draftSnapshot(this, player)),
      };
      const controller = new AbortController();
      const stopped = Promise.withResolvers();
      turn.stop = () => { stopped.resolve(null); controller.abort(); };
      const timer = setTimeout(turn.stop, remaining);
      const sent = performance.now();
      const pending = Promise.resolve().then(() => this.fullDecision.decide(snapshot, controller.signal)).catch(() => null);
      this.decisionPending = Promise.race([pending, stopped.promise]).then(reply => {
        if (!valid()) return;
        if (!reply || controller.signal.aborted || performance.now() - sent >= remaining) return recover('no-response');
        if (reply.requestId !== requestId || !Array.isArray(reply.actions) || !reply.actions.length
          || reply.actions.length > (phase === PHASE.PREP ? MAX_ACTIONS : 1)) return recover('invalid-response');
        const feedback = stateKey(this, player) === version ? this.applyDecision(player, phase, reply.actions) : { applied: 0, status: 'stale' };
        this.flush();
        turn.feedback = feedback;
        this.fullDecision.observe?.({ phase, round, requestId, ms: Math.round(performance.now() - sent), ...feedback });
        if (feedback.status !== 'done') next();
      }).catch(() => recover('controller-error')).finally(() => { clearTimeout(timer); });
    };
    this.later(delay, next);
  }

  applyDecision(player, phase, actions) {
    const allowed = phase === PHASE.PREP ? PREP_ACTIONS : phase === PHASE.BAND_DRAFT ? ['g.band', 'g.bandSkip'] : ['g.choice'];
    const refresh = ['g.buy', 'g.reward', 'g.refresh', 'g.levelUp', 'g.choice', 'g.art', 'g.recruitOpen', 'g.recruitCancel', 'g.recruitPick'];
    let applied = 0;
    for (const action of actions) {
      if (phase !== this.phase || (this.deadline && this.sched.now() >= this.deadline)) return { applied, status: 'expired' };
      if (validateC2S(action) || !allowed.includes(action.t) || (action.t === 'g.ready' && (!action.ready || applied !== actions.length - 1))
        || (action.t === 'g.choice' && (phase === PHASE.PREP ? !action.choiceId || action.choiceId !== player.personalChoice?.id : action.choiceId !== undefined))) {
        return { applied, status: 'invalid-action' };
      }
      const result = this._handle(player, action);
      if (!result?.ok) return { applied, status: 'refused', error: result?.error };
      applied++;
      if (phase !== PHASE.PREP || action.t === 'g.ready') return { applied, status: 'done' };
      if (refresh.includes(action.t)) return { applied, status: 'observe-new-state' };
    }
    return { applied, status: 'observe-new-state' };
  }

  settle(plan, unite) {
    const player = this.order.find(p => this.controls(p));
    const { lpLost, leaks } = player.stats;
    super.settle(plan, unite);
    this.decisionSettlements = [...this.decisionSettlements.slice(-2), { round: this.round, lp: player.lp,
      lost: player.stats.lpLost - lpLost, leaks: player.stats.leaks - leaks }];
  }

  _finishFinal(hidden, resultOf) {
    const active = this.phase === (hidden ? PHASE.HIDDEN_CORE : PHASE.FINAL_ASSAULT);
    super._finishFinal(hidden, resultOf);
    if (!active || !this.bossPool) return;
    const player = this.order.find(p => this.controls(p));
    this.decisionSettlements = [...this.decisionSettlements.slice(-2), { round: this.round, kind: hidden ? 'hidden' : 'boss',
      teamLp: Math.max(0, this.teamLp), bossHp: Math.max(0, this.bossPool.hp),
      bossDamage: this.bossPool.byPlayer.get(player.playerId) || 0 }];
  }

  dispose() { this.decisionTurn?.stop?.(); super.dispose(); }
}
