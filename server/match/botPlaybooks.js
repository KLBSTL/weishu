// Macro recipes, opt-in independently of the tactical / learned planners. All transactions remain PlayerState intents.
// [ASSUMED] First-pass timing/retention limits; see docs/ai-playbook-implementation-draft-20261022.md.
import { pieceBonds } from './bondsMeta.js';
import { previewPrep } from './botGrowth.js';
import { forkPrep } from './botEnvironment.js';

export const PLAYBOOKS = Object.freeze({
  siracusa: { core: 'siracusaShip', bands: ['band_chiave'], subs: ['swiftShip'],
    keys: ['chess_char_1_07_a', 'chess_char_1_08_a', 'chess_char_2_16_a'] },
  yan: { core: 'yanShip', bands: ['band_duyaoy', 'band_dusk'], subs: ['investShip', 'arcaneShip'],
    keys: ['chess_char_1_03_a', 'chess_char_2_04_a', 'chess_char_3_04_a', 'chess_char_5_12_a'] },
  kjerag: { core: 'kjeragShip', bands: ['band_jesica'], subs: ['skillfulShip'],
    keys: ['chess_char_4_13_a', 'chess_char_4_22_a'] },
});
const option = m => m.botPlaybook || 'off';
const members = (m, ps) => ps?.allChess?.() || [];
const baseOf = (m, p) => m.gd.baseIdOf(p.id);
const idForBand = band => Object.keys(PLAYBOOKS).find(id => PLAYBOOKS[id].bands.includes(band));

function available(m, ps) {
  const out = new Set(members(m, ps).map(p => baseOf(m, p)));
  // Shops / ordinary reward offers do not reserve copies. Only dedicated recruitment actually takes them upfront.
  for (const id of ps?.recruitment?.pending?.ids || []) out.add(m.gd.baseIdOf(id));
  for (const [id, e] of m.pool.entries) if (e.left > 0) out.add(m.gd.baseIdOf(id));
  return out;
}

/** Random pool labels are not activation bans. Check surviving identities, including this player's held copies. */
export function playbookFeasible(m, ps, id) {
  const book = PLAYBOOKS[id];
  if (!book || m.gd.modeInactiveBonds.has(book.core)) return false;
  const stock = available(m, ps), count = bond => [...stock].filter(x => m.gd.chess(x)?.bonds?.includes(bond)).length;
  if (count(book.core) < (m.gd.bond(book.core)?.thresholds?.[0] || 3)) return false;
  if (id === 'siracusa') return book.keys.every(x => stock.has(x));
  // Partial engines do not require Investor: Xiaoman, Dusk and gain traits have separate conditions.
  if (id === 'yan') return stock.has('chess_char_2_04_a') || stock.has('chess_char_5_12_a');
  return true;
}

/** Restrict only when a legal recipe squad exists. The caller still checks taken / disabled recruitment squads. */
export function playbookBands(m, ps, ids) {
  if (option(m) === 'off') return [];
  const used = new Set(m.alivePlayers().filter(p => p !== ps).map(p => idForBand(p.bandId)).filter(Boolean));
  const choices = ids.filter(band => {
    const id = idForBand(band);
    return id && (option(m) === 'auto' || option(m) === id) && playbookFeasible(m, ps, id);
  });
  const separate = choices.filter(band => !used.has(idForBand(band)));
  return separate.length ? separate : choices;
}

/** One uniform draw selects a feasible recipe, then its fractional remainder selects a squad within that recipe. */
export function pickPlaybookBand(m, bands, draw) {
  const groups = Object.keys(PLAYBOOKS).map(id => bands.filter(b => idForBand(b) === id)).filter(a => a.length);
  if (!groups.length) return null;
  const position = Math.min(1 - Number.EPSILON, Math.max(0, draw)) * groups.length;
  const group = groups[Math.floor(position)], weights = group.map(id => Math.max(1, (m.gd.startLp(id) - 18) ** 2));
  let rest = (position - Math.floor(position)) * weights.reduce((a,b) => a+b,0);
  for (let i = 0; i < group.length; i++) { rest -= weights[i]; if (rest < 0) return group[i]; }
  return group.at(-1);
}

/** Current onPrepEnd handlers, one extra acquisition; never predicts future shops or assumes Investor amplifies Dusk. */
export function playbookPurchaseGrowth(m, ps) {
  const key = JSON.stringify([m.round, ps.funds, ps.round, ps.layers, ps.counters, ps.bonds,
    [...ps.board], ps.hand, ps.temp]);
  if (ps._botPlaybookForecast?.key === key) return ps._botPlaybookForecast;
  const gd = ps.gd || m.gd, before = previewPrep(gd, ps, { round: m.round });
  const after = previewPrep(gd, Object.assign(Object.create(ps), { round: {...ps.round,
    gainedChess: (ps.round.gainedChess || 0) + 1} }), { round: m.round });
  const gains = {};
  for (const id of ['yanShip', 'arcaneShip']) {
    const n = (after.layers[id] || 0) - (before.layers[id] || 0);
    if (n > 0 && ps.bonds[id]?.active) gains[id] = n;
  }
  return ps._botPlaybookForecast = { key, gains, total: Object.values(gains).reduce((a,b) => a+b,0) };
}

/** One commitment per match; a depleted engine abandons once, without repeated refresh-by-refresh switching. */
export function playbookPlan(m, ps) {
  if (option(m) === 'off') return null;
  let state = ps._botPlaybook;
  if (!state) {
    const id = option(m) === 'auto' ? idForBand(ps.bandId) : option(m);
    if (!id || !PLAYBOOKS[id]) return null;
    state = ps._botPlaybook = { id, abandoned: false, reason: 'committed' };
  }
  if (state.abandoned) return null;
  if (!playbookFeasible(m, ps, state.id)) {
    state.abandoned = true; state.reason = 'engine-stock-unreachable';
    return null;
  }
  const book = PLAYBOOKS[state.id], own = members(m, ps), r = m.round;
  const elites = own.filter(p => m.gd.isGolden(p.id));
  const has = id => own.some(p => baseOf(m, p) === id);
  const active = id => !!ps.bonds[id]?.active;
  const investors = new Set(own.filter(p => m.gd.chess(p.id)?.bonds?.includes('investShip')).map(p => baseOf(m, p))).size;
  const low = (m.teamLp ?? ps.lp) <= 8;
  if (state.anchorRound !== r) { state.anchorRound = r; state.anchorLevel = ps.shop.level; }
  let phase = 'assemble', target = [1, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6][Math.min(r, 15)];
  if (state.id === 'siracusa') {
    const lapElite = elites.some(p => baseOf(m, p) === book.keys[2]);
    if (lapElite && active(book.core) && state.readyRound == null) state.readyRound = r;
    // [ASSUMED] An elite starts the engine. Operate for two formal rounds, with R9 / low-LP stop-loss limits.
    if (!state.transition && (r >= 9 || low || (state.readyRound != null && r >= state.readyRound + 2))) {
      state.transition = true;
      state.transitionRound = r;
      state.reason = low ? 'low-lp-transition' : r >= 9 ? 'round-nine-transition' : 'engine-operated-transition';
    }
    phase = state.transition ? (r >= m.gd.bossRound ? 'finish' : 'transition') : active(book.core) ? 'reroll' : 'assemble';
    target = state.transition ? Math.min(6, 3 + Math.max(0, r - state.transitionRound)) : r >= 2 ? 2 : 1;
    target = Math.min(target, state.anchorLevel + 1);
  } else if (state.id === 'yan') {
    target = [1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6][Math.min(r, 15)];
    phase = playbookPurchaseGrowth(m, ps).total > 0 ? 'growth' : 'assemble';
    if (!has('chess_char_5_12_a') && r < 11) target = Math.min(5, target);
  } else phase = r >= 12 ? 'finish' : active(book.core) ? 'growth' : 'assemble';
  state.phase = phase;
  const transitionKeys = state.id === 'siracusa' && state.transition
    ? ['chess_char_4_14_a', 'chess_char_4_16_a', 'chess_char_6_18_a'] : [];
  return { ...book, id: state.id, phase, target, investors, transitionKeys, missing: book.keys.filter(id => !has(id)) };
}

function extraLap(m, ps, p, plan) {
  if (plan?.id !== 'siracusa' || m.round > m.gd.bossRound || !ps.bonds.siracusaShip?.active
      || (ps.layers.siracusaShip || 0) >= 999 || baseOf(m,p) !== 'chess_char_2_16_a' || m.gd.isGolden(p.id)) return false;
  const own = members(m,ps);
  return own.some(q => baseOf(m,q) === 'chess_char_2_16_a' && m.gd.isGolden(q.id))
    && !own.some(q => q.uid < p.uid && baseOf(m,q) === 'chess_char_2_16_a' && !m.gd.isGolden(q.id));
}

/** Retention is separate from deployment power: e.g. the third investor may stay on the bench. */
export function playbookRetention(m, ps, p, plan = playbookPlan(m, ps)) {
  if (!plan) return 0;
  if (extraLap(m, ps, p, plan)) return 50;
  if (plan.phase === 'finish') return 0;
  const gd = ps.gd || m.gd, base = gd.baseIdOf(p.id), own = members(m, ps), c = gd.chess(p.id);
  const golden = own.some(q => gd.isGolden(q.id) && gd.baseIdOf(q.id) === base);
  if (plan.id === 'yan' && c?.bonds?.includes('investShip')) {
    // Keep identities until three are held; never retain an unlimited pile of extra copies after an elite exists.
    if (!gd.isGolden(p.id) && golden) return 0;
    return plan.investors <= 3 || plan.keys.includes(base) ? 50 : 0;
  }
  if (!plan.keys.includes(base)) return 0;
  if (!gd.isGolden(p.id) && golden) return 0;
  return 50;
}

/** Positive here means a real acquisition goal, including off-board engines; it may bypass the lineup-only buy gate. */
export function playbookAcquisition(m, ps, chessId, plan = playbookPlan(m, ps)) {
  if (!plan) return 0;
  const gd = ps.gd || m.gd, base = gd.baseIdOf(chessId), c = gd.chess(chessId), own = members(m, ps);
  if (extraLap(m, ps, { id:chessId, uid:Infinity }, plan) && ps.hand.filter(p => !p).length >= 2) return 18;
  if (plan.phase === 'finish') return 0;
  if (plan.transitionKeys?.includes(base) && !own.some(p => gd.baseIdOf(p.id) === base)) return 24;
  if (own.some(p => gd.baseIdOf(p.id) === base && gd.isGolden(p.id))) return 0;
  if (plan.keys.includes(base)) return plan.missing.includes(base) ? 26 : 16;
  if (plan.id === 'yan' && c?.bonds?.includes('investShip') && plan.investors < 3) {
    return own.some(p => gd.baseIdOf(p.id) === base) ? 6 : 24;
  }
  return 0;
}

export function playbookLevel(m, ps) {
  const plan = playbookPlan(m, ps);
  if (!plan) return null;
  return { target: plan.target, ceiling: plan.target };
}

/** Require an achievable first core threshold, with room left for frontline/healing; no hardcoded eight-piece team. */
export function playbookLineupValue(m, ps, set, bonds, plan = playbookPlan(m, ps)) {
  if (!plan) return 0;
  const gd = ps.gd || m.gd, threshold = gd.bond(plan.core)?.thresholds?.[0] || 3;
  const own = members(m, ps), core = own.filter(p => pieceBonds(gd, p).includes(plan.core));
  const distinct = new Set(core.map(p => gd.baseIdOf(p.id))).size;
  if (distinct < threshold || set.length < threshold + 2) return 0;
  const gap = Math.max(0, threshold - (bonds[plan.core]?.count || 0));
  let value = -120 * gap;
  if (plan.id === 'yan' && own.some(p => gd.baseIdOf(p.id) === 'chess_char_5_12_a')
      && !set.some(p => gd.baseIdOf(p.id) === 'chess_char_5_12_a')) value -= 120;
  return value;
}

/** Reserve searches for the missing engine instead of filling the bench with unrelated speculative pairs. */
export function playbookAllowsBench(m, ps, chessId, gain, goal, plan = playbookPlan(m, ps), functionalNeed = false) {
  if (!plan || plan.phase === 'finish' || goal || functionalNeed || gain > 10) return true;
  const c = m.gd.chess(chessId);
  if (c?.bonds?.includes(plan.core)) return true;
  const coreActive = ps.bonds[plan.core]?.active;
  return coreActive && !(plan.id === 'yan' && plan.phase === 'assemble');
}

/** A bounded cycle whenever a currently fielded partial engine really benefits, including final prep. */
export function playbookTrade(m, ps, chessId, price, plan = playbookPlan(m, ps)) {
  if (!plan || plan.id !== 'yan' || plan.phase !== 'growth' || price > 2 || m.gd.isGolden(chessId)) return false;
  const n = ps._botPlaybookTrades;
  if (members(m, ps).some(p => baseOf(m, p) === m.gd.baseIdOf(chessId) && !m.gd.isGolden(p.id))) return false;
  return !n || n.round !== m.round || n.count < 6;
}

/** Validate a proposed cycle with real transactions on a sampled, isolated PREP branch; no combat rehearsal added. */
export function playbookCycleQuote(m, ps, index, plan = playbookPlan(m, ps)) {
  const slot = ps.shop.slots[index];
  if (!slot || !playbookTrade(m, ps, slot.id, ps.priceOf(slot), plan)) return null;
  const branch = forkPrep(m, ps);
  try {
    const q = branch.ps, gd = q.gd || branch.m.gd, before = previewPrep(gd,q,{round:m.round});
    const owned = new Set(q.allChess().map(p=>p.uid));
    if (!q.buy(index).ok) return null;
    const fresh = q.allChess().find(p=>p.id===slot.id&&!owned.has(p.uid));
    if (!fresh || gd.isGolden(fresh.id) || !q.sell(fresh.uid).ok) return null;
    const after = previewPrep(gd,q,{round:m.round}), gains = {};
    for (const id of ['yanShip','arcaneShip']) {
      const n=(after.layers[id]||0)-(before.layers[id]||0);
      if(n>0 && q.bonds[id]?.active) gains[id]=n;
    }
    const netCost=ps.funds-q.funds;
    return Object.keys(gains).length && netCost<=1 ? {gains,netCost,freeRefreshes:q.shop.freeRefreshes-ps.shop.freeRefreshes} : null;
  } finally { branch.dispose(); }
}

export function recordPlaybookTrade(m, ps) {
  if (ps._botPlaybookTrades?.round !== m.round) ps._botPlaybookTrades = { round: m.round, count: 0 };
  ps._botPlaybookTrades.count++;
}

/** Only sell a spare ordinary Texas after its elite exists; never consume the three-identity activation or a pair. */
export function playbookMerchant(m, ps) {
  const plan = playbookPlan(m, ps);
  if (plan?.id !== 'siracusa' || !['reroll','transition'].includes(plan.phase)) return null;
  const own = members(m, ps), base = 'chess_char_1_08_a';
  const normal = own.filter(p => baseOf(m, p) === base && !m.gd.isGolden(p.id));
  return normal.length === 1 && own.some(p => baseOf(m, p) === base && m.gd.isGolden(p.id))
    ? normal.find(p => ps.find(p.uid)?.area !== 'board' && !(p.items || []).length) || null : null;
}

/** Jessica's module samples the UNION of a carrier's bonds: score the actual remaining weighted stock. */
export function playbookModuleTarget(m, ps, plan = playbookPlan(m, ps)) {
  if (plan?.id !== 'kjerag') return undefined; // undefined = use legacy target logic; null = deliberately hold
  const gd = ps.gd || m.gd, own = members(m, ps), free = ps.hand.filter(p => !p).length;
  if (ps.shop.level < 4 && m.round < 7 && free >= 2) return null;
  const held = new Set(own.map(p => gd.baseIdOf(p.id)));
  let best = null, bestScore = -1;
  for (const p of own) {
    if ((p.items || []).length >= gd.equipPerChess) continue;
    const bonds = new Set(pieceBonds(gd, p));
    if (!bonds.has(plan.core)) continue;
    let total = 0, useful = 0;
    for (const [id, e] of m.pool.entries) {
      const c = gd.chess(id);
      if (!(e.left > 0) || e.tier > ps.shop.level || !c?.bonds?.some(b => bonds.has(b))) continue;
      total += e.left;
      if (c.bonds.includes(plan.core)) useful += e.left * (held.has(gd.baseIdOf(id)) ? 1 : 2);
    }
    const score = total ? useful / total : -1;
    if (score > bestScore || (score === bestScore && p.uid < best?.uid)) { best = p; bestScore = score; }
  }
  return best || (m.round >= 7 || free < 2 ? undefined : null);
}

export function playbookDiagnostic(m, ps) {
  const plan = playbookPlan(m, ps);
  if (!ps._botPlaybook) return null;
  const own = members(m, ps);
  return { ...ps._botPlaybook, target: plan?.target ?? null, missing: plan?.missing || [], investors: plan?.investors ?? 0,
    ...(plan?.id === 'yan' ? { acquisitionMarginal:playbookPurchaseGrowth(m,ps).gains } : {}),
    modulesHeld: [...ps.hand, ...ps.temp].filter(p => p?.kind === 'item'
      && m.gd.item(p.id)?.buffs?.some(b => b.key === 'use_equip_reward_special_goods_char_chess')).length,
    keys: plan?.keys.map(id => ({ id, normal: own.filter(p => baseOf(m, p) === id && !m.gd.isGolden(p.id)).length,
      elite: own.filter(p => baseOf(m, p) === id && m.gd.isGolden(p.id)).length })) || [],
    trades: ps._botPlaybookTrades?.round === m.round ? ps._botPlaybookTrades.count : 0 };
}
