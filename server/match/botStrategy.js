// Prep-side estimates only. Real Battle rehearsals decide boss candidates; these cheap estimates shortlist them.
import { pieceBonds } from './bondsMeta.js';
import { mitigate } from '../sim/damage.js';
import { BOSS_HIT_LIMIT } from '../../shared/constants.js';

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
export const customGrowthTrait = key => CUSTOM_TRAITS.has(key);

/** Forecast actual handler parameters, activation and remaining rounds, rather than counting a name substring. */
export function growthValue(gd, ps, rec, round, { acquisition = true } = {}) {
  let value = 0;
  const remaining = Math.max(0, Math.min(8, gd.bossRound - round));
  const funds = Math.max(ps.funds || 0, gd.income(Math.min(gd.bossRound, round + 1)) + (ps.isBot ? botIncomeBonus(round + 1) : 0));
  const room = id => Math.max(0, 999 - layers(ps, id));
  const gain = (id, n, requireActive = true) => (!requireActive || active(ps, id)) ? Math.min(room(id), Math.max(0, n)) : 0;
  for (const id of rec?.garrisonIds || []) {
    const g = gd.garrison(id), b = g?.bb || {}, count = num(b.count, rec.isGolden ? 4 : 2);
    if (g?.eventType === 'SERVER_GAIN' && !acquisition) continue;
    const triggers = Math.min(num(b.max_triggers, Infinity), Math.floor(funds / Math.max(1, num(b.funds_per_trigger, 1))));
    let n = 0, cost = 0;
    switch (g?.effectKey) {
      case 'COLUMBIA_ASTESI': {
        const paid = Math.min(funds, num(b.max_cost));
        n = gain('columbiaShip', paid * count) + gain('arcaneShip', paid * count);
        // The exact payment returns next round; at the final prep there is no later income to spend.
        cost = remaining > 0 ? 0 : paid;
        break;
      }
      case 'COLUMBIA_F12YIN': n = gain('investShip', Math.floor(funds / Math.max(1, num(b.funds_per_trigger, 3))) * count); break;
      case 'COLUMBIA_F12YIN_START': n = gain('columbiaShip', triggers * count); break;
      case 'COLUMBIA_APHRIS':
        if (active(ps, 'columbiaShip') && active(ps, 'preciShip')) {
          n = gain('columbiaShip', triggers * count) + gain('preciShip', triggers * count); cost = triggers;
        }
        break;
      case 'COLUMBIA_SILENT': {
        const doubled = funds > num(b.double_above_funds, 10);
        n = gain('visiShip', count * (doubled ? 2 : 1)) + gain('columbiaShip', count * (doubled ? 2 : 1));
        cost = doubled ? 1 : 0; break;
      }
      case 'COLUMBIA_BSTALK': n = gain('columbiaShip', rec.isGolden ? 4 : 2, false); break;
      case 'COLUMBIA_CTRAIL': n = gain('skillfulShip', rec.isGolden ? 4 : 2, false); break;
      case 'SARKAZ_METEO': n = pieceBonds(gd, { id: rec.chessId }).reduce((s, bond) => s + gain(bond, rec.isGolden ? 8 : 4, false), 0); break;
      case 'SARKAZ_HBISC2': n = pieceBonds(gd, { id: rec.chessId }).reduce((s, bond) => s + gain(bond, count, false), 0); break;
      case 'SARKAZ_MUDROK': value += rec.isGolden ? 2 : 1; continue;
      default: continue;
    }
    const repeats = g.eventType === 'SERVER_GAIN' ? 1 : remaining + (g.eventType === 'SERVER_PREP_FIN' ? 1 : 0);
    value += Math.max(0, n * 0.25 - cost * 0.4) * repeats;
  }
  return Math.min(18, value);
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
  let atkPct = 0, atkFlat = 0, aspd = num(st.aspd, 100), dmgMul = 1, initialSp = num(rec.skill?.initSp), recovery = 1;
  for (const it of piece.items || []) {
    const item = gd.item(it.id), b = bbOf(item);
    atkPct += num(b.atk); aspd += num(b.attack_speed); recovery += num(b.sp_recovery_per_sec);
    if (item?.id?.startsWith('chess_item_6_columbia_field_e_') && member('columbiaShip')) {
      atkFlat += num(item.params?.atk); aspd += num(item.params?.aspd);
    }
    if (b.sp_each_person) {
      const own = pieceBonds(gd, piece);
      const peers = [...ps.board.values()].filter(p => p.kind === 'chess' && p.uid !== piece.uid
        && pieceBonds(gd, p).some(id => own.includes(id))).length;
      initialSp += b.sp_each_person * (peers + 1);
    }
  }
  let defIgnore = 0, resIgnore = 0;
  if (active(ps, 'preciShip') && (member('preciShip') || (ps.bonds.preciShip.tier >= 2 && rec.position === 'RANGED'))) {
    const b = bbOf(gd.bond('preciShip'));
    atkPct += num(b.base_atk) + num(b.atk_per_stack) * layers(ps, 'preciShip');
    if (ps.bonds.preciShip.tier >= 2) { defIgnore = num(b.power_def_penetrate); resIgnore = num(b.power_magic_resist_penetrate); }
  }
  if (active(ps, 'suntShip') && rec.isGolden) atkPct += num(bbOf(gd.bond('suntShip')).power_atk);
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
  const skill = rec.skill || {}, bb = skill.bb || {};
  const cost = num(skill.spCost, Infinity) * (rec.isGolden && ps.bonds?.suntShip?.tier >= 2 ? num(bbOf(gd.bond('suntShip')).sp_ratio, 1) : 1);
  const start = Math.max(0, cost - initialSp) / Math.max(0.1, recovery);
  const duration = Math.min(Math.max(0, horizon - start), Math.max(0, num(skill.duration)));
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
  if (r?.canGiveBond && withItem.items.length < gd.equipPerChess) {
    for (const it of [...ps.hand, ...ps.temp]) if (it?.kind === 'item' && gd.item(it.id)?.giveBondId) {
      gain = Math.max(gain, estimateCombat(gd, ps, rec, { ...withItem, items: [...withItem.items, it] }, { boss: true }).dps - before);
    }
  }
  return Math.max(-20, Math.min(20, 6 * Math.log2(1 + Math.max(0, gain) / Math.max(100, before)))) - (gain < 0 ? 8 : 0);
}
