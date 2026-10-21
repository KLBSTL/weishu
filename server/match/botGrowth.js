// Read-only growth forecasts. Prep effects reuse their production handlers on an isolated, bounded context.
// Future shopping and combat triggers are estimates, never future RNG draws. See docs/ai-bond-synergy-stacking-draft-20261020.md.
import { pieceBonds } from './bondsMeta.js';
import { boardOrder } from './board.js';
import { frontOf, rotateOffset } from '../sim/dir.js';
import { HANDLERS } from '../sim/content/garrisons/meta.js';
import { registerMeta as columbiaMeta } from '../sim/content/bonds/columbia.js';
import { registerMeta as sarkazMeta } from '../sim/content/bonds/sarkaz.js';

const num = (v, d = 0) => Number.isFinite(v) ? v : d;
const split = s => String(s || '').split(',').filter(Boolean);
const bbOf = r => Object.assign({}, ...(r?.buffs || []).map(x => x.bb || {}), r?.bb || {});
const active = (ps, id) => !!ps.bonds?.[id]?.active;
const traits = (gd, rec) => (rec?.garrisonIds || []).map(id => gd.garrison(id)).filter(Boolean);
function pieceTags(gd, ps, piece) {
  const cache = ps._botPieceBonds;
  if (!cache || !piece) return pieceBonds(gd, piece);
  if (!cache.has(piece.uid)) cache.set(piece.uid, pieceBonds(gd, piece));
  return cache.get(piece.uid);
}
const supported = new Set(Object.keys(HANDLERS).filter(k => /^(SERVER_ADD_|SERVER_GAIN_BOND_|SERVER_FRONT_SAME_|SERVER_TRIGGER_|COLUMBIA_DEMKNI)/.test(k)));
const handlers = new Map(Object.entries(HANDLERS));
const registry = { garrison(k, h) { handlers.set(k, h); supported.add(k); }, band() {}, global() {} };
columbiaMeta(registry); sarkazMeta(registry);
for (const k of ['SERVER_ONCE_GOLD', 'SERVER_ONCE_GOLD_WITH_BOND_CONDITION', 'SERVER_GAIN_FREE_REFRESH_COUNT']) supported.add(k);

const currencyTraits = new Set(['SERVER_ONCE_GOLD', 'SERVER_ONCE_GOLD_WITH_BOND_CONDITION', 'SERVER_GAIN_FREE_REFRESH_COUNT']);
// Currency still runs in the prep preview; keep its separate recruitment value instead of classifying it as layers.
export const growthTrait = key => (supported.has(key) && !currencyTraits.has(key)) || /gar_event_|^ADD_BOND$|^SARKAZ_(TYPHON|SHINING)$/.test(key || '');

/** Events a formal operator can supply, including the target trait of an ADD_BOND grant. */
export function growthTargets(gd, rec) {
  const out = new Set();
  const custom = { COLUMBIA_ASTESI: ['columbiaShip', 'arcaneShip'], COLUMBIA_SILENT: ['columbiaShip', 'visiShip'],
    COLUMBIA_F12YIN: ['investShip'], COLUMBIA_F12YIN_START: ['columbiaShip'], COLUMBIA_APHRIS: ['columbiaShip', 'preciShip'],
    COLUMBIA_BSTALK: ['columbiaShip'], COLUMBIA_CTRAIL: ['skillfulShip'], SARKAZ_TYPHON: ['sarkazShip'] };
  for (const g of traits(gd, rec)) {
    for (const id of custom[g.effectKey] || []) out.add(id);
    const target = g.effectKey === 'ADD_BOND' ? gd.garrison(g.bbStr?.give_garrison_id) : g;
    if (!target || !growthTrait(target.effectKey)) continue;
    const s = target.bbStr || {};
    for (const id of split(s.bond || s.bond_id)) out.add(id);
    if (s.bond_type === 'bond_self' || /CHESS_ALL|SARKAZ_(METEO|HBISC2)/.test(target.effectKey)) for (const id of rec.bonds || []) out.add(id);
    if (/POSITION|FRONT_SAME/.test(target.effectKey)) for (const id of rec.bonds || []) out.add(id);
  }
  return [...out];
}

export function boardPosition(ps, piece) {
  if (ps._botPositions) return ps._botPositions.get(piece.uid) || null;
  for (const [key, p] of ps.board || []) if (p.uid === piece.uid && /^\d+,\d+$/.test(key)) return key.split(',').map(Number);
  return null;
}

function adjacent(ps, p, behind = false) {
  const at = boardPosition(ps, p); if (!at) return null;
  const [r, c] = frontOf(at[0], at[1], p.dir || 'RIGHT', behind ? -1 : 1);
  const other = ps.board.get(`${r},${c}`); return other?.kind === 'chess' ? other : null;
}

/** Approximate the selected skill's real SP kind, ammo duration, refunds and elite SP cost. */
export function skillCycle(gd, ps, rec, piece, horizon = 40) {
  const skill = rec?.skill || {}, st = rec?.stats || {}, b = skill.bb || {};
  let aspd = num(st.aspd, 100), initial = num(skill.initSp), recovery = num(st.spRecovery, 1);
  for (const it of piece?.items || []) {
    const bb = bbOf(gd.item(it.id));
    aspd += num(bb.attack_speed); recovery += num(bb.sp_recovery_per_sec);
    if (bb.sp_each_person) {
      const own = pieceTags(gd, ps, piece);
      initial += bb.sp_each_person * (1 + [...ps.board.values()].filter(p => p.kind === 'chess' && p.uid !== piece.uid && pieceTags(gd, ps, p).some(id => own.includes(id))).length);
    }
  }
  const own = pieceTags(gd, ps, piece || { id: rec?.chessId });
  const skillful = bbOf(gd.bond('skillfulShip'));
  if (active(ps, 'skillfulShip') && own.includes('skillfulShip')) aspd += num(skillful.base_attack_speed) + num(skillful.attack_speed_per_stack) * num(ps.layers?.skillfulShip);
  const interval = Math.max(1 / 30, (num(st.bat, 1) + num(b.base_attack_time)) * 100 / Math.max(10, Math.min(600, aspd + num(b.attack_speed))));
  const ammo = Math.max(0, num(b['attack@trigger_time'], num(b['attack@times'], num(b.ammo, num(b.ammo_count, num(b.times))))));
  let duration = Math.max(0, num(skill.duration));
  if (skill.durationType === 'AMMO' || ammo > 0) {
    const laterano = bbOf(gd.bond('lateranoShip'));
    const extra = active(ps, 'lateranoShip') && own.includes('lateranoShip') ? num(laterano.base_ammo_percent) + num(laterano.ammo_percent_per_stack) * num(ps.layers?.lateranoShip) : 0;
    duration = Math.floor(Math.max(1, ammo) * (1 + extra)) * interval;
  }
  const cost = Math.floor(num(skill.spCost, Infinity) * (rec?.isGolden && ps.bonds?.suntShip?.tier >= 2 ? num(bbOf(gd.bond('suntShip')).sp_ratio, 1) : 1));
  if (skill.spType === 'INCREASE_WHEN_ATTACK') recovery = 1 / interval;
  if (skill.spType === 'INCREASE_WHEN_TAKEN_DAMAGE') recovery = ps._botGrowthContext?.incomingRate ?? .5;
  recovery = Math.max(.01, recovery);
  let refund = 0;
  if (active(ps, 'swiftShip')) {
    const swift = bbOf(gd.bond('swiftShip')), L = num(ps.layers?.swiftShip), p = Math.min(1, num(swift.base_prob) + num(swift.prob_per_stack) * L);
    refund = p * ((own.includes('swiftShip') ? num(swift.normal_sp) : 0) + (L >= num(swift.power_bond_stack_cnt, Infinity) ? num(swift.power_sp) : 0));
  }
  const first = Math.max(0, cost - initial) / recovery + 3;
  const period = Math.max(3, duration + Math.max(0, cost - refund) / recovery);
  const permanent = skill.duration < 0 || skill.durationType === 'INFINITE';
  const casts = first <= horizon ? permanent ? 1 : 1 + Math.floor((horizon - first) / period) : 0;
  const uptime = permanent ? Math.max(0, horizon - first) : Math.min(Math.max(0, horizon - first), casts * duration);
  return { casts, interval, first, period, duration, uptime, recovery, refund, cost };
}

function prepPieces(gd, ps) {
  const board = [...(ps.board || [])].map(([key, p]) => {
    const coords = /^\d+,\d+$/.test(key) ? key.split(',').map(Number) : [];
    return { ...p, area: 'board', row: coords[0], col: coords[1], tier: gd.tierOf(p.id) };
  });
  const hand = (ps.hand || []).map(p => p ? { ...p, area: 'hand', tier: gd.tierOf(p.id) } : null);
  const all = [...board, ...hand.filter(Boolean)];
  const byUid = new Map(all.map(p => [p.uid, p]));
  const ordered = boardOrder(ps.board || new Map()).map(x => byUid.get(x.piece.uid));
  return { board, hand, byUid, order: [...ordered, ...board.filter(p => !ordered.includes(p)), ...hand.filter(Boolean)] };
}

/** Run only deterministic, understood prep effects; never acquire random chess or touch the actual PlayerState. */
export function previewPrep(gd, ps, { event = 'SERVER_PREP_FIN', round = 1, only = null, record = p => gd.chess(p.id), includeCommon = !only } = {}) {
  const layers = { ...ps.layers }, stats = { ...ps.round }, counters = { ...ps.counters }, gains = {}, trace = [];
  let funds = num(ps.funds), pending = num(ps.pendingFunds), freeRefreshes = num(ps.shop?.freeRefreshes), depth = 0, current = null;
  const { board, hand, byUid, order } = ps._botPrepPieces || prepPieces(gd, ps);
  const locate = uid => byUid.get(uid) || (only?.uid === uid ? only : null);
  const state = { bonds: ps.bonds, layers };
  const milestone = () => {
    for (const [id, key, step, coins] of [['visiShip', 'bondaddon:visi:paid', 10, 2], ['miraShip', 'bondaddon:mira:paid', 100, 20]]) {
      if (!active(state, id)) continue;
      const due = Math.floor(num(layers[id]) / step), owed = Math.max(0, due - num(counters[key]));
      counters[key] = Math.max(due, num(counters[key]));
      if (event === 'SERVER_PREP_FIN') pending += owed * coins; else funds += owed * coins;
    }
  };
  const add = (id, n, opts = {}) => {
    if (!gd.bond(id) || (opts.requireActive && !active(state, id))) return 0;
    const got = Math.max(0, Math.min(999 - num(layers[id]), Math.floor(n)));
    if (!got) return 0;
    layers[id] = num(layers[id]) + got; gains[id] = num(gains[id]) + got;
    trace.push({ uid: current?.piece?.uid ?? null, trait: current?.garrison?.garrisonId ?? null, event, bondId: id, amount: got });
    milestone(); return got;
  };
  const ctx = {
    gd, data: gd.raw, round, get source() { return current; },
    layers: id => num(layers[id]), bondActive: id => active(state, id),
    board: () => board, hand: () => hand, piece: locate,
    pieceAt: (r, c) => board.find(p => p.row === r && p.col === c) || null,
    pieceBonds: uid => pieceTags(gd, ps, locate(uid)), chessRecord: id => gd.chess(id),
    addLayers: add, funds: () => funds, shopLevel: () => num(ps.shop?.level, 1), roundStats: () => stats,
    spendFunds: n => { if (!(n >= 0) || n > funds) return false; funds -= n; stats.spent = num(stats.spent) + n; return true; },
    addFunds: n => { funds += n; }, addPendingFunds: n => { pending += n; },
    grantFreeRefresh: n => { freeRefreshes += n; return freeRefreshes; },
    counter: k => num(counters[k]), setCounter: (k, n) => { counters[k] = n; },
    incCounter: (k, n = 1) => (counters[k] = num(counters[k]) + n),
    incPieceCounter: (uid, k) => {
      const key = `preview:${uid}:${k}`, p = locate(uid);
      if (!(key in counters)) counters[key] = ps.pieceRoundCount?.(p, k) ?? 0;
      return ++counters[key];
    },
    triggerGarrisons: (uid, type, opts = {}) => run(locate(uid), type, opts.asUid != null ? locate(opts.asUid) : null),
  };
  function run(p, type, as = null) {
    if (!p || depth >= 6) return 0;
    depth++;
    const previous = current, self = as || p;
    let count = 0;
    for (const g of traits(gd, record(p))) {
      if (g.eventType !== type || !supported.has(g.effectKey)) continue;
      if (g.bbStr?.conditionkey === 'character_target_inboard' && self.area !== 'board') continue;
      const h = handlers.get(g.effectKey), fn = h?.run || h?.[type === 'SERVER_GAIN' ? 'onGain' : type === 'SERVER_REFRESH_SHOP' ? 'onRefresh' : 'run'];
      if (!fn) continue;
      current = { piece: self, garrison: g, garrisonId: g.garrisonId, bb: g.bb || {}, bbStr: g.bbStr || {}, where: self.area };
      const repeat = type === 'SERVER_GAIN' && active(state, 'investShip') ? num(layers.investShip) >= 100 ? 3 : 2 : 1;
      for (let n = 0; n < repeat; n++) fn(ctx, { trigger: depth > 1 });
      count++;
    }
    current = previous; depth--; return count;
  }
  milestone();
  if (includeCommon && event === 'SERVER_PREP_START') {
    if (ps.bandId === 'band_recruit_columbia' && funds >= 10 && hand.some(p => !p)) {
      const pool = ps.m?.pool?.entries;
      if (pool && [...pool].some(([id, e]) => e.left > 0 && e.tier <= ps.shop.level && gd.chess(id)?.bonds.includes('columbiaShip'))) funds--;
    }
    if (ps.bandId === 'band_lisa') {
      const p = board.filter(p => traits(gd, record(p)).some(g => g.eventType === 'SERVER_GAIN')).sort((a, b) => b.col - a.col || a.row - b.row)[0];
      run(p, 'SERVER_GAIN');
    }
    if (ps.bandId === 'band_yu' && round === 8) {
      const ids = gd.bondIds.filter(id => active(state, id) && !gd.bond(id).noStack);
      for (const id of ids) add(id, ids.length === 1 ? 36 : 12);
    }
  }
  if (includeCommon && event === 'SERVER_PREP_FIN' && active(state, 'deputShip')) {
    const bb = bbOf(gd.bond('deputShip')), n = ps.bonds.deputShip.tier >= 2 ? bb.more_layer : bb.layer;
    for (const id of gd.bondIds) if (active(state, id)) add(id, n);
  }
  // Synthetic lineup tiles have no board coordinates yet; position-dependent handlers correctly yield nothing.
  for (const p of only ? [locate(only.uid) || only] : order) run(p, event);
  return { gains, layers, funds, pendingFunds: pending, stats, counters, trace, freeRefreshes, prepPayment: Math.max(0, num(ps.funds) - funds) };
}

function inRange(gd, ps, source, target, rec) {
  const at = boardPosition(ps, source), to = boardPosition(ps, target);
  if (!at || !to) return false;
  return (rec.rangeGrid || []).some(([r, c]) => { const [dr, dc] = rotateOffset(r, c, source.dir || 'RIGHT'); return at[0] + dr === to[0] && at[1] + dc === to[1]; });
}

/** Expected battle triggers. Caps/activation are exact; kills, status entries and redeploys are bounded estimates. */
export function previewBattleGrowth(gd, ps, round, record = p => gd.chess(p.id), onlyUid = null) {
  const gains = {}, trace = [];
  if (round >= gd.bossRound || ps._botGrowthContext?.layerGainsEnabled === false) return { gains, trace };
  const units = [...ps.board.values()].filter(p => p.kind === 'chess');
  const sources = onlyUid == null ? units : units.filter(p => p.uid === onlyUid);
  if (!sources.some(p => traits(gd, record(p)).some(g => g.eventType === 'IN_BATTLE' && growthTrait(g.effectKey)))) return { gains, trace };
  const positions = new Map();
  for (const [key, p] of ps.board) if (/^\d+,\d+$/.test(key)) positions.set(p.uid, key.split(',').map(Number));
  ps = Object.assign(Object.create(ps), { _botPositions: positions });
  const horizon = Math.min(60, Math.max(15, ps._botGrowthContext?.duration ?? 40));
  const enemies = Math.max(0, ps._botGrowthContext?.enemies ?? 8);
  if (!enemies) return { gains, trace };
  const cycles = new Map();
  const cycleOf = p => { if (!cycles.has(p.uid)) cycles.set(p.uid, skillCycle(gd, ps, record(p), p, horizon)); return cycles.get(p.uid); };
  const top = () => gd.bondIds.filter(id => active(ps, id)).sort((a, b) => num(ps.layers?.[b]) - num(ps.layers?.[a]))[0];
  const list = [];
  const addTrait = (piece, g, owner = piece) => { if (g && !list.some(x => x.piece.uid === piece.uid && x.g.garrisonId === g.garrisonId)) list.push({ piece, g, owner }); };
  for (const p of units) for (const g of traits(gd, record(p)).filter(g => g.eventType === 'IN_BATTLE')) {
    if (g.effectKey !== 'ADD_BOND') { addTrait(p, g); continue; }
    const desc = g.desc || '', bond = g.bbStr?.check_bond_id;
    let targets;
    if (/所有/.test(desc)) targets = units.filter(q => !bond || pieceTags(gd, ps, q).includes(bond));
    else if (/同一行最右边/.test(desc)) {
      const at = boardPosition(ps, p);
      targets = at ? units.filter(q => boardPosition(ps, q)?.[0] === at[0]).sort((a, b) => boardPosition(ps, b)[1] - boardPosition(ps, a)[1]).slice(0, 1) : [];
    } else {
      const front = adjacent(ps, p);
      targets = [...(/自身/.test(desc) ? [p] : []), ...(front && (!bond || pieceTags(gd, ps, front).includes(bond)) ? [front] : [])];
    }
    for (const q of targets) addTrait(q, gd.garrison(g.bbStr?.give_garrison_id), p);
  }
  for (const { piece, g, owner } of list) {
    if (onlyUid != null && owner.uid !== onlyUid) continue;
    const bb = g.bb || {}, s = g.bbStr || {}, rec = record(piece), key = g.effectKey;
    if (!growthTrait(key)) continue;
    const cycle = cycleOf(piece);
    const own = pieceTags(gd, ps, piece), at = boardPosition(ps, piece);
    const row = at ? units.filter(q => boardPosition(ps, q)?.[0] === at[0]).length : 1;
    if (s.conditionkey === 'character_same_row' && row < num(bb.check_count)) continue;
    if (s.conditionkey === 'character_same_col' && (!at || units.filter(q => boardPosition(ps, q)?.[1] === at[1]).length < num(bb.check_count))) continue;
    let times = 0, amount = num(bb.bond_add_count), cap = num(bb.max_add_count_per_battle, Infinity);
    let ids = s.bond_type === 'bond_self' ? own : s.bond_type === 'bond_actived_maxstack' ? [top()] : split(s.bond_id);
    if (key === 'act1autochess_gar_event_useskill') times = cycle.casts;
    if (key === 'act1autochess_gar_event_selfkillenemy') times = Math.floor(enemies / Math.max(1, units.filter(q => !['none', 'heal'].includes(record(q)?.attackKind)).length) / Math.max(1, num(bb.check_cnt, 1)));
    if (key === 'act2autochess_gar_event_onstart') times = 1 + (active(ps, 'raidShip') && own.includes('raidShip') ? 2 : active(ps, 'indomShip') && rec?.position === 'MELEE' ? 1 : 0);
    if (key === 'act1autochess_gar_event_selfdead') times = active(ps, 'indomShip') && rec?.position === 'MELEE' ? 2 : .5;
    if (key === 'act1autochess_gar_event_consume_ammo') {
      const shooters = s.range_id === 'x-5' ? units.filter(q => q.uid === piece.uid || (at && boardPosition(ps, q) && Math.abs(boardPosition(ps, q)[0] - at[0]) + Math.abs(boardPosition(ps, q)[1] - at[1]) === 1)) : s.range_id === '1-1' ? [adjacent(ps, piece)].filter(Boolean) : [piece];
      times = Math.floor(shooters.reduce((n, p) => n + ((record(p)?.skill?.durationType === 'AMMO') ? cycleOf(p).uptime / cycleOf(p).interval : 0), 0) / Math.max(1, num(bb.consume_count, 1)));
    }
    if (key === 'act2autochess_gar_event_allyenemy_sleepstun_inrange') {
      const enabled = ps._botGrowthContext?.controlSusceptible ?? 1;
      const ownSleep = rec?.skill?.skillId === 'skchr_titi_2' ? cycle.uptime * 2 : /沉睡|晕眩/.test(rec?.skill?.desc || '') ? cycle.casts * Math.min(6, enemies) : 0;
      const others = units.filter(q => q.uid !== piece.uid && inRange(gd, ps, piece, q, rec) && /沉睡|晕眩/.test(record(q)?.skill?.desc || '')).reduce((n, q) => n + cycleOf(q).casts * 2, 0);
      times = Math.min(cap / Math.max(1, amount), ownSleep + others) * enabled;
    }
    if (key === 'act1autochess_gar_event_enemy_abflag_inrange') {
      const ice = units.filter(q => (q.items || []).some(it => /不融冰/.test(gd.item(it.id)?.name || '')));
      const frozen = units.filter(q => /冻结|寒冷/.test(record(q)?.skill?.desc || ''));
      times = (ice.length + frozen.length) * Math.min(enemies, 8) * num(bb.prob, 1) * (ps._botGrowthContext?.freezeSusceptible ?? 1);
    }
    if (key === 'SARKAZ_TYPHON') {
      const used = ps.counters?.[`sarkaz:typhon:round:${piece.uid}`] === round ? num(ps.counters?.[`sarkaz:typhon:used:${piece.uid}`]) : 0;
      cap = (rec.isGolden ? 56 : 28) - used; amount = 2; ids = ['sarkazShip'];
      times = units.filter(q => pieceTags(gd, ps, q).includes('sarkazShip')).reduce((n, q) => n + cycleOf(q).casts, 0);
    }
    if (key === 'SARKAZ_SHINING') { times = ps.counters?.['sarkaz:shining:round'] === round ? 0 : Math.min(1, cycle.casts); ids = [top()]; }
    if (s.bond_add_type === 'by_charcount_samerow') amount = row * num(bb.bond_add_count_multi, num(bb.bond_add_count, 1));
    if (s.bond_add_type === 'by_charlevel') amount *= gd.tierOf(piece.id);
    const base = Math.min(Math.max(0, cap), Math.max(0, times * amount));
    let extra = 0;
    for (const m of units) if (adjacent(ps, m)?.uid === piece.uid) for (const t of traits(gd, record(m))) if (t.effectKey === 'act1autochess_gar_event_addition_cnt') extra += num(t.bb?.extra_cnt) * Math.min(times, cap / Math.max(1, amount));
    for (const id of ids) if (id && active(ps, id) && !gd.bond(id)?.noStack) {
      const n = Math.max(0, Math.min(999 - num(ps.layers?.[id]) - num(gains[id]), base + extra));
      if (n > 0) { gains[id] = num(gains[id]) + n; trace.push({ uid: piece.uid, trait: g.garrisonId, event: 'IN_BATTLE', bondId: id, amount: n, estimated: true }); }
    }
  }
  return { gains, trace };
}

/** A short declining forecast: exact current prep, estimated combat, then at most two future prep pairs. */
export function forecastGrowth(gd, ps, pieces, round, { acquisition = false, record = p => gd.chess(p.id), event = null, only = false } = {}) {
  const remaining = Math.max(0, Math.min(2, gd.bossRound - round)), gains = {}, trace = [];
  const frame = Object.assign(Object.create(ps), { layers: { ...ps.layers }, funds: num(ps.funds), pendingFunds: num(ps.pendingFunds), counters: { ...ps.counters }, round: { ...ps.round } });
  // The lineup is fixed within one forecast; its detached piece views can be reused across prep events.
  frame._botPrepPieces = prepPieces(gd, ps);
  frame._botPieceBonds = new Map();
  const records = new Map(), resolveRecord = record;
  record = p => { if (!records.has(p.uid)) records.set(p.uid, resolveRecord(p)); return records.get(p.uid); };
  let prepPayment = 0;
  const onlyPiece = only ? pieces[0] : null;
  const collect = (p, weight = 1) => {
    for (const [id, n] of Object.entries(p.gains)) gains[id] = num(gains[id]) + n * weight;
    trace.push(...p.trace.map(t => ({ ...t, weight })));
    if (p.layers) { frame.layers = p.layers; frame.funds = p.funds; frame.pendingFunds = p.pendingFunds; frame.round = p.stats; frame.counters = p.counters; }
  };
  if (acquisition) collect(previewPrep(gd, frame, { event: 'SERVER_GAIN', round, only: pieces[0], record, includeCommon: false }));
  if (!event || event === 'SERVER_PREP_FIN') {
    const p = previewPrep(gd, frame, { round, only: onlyPiece, record }); prepPayment = p.prepPayment; collect(p);
  }
  if (!event || event === 'IN_BATTLE') collect(previewBattleGrowth(gd, frame, round, record, onlyPiece?.uid ?? null), .7);
  for (let k = 1; k <= remaining; k++) {
    const future = round + k, weight = .65 ** k;
    frame.funds = gd.income(future) + (ps.isBot ? future >= 9 ? 4 : future >= 6 ? 2 : future >= 3 ? 1 : 0 : 0) + frame.pendingFunds;
    if (ps.bandId === 'band_chiave') frame.funds += future >= 7 ? 2 : future >= 4 ? 1 : 0;
    frame.pendingFunds = 0; frame.round = { spent: 0, gainedChess: 0, refreshes: 0 };
    if (!event || event === 'SERVER_PREP_START') collect(previewPrep(gd, frame, { event: 'SERVER_PREP_START', round: future, only: onlyPiece, record }), weight);
    frame.round = { spent: Math.floor(frame.funds * .65), gainedChess: 2, refreshes: 2 };
    frame.funds = Math.max(0, frame.funds - frame.round.spent);
    if (!event || event === 'SERVER_PREP_FIN') collect(previewPrep(gd, frame, { round: future, only: onlyPiece, record }), weight);
    if (!event || event === 'IN_BATTLE') collect(previewBattleGrowth(gd, frame, future, record, onlyPiece?.uid ?? null), weight * .7);
  }
  return { gains, trace, remaining, prepPayment, cost: round < gd.bossRound ? 0 : prepPayment };
}
