// Bounded main-bond + two growth-route planning. All weights are AI utilities, not gameplay bonuses.
import { pieceBonds } from './bondsMeta.js';
import { growthTargets, growthTrait } from './botGrowth.js';

export const SUB_BOND_ROUTES = Object.freeze({
  victoriaShip: ['skillfulShip', 'arcaneShip', 'visiShip'],
  kjeragShip: ['skillfulShip', 'preciShip', 'swiftShip', 'arcaneShip'],
  lateranoShip: ['preciShip', 'skillfulShip', 'swiftShip', 'steadShip'],
  sargonShip: ['preciShip', 'swiftShip', 'skillfulShip', 'deputShip'],
  siracusaShip: ['swiftShip', 'arcaneShip', 'miraShip', 'preciShip'],
  yanShip: ['skillfulShip', 'arcaneShip', 'investShip'],
  kazimierzShip: ['raidShip', 'swiftShip', 'indomShip', 'preciShip'],
  sarkazShip: ['swiftShip', 'preciShip', 'arcaneShip', 'skillfulShip'],
  columbiaShip: ['preciShip', 'arcaneShip', 'skillfulShip', 'investShip'],
  egirShip: ['indomShip', 'raidShip', 'arcaneShip'],
});
const profileCache = new WeakMap();
export function engineProfile(gd, rec) {
  let cache = profileCache.get(gd); if (!cache) profileCache.set(gd, cache = new Map());
  if (!rec) return { targets: [], recurring: false, gain: false, position: false, copy: false, highest: false, hand: false, skills: false };
  const key = `${rec.chessId}|${rec.garrisonIds?.join(',')}`;
  if (cache.has(key)) return cache.get(key);
  const gs = (rec.garrisonIds || []).map(id => gd.garrison(id)).filter(Boolean);
  const p = { targets: growthTargets(gd, rec),
    recurring: gs.some(g => growthTrait(g.effectKey) && g.eventType !== 'SERVER_GAIN'),
    gain: gs.some(g => growthTrait(g.effectKey) && g.eventType === 'SERVER_GAIN'),
    position: gs.some(g => /POSITION|FRONT_SAME|^ADD_BOND$/.test(g.effectKey)),
    copy: gs.some(g => /FRONT_SAME|COLUMBIA_DEMKNI/.test(g.effectKey)),
    highest: gs.some(g => /MOST_LAYER|SARKAZ_SHINING/.test(g.effectKey) || g.bbStr?.bond_type === 'bond_actived_maxstack'),
    hand: gs.some(g => g.bbStr?.add_method === 'hand_count' || g.effectKey === 'SERVER_ADD_BOND_IN_HAND'),
    skills: gs.some(g => /useskill|SARKAZ_TYPHON/.test(g.effectKey)) };
  cache.set(key, p); return p;
}

export function selectSubBonds(m, ps, focus, owned, pool) {
  const gd = ps.gd || m.gd, preferred = SUB_BOND_ROUTES[focus] || [];
  const all = [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)].filter(p => p.kind === 'chess');
  const candidates = [];
  for (const id of gd.bondIds) {
    const b = gd.bond(id), count = owned.counts.get(id) || 0;
    if (b.isCore || b.noStack || gd.modeInactiveBonds.has(id)) continue;
    if (count + (pool.future.get(id) || 0) < b.thresholds[0]) continue;
    const rank = preferred.indexOf(id);
    let score = rank < 0 ? 0 : Math.max(4, 24 - rank * 7);
    score += Math.min(3, count) * 4 + (ps.bonds[id]?.active ? 4 : 0);
    const engines = all.filter(p => engineProfile(gd, gd.chess(p.id)).targets.includes(id));
    score += Math.min(16, engines.length * 6);
    if (rank < 0 && !count && !engines.length) continue;
    if (!count && !(pool.reach.get(id) > 0)) score -= 12;
    // A nearly saturated proc has less future growth value, but a layer reader can still use those layers.
    if (id === 'swiftShip' && ps.layers.swiftShip >= 229 && !all.some(p => gd.chess(p.id)?.garrisonIds?.some(g => gd.garrison(g)?.effectKey === 'act1autochess_gar_eff_attrByBond' && gd.garrison(g)?.bbStr?.bond_id?.includes('swiftShip')))) score -= 8;
    candidates.push({ id, score, engines: engines.map(p => p.uid), owned: count, missing: Math.max(0, b.thresholds[0] - count) });
  }
  candidates.sort((a, b) => b.score - a.score || gd.bondIds.indexOf(a.id) - gd.bondIds.indexOf(b.id));
  return { subBonds: candidates.slice(0, 2).map(x => x.id), routes: candidates.slice(0, 3) };
}

/** Engine + recipient readiness, modest enough that blockers/healers and immediate damage still matter. */
export function routeAffinity(gd, ps, rec, plan, round) {
  if (!rec) return 0;
  const profile = engineProfile(gd, rec), subs = plan.subBonds || [plan.second].filter(Boolean);
  const targets = [plan.focus, ...subs].filter(Boolean);
  let value = 0;
  for (const id of subs) if (rec.bonds?.includes(id)) value += ps.bonds[id]?.active ? 2 : 4;
  if (round < gd.bossRound) {
    const hit = targets.filter(id => profile.targets.includes(id)).length;
    value += Math.min(12, hit * (profile.recurring ? 4 : 2));
    if (profile.copy && subs.some(id => ps.bonds[id]?.active)) value += 3;
    if (profile.highest && targets.some(id => ps.bonds[id]?.active)) value += 2;
    if (profile.recurring && rec.tier <= ps.shop.level) value += 1;
  }
  return Math.min(18, value);
}

/** Keep useful bench bodies for 妮芙/流明, with one regular slot always available. */
export function growthBenchBudget(gd, ps, fallback) {
  if (![...ps.board.values()].some(p => p.kind === 'chess' && engineProfile(gd, gd.chess(p.id)).hand)) return fallback;
  const items = ps.hand.filter(p => p && p.kind !== 'chess').length;
  return Math.max(fallback, gd.benchSize - items - 1);
}

/** Extra deterministic value of the next refresh, in addition to normal shop/merge odds. */
export function bandRefreshUtility(gd, ps) {
  if (ps.bandId === 'band_chiave') {
    const next = (ps.counters?.['band:chiave:refreshes'] || 0) + 1;
    const used = ps.counters?.['band:chiave:r'] === ps.m?.round ? ps.counters?.['band:chiave'] || 0 : 0;
    return used < 2 ? (next % 6 === 0 ? 7 : 1) : 0;
  }
  if (ps.bandId === 'band_duyaoy' && ps.round.refreshes < 2) return 3;
  if (ps.bandId === 'band_recruit_sarkaz' && ps.round.refreshes === 0) return 4;
  return 0;
}

export function planOwnedBonds(gd, ps, exclude = null) {
  const sets = new Map(), bases = new Set();
  for (const p of [...ps.board.values(), ...ps.hand, ...ps.temp]) if (p?.kind === 'chess' && p.uid !== exclude) {
    const base = gd.baseIdOf(p.id); bases.add(base);
    for (const id of pieceBonds(gd, p)) {
      const char = gd.chess(p.id)?.charId;
      const identity = id === 'sarkazShip' ? ({ char_1035_wisdel: 'char_113_cqbw', char_1024_hbisc2: 'char_120_hibisc' }[char] || char || base) : id === 'columbiaShip' ? char || base : base;
      if (!sets.has(id)) sets.set(id, new Set()); sets.get(id).add(identity);
    }
  }
  return { counts: new Map([...sets].map(([id, set]) => [id, set.size])), bases };
}
