// Prep-side estimates only. Real Battle rehearsals decide boss candidates; these cheap estimates shortlist them.
import { pieceBonds, computeBonds } from './bondsMeta.js';
import { mitigate } from '../sim/damage.js';
import { BOSS_HIT_LIMIT } from '../../shared/constants.js';
import { forecastGrowth, growthTrait, skillCycle } from './botGrowth.js';

const num = (v, d = 0) => Number.isFinite(v) ? v : d;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const bbOf = r => Object.assign({}, ...(r?.buffs || []).map(b => b.bb || {}));
const active = (ps, id) => !!ps.bonds?.[id]?.active;
const layers = (ps, id) => num(ps.layers?.[id]);

/** Extra income belongs to AI seats, never a human who enabled autoplay. */
export function botIncomeBonus(round) { return round >= 9 ? 4 : round >= 6 ? 2 : round >= 3 ? 1 : 0; }

export function receivesBond(gd, ps, piece, id) {
  const own = pieceBonds(gd, piece);
  return own.includes(id) || (own.includes('maniShip') && active(ps, 'maniShip') && gd.bond(id)?.isCore);
}

const CUSTOM_TRAITS = new Set(['COLUMBIA_ASTESI', 'COLUMBIA_F12YIN', 'COLUMBIA_F12YIN_START',
  'COLUMBIA_APHRIS', 'COLUMBIA_SILENT', 'COLUMBIA_BSTALK', 'COLUMBIA_CTRAIL', 'SARKAZ_METEO', 'SARKAZ_MUDROK', 'SARKAZ_HBISC2']);
const PREP_GROWTH = new Set(['SERVER_ADD_BOND', 'SERVER_ADD_MULTIPLE_BOND', 'SERVER_ADD_BOND_CHESS_ALL',
  'SERVER_ADD_BOND_METHOD', 'SERVER_ADD_BOND_ACTIVATED_MOST_LAYER', 'SERVER_ADD_ACT_BOND_DIFF_LV_MOST_LAYER',
  'SERVER_ADD_BOND_IN_HAND', 'SERVER_ADD_BOND_POSITION', 'SERVER_ADD_BOND_ROUND_COIN_COST',
  'SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER', 'SERVER_GAIN_BOND_LAYER_BY_REFRESH_CNT',
  'SERVER_FRONT_SAME_EFFECT_PREP_FIN', 'SERVER_FRONT_SAME_EFFECT_PREP_START', 'COLUMBIA_DEMKNI',
  'act1autochess_gar_event_useskill']);
export const customGrowthTrait = key => CUSTOM_TRAITS.has(key) || PREP_GROWTH.has(key) || growthTrait(key);

/** Decision points for useful stored layers; these are not additional in-game bonuses. */
export function bondStackValue(gd, ps, id, amount = layers(ps, id)) {
  const rec = gd.bond(id);
  if (!rec || rec.noStack || !active(ps, id)) return 0;
  const b = { ...bbOf(rec), ...rec.bb }, L = clamp(num(amount), 0, 999);
  let ratio = 1, points = 0;
  if (b.atk_per_stack) ratio *= (1 + num(b.base_atk) + L * b.atk_per_stack) / (1 + num(b.base_atk));
  if (b.damage_scale_per_stack) ratio *= (num(b.base_damage_scale, 1) + L * b.damage_scale_per_stack) / num(b.base_damage_scale, 1);
  if (b.ex_damage_scale_per_stack) ratio *= (num(b.base_ex_damage_scale, 1) + L * b.ex_damage_scale_per_stack) / num(b.base_ex_damage_scale, 1);
  if (b.attack_speed_per_stack) ratio *= Math.min(600, 100 + num(b.base_attack_speed) + L * b.attack_speed_per_stack) / (100 + num(b.base_attack_speed));
  if (b.prob_per_stack) ratio *= (1 + Math.min(1, num(b.base_prob) + L * b.prob_per_stack)) / (1 + num(b.base_prob));
  if (b.max_hp_per_stack) ratio *= (1 + num(b.base_max_hp) + L * b.max_hp_per_stack) / (1 + num(b.base_max_hp));
  if (b.time_per_stack) ratio *= (1 + Math.min(60, num(b.base_time) + L * b.time_per_stack) / 30) / (1 + num(b.base_time) / 30);
  if (b.power_bond_stack_cnt && L >= b.power_bond_stack_cnt) points += 5;
  if (id === 'visiShip') points += L < b.layer1 ? 6 * L / b.layer1 : L < b.layer2 ? 12 + 8 * (L - b.layer1) / (b.layer2 - b.layer1) : 24;
  if (id === 'investShip') points += 8 * Math.min(1, L / 100); // dispatcher: gain traits x2 -> x3 at 100
  if (id === 'columbiaShip' && ps.bonds?.[id]?.tier >= 2) ratio *= 10 / Math.max(1, 10 - Math.floor(L / 10) * .1);
  if (ratio === 1 && points === 0 && L > 0 && !b.prob_per_stack && !b.attack_speed_per_stack) points = 6 * Math.log2(1 + L / 50);
  return Math.min(60, points + 12 * Math.log2(Math.max(1, ratio)));
}

/** One-piece forecast with the same prep event handlers as production. */
export function growthProjection(gd, ps, rec, round, { acquisition = true, piece = { uid: -1, id: rec?.chessId, kind: 'chess', area: 'board', items: [] }, event = null } = {}) {
  if (!rec?.garrisonIds?.some(id => growthTrait(gd.garrison(id)?.effectKey))) return { gains: {}, trace: [], remaining: 0, prepPayment: 0, cost: 0 };
  return forecastGrowth(gd, ps, [piece], round, { acquisition, only: true, event,
    record: p => p.uid === piece.uid ? rec : gd.chess(p.id) });
}

function projectedValue(gd, ps, projection) {
  let value = 0;
  for (const [id, raw] of Object.entries(projection.gains)) {
    const before = layers(ps, id), n = Math.min(Math.max(0, 999 - before), raw);
    const utility = bondStackValue(gd, ps, id, before + n) - bondStackValue(gd, ps, id, before);
    if (utility > 0) value += utility + Math.min(16, .18 * n);
    else if (!active(ps, id)) value += Math.min(3, n * .08); // acquisition can bank layers before activation
    if (id === 'columbiaShip') value += Math.floor(n / 10) * .4;
  }
  return Math.max(0, value - projection.cost * .4);
}

export function growthPlanValue(gd, ps, pieces, round, recOf = piece => gd.chess(piece.id)) {
  return Math.min(72, projectedValue(gd, ps, forecastGrowth(gd, ps, pieces, round, { record: recOf })));
}

/** Exact marginal layers of the next manual refresh, using actual per-piece round markers. */
export function refreshGrowthValue(gd, ps) {
  const split = value => String(value || '').split(',').filter(Boolean);
  const gains = {}, board = new Set([...ps.board.values()].map(p => p.uid));
  for (const piece of [...ps.board.values(), ...ps.hand]) {
    if (piece?.kind !== 'chess') continue;
    for (const id of gd.chess(piece.id)?.garrisonIds || []) {
      const g = gd.garrison(id), b = g?.bb || {}, s = g?.bbStr || {};
      if (s.conditionkey === 'character_target_inboard' && !board.has(piece.uid)) continue;
      let amount = 0;
      if (g?.effectKey === 'SERVER_GAIN_BOND_LAYER_BY_REFRESH_CNT') {
        const seen = ps.pieceRoundCount?.(piece, 'garrison:SERVER_GAIN_BOND_LAYER_BY_REFRESH_CNT:refreshes') ?? num(ps.round?.refreshes);
        if (seen + 1 === num(b.refresh_cnt, 1)) amount = num(b.layer);
      } else if (g?.effectKey === 'SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER' && g.eventType === 'SERVER_PREP_FIN') {
        const before = num(ps.round?.refreshes), cap = num(b.max_layer, Infinity);
        amount = Math.min(cap, (before + 1) * b.multiplier) - Math.min(cap, before * b.multiplier);
      }
      const required = /已激活|激活且/.test(g?.desc || '') && !/无需激活/.test(g?.desc || '');
      for (const bond of split(s.bond)) if (amount > 0 && (!required || active(ps, bond))) gains[bond] = num(gains[bond]) + amount;
    }
  }
  return projectedValue(gd, ps, { gains, cost: 0 });
}

/** Forecast actual handler parameters, activation and remaining rounds, rather than counting a name substring. */
export function growthValue(gd, ps, rec, round, { acquisition = true, piece } = {}) {
  return Math.min(32, projectedValue(gd, ps, growthProjection(gd, ps, rec, round, { acquisition, ...(piece ? { piece } : {}) })));
}

export function acquisitionGrowthValue(gd, ps, rec, round) {
  return projectedValue(gd, ps, growthProjection(gd, ps, rec, round, { event: 'SERVER_GAIN' }));
}


/** Leave enough for one useful end-prep 星极 trigger, in addition to a band's interest reserve. */
export function growthReserve(gd, ps) {
  if (!active(ps, 'columbiaShip') && !active(ps, 'arcaneShip')) return 0;
  if ((!active(ps, 'columbiaShip') || layers(ps, 'columbiaShip') >= 999)
      && (!active(ps, 'arcaneShip') || layers(ps, 'arcaneShip') >= 999)) return 0;
  let reserve = 0;
  for (const p of ps.board.values()) if (p.kind === 'chess') {
    for (const id of gd.chess(p.id)?.garrisonIds || []) {
      const g = gd.garrison(id);
      if (g?.effectKey === 'COLUMBIA_ASTESI') reserve = Math.max(reserve, num(g.bb?.max_cost));
    }
  }
  return reserve;
}

/** Skill-window approximation; no future RNG, no future shop draws. The real rehearsal handles exact hooks. */
export function estimateCombat(gd, ps, rec, piece = { id: rec?.chessId }, { horizon = 20, aura = false, boss = false, def = 0, res = 0 } = {}) {
  if (!rec?.stats || rec.attackKind === 'heal' || rec.dmgType === 'heal') return { dps: 0, interval: 1, hit: 0, capped: false };
  const st = rec.stats, member = id => receivesBond(gd, ps, piece, id);
  let atkPct = 0, atkFlat = 0, aspd = num(st.aspd, 100), dmgMul = 1;
  for (const it of piece.items || []) {
    const item = gd.item(it.id), b = bbOf(item);
    atkPct += num(b.atk); aspd += num(b.attack_speed);
    if (item?.id?.startsWith('chess_item_6_columbia_field_e_') && member('columbiaShip')) {
      atkFlat += num(item.params?.atk); aspd += num(item.params?.aspd);
    }
  }
  let defIgnore = 0, resIgnore = 0;
  if (active(ps, 'preciShip') && (member('preciShip') || (ps.bonds.preciShip.tier >= 2 && rec.position === 'RANGED'))) {
    const b = bbOf(gd.bond('preciShip'));
    atkPct += num(b.base_atk) + num(b.atk_per_stack) * layers(ps, 'preciShip');
    if (ps.bonds.preciShip.tier >= 2) { defIgnore = num(b.power_def_penetrate); resIgnore = num(b.power_magic_resist_penetrate); }
  }
  if (active(ps, 'suntShip') && rec.isGolden) atkPct += num(bbOf(gd.bond('suntShip')).power_atk);
  for (const id of ['columbiaShip', 'sarkazShip', 'yanShip']) if (active(ps, id) && member(id)) {
    const b = { ...bbOf(gd.bond(id)), ...gd.bond(id)?.bb };
    atkPct += num(b.base_atk) + num(b.atk_per_stack) * layers(ps, id);
  }
  if (active(ps, 'skillfulShip') && (member('skillfulShip') || aura)) {
    const b = bbOf(gd.bond('skillfulShip'));
    aspd += num(b.base_attack_speed) + num(b.attack_speed_per_stack) * layers(ps, 'skillfulShip');
  }
  if (active(ps, 'kjeragShip') && member('kjeragShip')) {
    const b = bbOf(gd.bond('kjeragShip'));
    const cold = [...ps.board.values()].some(p => p.kind === 'chess' && (p.items || []).some(it => gd.item(it.id)?.name === '谢拉格不融冰'));
    const base = num(b.base_damage_scale, 1), chilled = num(b.base_ex_damage_scale, base) + num(b.ex_damage_scale_per_stack) * layers(ps, 'kjeragShip');
    dmgMul *= cold ? (base + chilled) / 2 : base;
  }
  if (rec.dmgType === 'arts' && active(ps, 'arcaneShip') && member('arcaneShip')) {
    const b = bbOf(gd.bond('arcaneShip'));
    dmgMul *= num(b.base_damage_scale, 1) + num(b.damage_scale_per_stack) * layers(ps, 'arcaneShip');
  }
  for (const gid of rec.garrisonIds || []) {
    const g = gd.garrison(gid), b = g?.bb || {};
    if (g?.effectKey === 'act1autochess_gar_eff_attrByBond') {
      const ids = String(g.bbStr?.bond_id || '').split(',');
      const n = Math.floor(ids.reduce((s, id) => s + (active(ps, id) ? layers(ps, id) : 0), 0) / Math.max(1, num(b.divide_num, 1)));
      atkPct += n * num(b.atk); aspd += n * num(b.attack_speed);
    }
  }
  if (active(ps, 'victoriaShip') && member('victoriaShip') && piece.items?.length) {
    const b = bbOf(gd.bond('victoriaShip'));
    dmgMul *= num(b.base_damage_scale, 1) + num(b.damage_scale_per_stack) * layers(ps, 'victoriaShip');
    if (ps.bonds.victoriaShip.tier >= 2) for (const it of piece.items) atkPct += num(b.atk_normal_equip) + (gd.item(it.id)?.isGolden ? num(b.atk_golden_equip) : 0);
  }
  const skill = rec.skill || {}, bb = skill.bb || {}, cycle = skillCycle(gd, ps, rec, piece, horizon);
  const start = cycle.first;
  const duration = cycle.uptime;
  const uptime = clamp(duration / horizon, 0, 1);
  const interval = Math.max(0.1, num(st.bat, 1) * 100 / clamp(aspd, 20, 600));
  const skillInterval = Math.max(1 / 30, (num(st.bat, 1) + num(bb.base_attack_time)) * 100 / clamp(aspd + num(bb.attack_speed), 20, 600));
  const hit = mitigate((num(st.atk) + atkFlat) * (1 + atkPct), rec.dmgType === 'arts' ? 'arts' : 'phys', { def: def * (1 - defIgnore), res: res * (1 - resIgnore) }) * dmgMul;
  const skillHit = mitigate((num(st.atk) + atkFlat) * (1 + atkPct + num(bb.atk)), rec.dmgType === 'arts' ? 'arts' : 'phys', { def: def * (1 - defIgnore), res: res * (1 - resIgnore) }) * dmgMul;
  let hits = 1;
  if (skill.skillId === 'skchr_kroos2_2') {
    const need = num(bb['attack@max_stack_count'], 40), transition = need / 2 * skillInterval;
    hits = duration > transition ? (2 * transition + 4 * (duration - transition)) / duration : 2;
  }
  let crit = 1;
  for (const t of rec.talents || []) if (t.bb?.prob && t.bb?.atk_scale) crit *= 1 + t.bb.prob * Math.max(0, t.bb.atk_scale - 1);
  const capBase = boss && Math.ceil(hit) >= BOSS_HIT_LIMIT, capSkill = boss && Math.ceil(skillHit) >= BOSS_HIT_LIMIT;
  const dps = crit * ((capBase ? 0 : hit / interval) * (1 - uptime) + (capSkill ? 0 : skillHit * hits / skillInterval) * uptime);
  return { dps: rec.attackKind === 'none' ? dps * 0.4 : dps, interval, hit, start, uptime, aspd: clamp(aspd, 20, 600), capped: capBase || capSkill };
}

/** Marginal value of a legal equipment assignment, including a still-unassigned morph partner. */
export function equipmentGain(gd, ps, piece, item, rec) {
  const before = estimateCombat(gd, ps, rec, piece, { boss: true }).dps;
  const withItem = { ...piece, items: [...(piece.items || []), item] };
  let gain = estimateCombat(gd, ps, rec, withItem, { boss: true }).dps - before;
  const r = gd.item(item.id);
  if (pieceBonds(gd, withItem).length > pieceBonds(gd, piece).length) {
    const view = Object.assign(Object.create(ps), {
      board: new Map([...ps.board].map(([k,p]) => [k,p.uid === piece.uid ? withItem : p])),
      hand: ps.hand.map(p => p?.uid === piece.uid ? withItem : p),
    });
    view.bonds = computeBonds(gd, view);
    gain += 100 * Math.max(0, growthValue(gd, view, rec, ps.m?.round ?? gd.bossRound, { acquisition: false, piece: withItem })
      - growthValue(gd, ps, rec, ps.m?.round ?? gd.bossRound, { acquisition: false, piece }));
  }
  if (r?.canGiveBond && withItem.items.length < gd.equipPerChess) {
    for (const it of [...ps.hand, ...ps.temp]) if (it?.kind === 'item' && gd.item(it.id)?.giveBondId) {
      gain = Math.max(gain, estimateCombat(gd, ps, rec, { ...withItem, items: [...withItem.items, it] }, { boss: true }).dps - before);
    }
  }
  return Math.max(-20, Math.min(20, 6 * Math.log2(1 + Math.max(0, gain) / Math.max(100, before)))) - (gain < 0 ? 8 : 0);
}
