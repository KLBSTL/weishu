// Isolated PREP transactions for planning and offline experiments. This is not a whole-match checkpoint.
import { PHASE } from '../../shared/constants.js';
import { createRng, deriveSeed } from '../sim/rng.js';
import { VirtualScheduler } from './scheduler.js';
import { EffectDispatcher } from './effectsMeta.js';
import {CONTEXT_TEAM_KIND,contextPublicTeammates} from './botTeamContextModel.js';

export const PREP_OBSERVATION_VERSION = 1;
const noop = () => {};
const ignoredMatch = new Set(['opts','sched','dispatcher','log','sendFn','broadcastFn','onEndFn','fields','runner','pacer',
  'bossPool','lastResults','_timers','_phaseTimer','_turnTimer','_pubTimer','_bossPubTimer','_progressTimer','_poolTimer',
  '_botPath','_botTraits','_privDirty','_botPlannerTrace']);

function detached(value, seen) {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value);
  const copy = value instanceof Map ? new Map() : value instanceof Set ? new Set() : Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);
  if (value instanceof Map) for (const [key, v] of value) copy.set(detached(key, seen), detached(v, seen));
  else if (value instanceof Set) for (const v of value) copy.add(detached(v, seen));
  else for (const [key, v] of Object.entries(value)) {
    // Observers and injected instance methods must not be carried into a branch; class methods stay on its prototype.
    if (typeof v !== 'function' && !key.startsWith('_botPlanner')) copy[key] = detached(v, seen);
  }
  return copy;
}

/** Fresh transactions, effect counters, scheduler and RNG; only immutable data/registries are shared. */
export function forkPrep(m, player, { seed = deriveSeed(m.seed, `prep-planner:${m.round}:${player.seat}`), continuation = false } = {}) {
  if (m.phase !== PHASE.PREP || !player.alive || player.ready) throw new Error('planner requires an active unready PREP seat');
  if (continuation && !m._botPlanningBranch) throw new Error('official future RNG cannot be copied');
  const branch = Object.create(Object.getPrototypeOf(m)), seen = new Map([[m, branch]]);
  for (const readonly of [m.data, m.gd, m.ds, m.registry, m.stage, m.wave, ...m.order.map(p => p.gd)]) if (readonly) seen.set(readonly, readonly);
  // Bind the player copies before copying any Match containers that refer to them.
  for (const p of m.order) seen.set(p, Object.create(Object.getPrototypeOf(p)));
  for (const p of m.order) for (const [key, v] of Object.entries(p)) {
    if (typeof v !== 'function' && !key.startsWith('_botPlanner')) seen.get(p)[key] = detached(v, seen);
  }
  for (const [key, v] of Object.entries(m)) if (!ignoredMatch.has(key) && typeof v !== 'function' && !key.startsWith('rng') && !key.startsWith('_botPlanner')) branch[key] = detached(v, seen);
  branch.opts = { mode: m.mode, difficulty: m.difficulty, data: m.data, seed, seats: [], send: noop, broadcast: noop, onEnd: noop };
  branch.log = { info: noop, warn: noop, error: noop, debug: noop };
  branch.BattleClass = m.BattleClass;
  branch.sendFn = () => true; branch.broadcastFn = noop; branch.onEndFn = noop;
  branch.sched = new VirtualScheduler({ start: m.sched.now(), instantCombat: true }); branch.ownsScheduler = true;
  branch.dispatcher = new EffectDispatcher(branch, m.registry);
  branch.fields = []; branch.runner = null; branch.pacer = null; branch.bossPool = null; branch.lastResults = new Map();
  branch._timers = new Set(); branch._privDirty = new Set();
  for (const key of ['_phaseTimer','_turnTimer','_pubTimer','_bossPubTimer','_progressTimer','_poolTimer']) branch[key] = null;
  branch._botPath = null; branch._botTraits = new Map(); branch._botPlanningBranch = true;
  branch.errors = []; branch.errorCount = 0; branch.simErrors = 0; branch.simErrorLog = new Map();
  for (const key of ['rngSetup','rngShop','rngWaves','rngDraft','rngBots','rngMeta']) {
    const state = continuation ? m[key].state() : deriveSeed(seed, key);
    branch[key] = createRng(state || ((-0x6d2b79f5) >>> 0));
    if (!state) branch[key](); // createRng(0) has a nonzero default; restore a sampled Mulberry32 zero state exactly.
  }
  const ps = branch.players.get(player.playerId);
  return { m: branch, ps, seed, dispose: () => branch.sched.dispose() };
}

/** Own-seat information plus public teammate status; never exports official future RNG or private teammate hands. */
export function prepObservation(m, ps) {
  const chess = p => p ? { uid: p.uid, id: p.id, kind: p.kind, dir: p.dir ?? null, poolCopies: p.poolCopies ?? 0,
    items: (p.items || []).map(i => ({ uid: i.uid, id: i.id })) } : null;
  return { version: PREP_OBSERVATION_VERSION, mode: m.mode, difficulty: m.difficulty, round: m.round, stageId: m.stageId,
    playerId: ps.playerId, bandId: ps.bandId, lp: ps.lp, funds: ps.funds, pendingFunds: ps.pendingFunds,
    level: ps.shop.level, upgradePrice: ps.shop.upgradePrice, freeRefreshes: ps.shop.freeRefreshes,
    shop: ps.shop.slots.map(s => s ? { ...s } : null), offers: structuredClone(ps.offers),
    board: [...ps.board].map(([at, p]) => ({ at, ...chess(p) })), hand: ps.hand.map(chess), temp: ps.temp.map(chess),
    layers: { ...ps.layers }, bonds: structuredClone(ps.bonds), roundStats: { ...ps.round },
    teammates: m.order.filter(p => p.playerId !== ps.playerId).map(p => ({ playerId: p.playerId, alive: p.alive, lp: p.lp, bandId: p.bandId, bonds: structuredClone(p.bonds) })) };
}

export function prepSignature(m, ps) {
  return JSON.stringify([prepObservation(m, ps), ps.counters, ps.bondCountBonus, m.uidSeq, [...m.pool.entries],
    ps.diyStock?.entries ? [...ps.diyStock.entries] : [],...(m.botTeamModel?.kind===CONTEXT_TEAM_KIND?[contextPublicTeammates(m,ps)]:[])]);
}

/** The supported action subset is explicit. Production methods remain the final legality authority. */
export function legalPrepActions(m, ps, { includeSell = true, includeRefresh = true } = {}) {
  if (m.phase !== PHASE.PREP || !ps.alive || ps.ready) return [];
  const out = [{ type: 'stop' }], room = ps.hand.some(p => !p);
  if (ps.offers.length) {
    if (room) for (const [slot, s] of ps.offers[0].slots.entries()) if (s && !s.sold && (s.price || 0) <= ps.funds) {
      const pool = ps.poolOf(ps.gd.baseIdOf(s.id)), need = ps.gd.isGolden(s.id) ? ps.gd.goldenCopies : 1;
      if (s.kind === 'item' || !pool.has(ps.gd.baseIdOf(s.id)) || pool.left(ps.gd.baseIdOf(s.id)) >= need) out.push({ type: 'reward', slot, id: s.id });
    }
    return out; // resolve the queued choice before creating additional obligations
  }
  if (room) for (const [slot, s] of ps.shop.slots.entries()) if (s && !s.sold && ps.priceOf(s) <= ps.funds) {
    const base = ps.gd.baseIdOf(s.id), pool = ps.poolOf(base), need = ps.gd.isGolden(s.id) ? ps.gd.goldenCopies : 1;
    if (s.kind === 'item' || !pool.has(base) || pool.left(base) >= need) out.push({ type: 'buy', slot, id: s.id });
  }
  if (ps.shop.level < ps.gd.maxShopLevel && ps.shop.upgradePrice <= ps.funds) out.push({ type: 'level' });
  if (includeRefresh && (ps.shop.freeRefreshes > 0 || ps.funds >= ps.gd.refreshPrice)) out.push({ type: 'refresh' });
  if (includeSell) for (const p of ps.allChess()) {
    const loc = ps.find(p.uid), freed = x => !x || (x.kind === 'token' && x.ownerUid === p.uid);
    const slots = ps.hand.filter(freed).length + ps.temp.filter(freed).length + (loc?.area === 'hand' || loc?.area === 'temp' ? 1 : 0);
    if ((p.items || []).length <= slots) out.push({ type: 'sell', uid: p.uid, id: p.id });
  }
  return out;
}

export function applyPrepAction(m, ps, action) {
  if (m.phase !== PHASE.PREP || !ps.alive || ps.ready) return { error: 'STALE_PREP' };
  if (!action || typeof action.type !== 'string') return { error: 'BAD_ACTION' };
  if (action.type === 'stop') return { ok: true };
  if (action.type === 'buy' || action.type === 'reward') {
    const slot = action.type === 'buy' ? ps.shop.slots[action.slot] : ps.offers[0]?.slots[action.slot];
    if (!slot || slot.id !== action.id || slot.sold) return { error: 'STALE_SLOT' };
    return action.type === 'buy' ? ps.buy(action.slot) : ps.pickReward(action.slot);
  }
  if (action.type === 'sell') {
    if (ps.find(action.uid)?.piece?.id !== action.id) return { error: 'STALE_UID' };
    return ps.sell(action.uid);
  }
  if (action.type === 'refresh') return ps.refresh();
  if (action.type === 'level') return ps.levelUp();
  return { error: 'BAD_ACTION' };
}
