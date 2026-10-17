// The maintainer's confirmed 2026-10-17 Hidden Core abilities. Pure, deterministic, shared by both runners.
import { isCatastropheHiddenBattle } from '../../../shared/difficulty.js';
import { applyHpLoss, isHpLoss, makeDamageInfo } from '../damage.js';
import { canCast } from './enemies/helpers.js';

export const CAT = Object.freeze({ steelCost: 50, steelCharge: 3, concordCost: 30, concordCharge: 8,
  armour: 'enemy_10027_vtsk', echo: 'enemy_9023_acdums', pipe: 'enemy_9021_acduml_2', string: 'enemy_9022_acdumm',
  helm: 'enemy_9013_acstmk_2', gun: 'enemy_9017_achunt_2', shieldKey: 'catastrophe:steelShield' });
const STATES = new WeakMap();
const ARMOUR_STATUSES = new Set(['stun', 'freeze', 'sleep', 'bind', 'silence', 'fear', 'levitate']);
const active = (b, u) => !!(u?.deployed && canCast(u, false, b));
const isLoss = c => isHpLoss(c.dmg) || c.type === 'element';
const stateOf = b => {
  let st = STATES.get(b);
  if (!st) { st = { pipe: null, string: null, sp: 0, charging: false, casts: 0, epoch: 0, task: null }; STATES.set(b, st); }
  return st;
};

function channel(b, u, on) {
  if (!u) return;
  u.mem.catastropheCasting = on;
  if (on) b.addBuff(u, { key: 'catastrophe:channel', persist: true, visible: true, flags: { disarm: true } });
  else { b.removeBuff(u, 'catastrophe:channel'); u.skillAnimUntil = b.time; }
}

function stopConcord(b, st) {
  if (st.charging && st.pipe) b.fx('telegraph', { x: st.pipe.x, y: st.pipe.y,
    key: `catastrophe:concord:${st.pipe.id}`, cancel: true });
  st.charging = false;
  st.sp = 0;
  st.epoch++;
  st.task?.cancel();
  st.task = null;
  channel(b, st.pipe, false);
  channel(b, st.string, false);
}

function device(u) {
  return u.kind === 'device' || u.def?.profession === 'TRAP' || u.trait.device === true
    || u.defId === 'token_10041_cathy_catsld' || u.defId.startsWith('trap_');
}

function finishConcord(b, st) {
  const targets = b.allyUnits.filter(u => u.alive && u.deployed && !device(u));
  for (const u of targets) b.dealDamage(st.pipe, u, { type: 'element', element: 'apoptosis', amount: 999,
    ignoreSelect: true, tags: ['enemyAbility', 'catastropheConcord'] });
  for (const u of targets) {
    if (!u.alive || !u.findBuff('apoptosisBurst')) continue;
    if (u.mem.catastropheForceExit?.()) continue;
    // No fatal / kill / death dispatch: immortality, revive and other-death growth cannot intercept this exit.
    u.hp = 0;
    const depth = b._suppressDeathEvents || 0;
    b._suppressDeathEvents = depth + 1;
    try { b.retreat(u, { reason: 'catastrophe-expelled', permanent: true, suppressDeath: true }); }
    finally { b._suppressDeathEvents = depth; }
    // A tactical point's own recovery is explicitly allowed, without notifying global death listeners.
    if (u.ownerUnit?.mem.catastropheTokenExit) u.ownerUnit.mem.catastropheTokenExit(u);
    else u.mem.catastrophePointExit?.();
  }
}

function tryConcord(b, st) {
  if (st.charging || st.sp < CAT.concordCost || !active(b, st.pipe) || !active(b, st.string)) return;
  st.sp = 0;
  st.charging = true;
  st.casts++;
  const epoch = ++st.epoch;
  for (const u of [st.pipe, st.string]) { channel(b, u, true); u.skillAnimUntil = b.time + CAT.concordCharge; }
  b.fx('telegraph', { x: st.pipe.x, y: st.pipe.y, id: st.pipe.id, r: 3, dur: CAT.concordCharge,
    key: `catastrophe:concord:${st.pipe.id}`, kind: 'catastropheConcord' });
  st.task = b.after(CAT.concordCharge, () => {
    if (!st.charging || st.epoch !== epoch) return;
    if (!st.pipe.alive || !st.string.alive) { stopConcord(b, st); return; }
    finishConcord(b, st);
    stopConcord(b, st);
  }, { owner: st.pipe });
}

function armourImmune(b, u, helm) {
  u.mem.catastropheArmourBoss = helm;
  // Clone the def: immunities must never leak into ordinary copies of the same data record.
  u.def = { ...u.def, immune: new Set([...u.def.immune, 'stun', 'frozen', 'sleep', 'silence', 'feared', 'levitate']) };
  for (let i = u.buffs.length - 1; i >= 0; i--) if (ARMOUR_STATUSES.has(u.buffs[i].status)) b.removeBuff(u, u.buffs[i].key);
  b.addBuff(u, { key: 'catastrophe:armourImmunity', persist: true, visible: true, flags: { noDisplace: true } });
}

function finishSteel(b, helm, tpl, summonMods) {
  const rows = (tpl?.spawns || []).filter(s => s.key === CAT.armour);
  const n = b.players.length > 1 ? 2 : 1;
  const routes = [];
  for (const row of rows) {
    const route = tpl.routes[row.routeIndex];
    if (route && !routes.some(r => r.end?.[1] === route.end?.[1])) routes.push(route);
  }
  for (const route of routes.slice(0, n)) b.spawnEnemy(CAT.armour, { route, mods: summonMods(b) });
  const add = helm.s.maxHp * .01, cap = helm.s.maxHp * .02;
  for (const u of b.enemies) {
    if (!u.alive) continue;
    const old = u.findBuff(CAT.shieldKey);
    b.addBuff(u, { key: CAT.shieldKey, shield: Math.min(cap, (old?.shield || 0) + add),
      persist: true, visible: true, data: { numericShieldCapExempt: true } });
    if (u.defId === CAT.armour) armourImmune(b, u, helm);
  }
  b.fx('summon', { x: helm.x, y: helm.y, id: helm.id, key: CAT.armour, n: Math.min(n, routes.length) });
}

function trySteel(b, e, tpl, summonMods) {
  const st = e.mem.catastropheSteel;
  if (st.sp < CAT.steelCost || st.charging || !active(b, e)) return;
  // Lower than each ready authored skill, higher than an ordinary attack.
  if (e.mem.ab.list.some(a => a.fire && a.left <= b.dt + 1e-9 && (!a.cond || a.cond(b, e, a)))) return;
  st.sp = 0;
  st.charging = true;
  st.casts++;
  channel(b, e, true);
  e.skillAnimUntil = b.time + CAT.steelCharge;
  b.fx('telegraph', { x: e.x, y: e.y, id: e.id, r: 3, dur: CAT.steelCharge, kind: 'catastropheSteel' });
  b.after(CAT.steelCharge, () => {
    if (!e.alive) return;
    finishSteel(b, e, tpl, summonMods);
    st.charging = false;
    channel(b, e, false);
  }, { owner: e });
}

/** Attach the zero-initial-SP abilities after the official boss kit has been installed. */
export function bindCatastropheBoss(b, e, tpl, summonMods) {
  if (!isCatastropheHiddenBattle(b)) return;
  if (e.defId === CAT.helm) {
    e.mem.catastropheSteel = { sp: 0, charging: false, casts: 0 };
    e.mem.catastropheBeforeAction = () => trySteel(b, e, tpl, summonMods);
  } else if (e.defId === CAT.pipe || e.defId === CAT.string) {
    const st = stateOf(b);
    st[e.defId === CAT.pipe ? 'pipe' : 'string'] = e;
    e.mem.catastropheConcord = st;
    e.mem.catastropheBeforeAction = () => tryConcord(b, st);
  } else if (e.defId === CAT.gun) {
    b.addBuff(e, { key: 'catastrophe:gunTaunt', persist: true, mods: { taunt: -1 } });
  }
}

export function catastrophePipeAttack(b, source) {
  if (!isCatastropheHiddenBattle(b)) return;
  const st = stateOf(b);
  if (!st.charging && (source === st.pipe || source === st.string)) st.sp = Math.min(CAT.concordCost, st.sp + 1);
}

export function catastropheEchoChanged(b, source) {
  if (!isCatastropheHiddenBattle(b)) return;
  const st = stateOf(b);
  if (!st.charging && (source === st.pipe || source === st.string)) st.sp = Math.min(CAT.concordCost, st.sp + 3);
}

export function installCatastropheBosses(b) {
  if (!isCatastropheHiddenBattle(b)) return;
  stateOf(b);
  b.on('damaged', c => {
    const st = c.target?.mem.catastropheSteel;
    if (st && !st.charging && c.amount > 0 && !isLoss(c)) st.sp = Math.min(CAT.steelCost, st.sp + 1);
  });
  b.on('beforeStatus', c => {
    if (c.target?.mem.catastropheArmourBoss && ARMOUR_STATUSES.has(c.status)) c.cancel = true;
  }, { priority: -1000 });
  b.on('beforeDamageShields', c => {
    const e = c.target, src = c.source;
    if (e.defId !== CAT.gun || src?.side !== 'ally' || !(c.amount > 0) || isHpLoss(c.dmg)) return;
    const shields = { arts: false, element: false, hits: false };
    for (const sp of b.enemies) {
      const shield = sp.mem.ab?.springShield;
      if (shield?.up) shields[shield.kind] = true;
    }
    const tags = ['counter', 'catastrophePenance'];
    if (shields.element && src.alive) b.dealDamage(e, src, { type: 'element', element: 'erosion', amount: 100, ignoreSelect: true, tags });
    if (shields.arts) b.addBuff(src, { key: 'catastrophe:penanceDot', duration: 10, refresh: 'extend', interval: 1,
      onTick: ({ battle, unit }) => battle.dealDamage(e, unit, { amount: 100, type: 'arts', canDodge: false, ignoreSelect: true, tags }) });
    if (shields.hits) b.addBuff(src, { key: 'catastrophe:penanceSlow', duration: 10, refresh: 'extend', mods: { aspdFinalMul: .5 } });
    if (!shields.arts && !shields.element && !shields.hits) b.loseHp(e, 2000, { source: src, tags: ['catastrophePenance'] });
  });
  b.on('death', c => {
    const u = c.unit;
    const helm = u.mem.catastropheArmourBoss;
    if (helm?.alive && c.reason === 'killed' && !u.mem.catastropheArmourPaid) {
      u.mem.catastropheArmourPaid = true;
      // Like the existing drone-link pool share, a fixed pool percentage must not be cancelled at large co-op HP.
      b.loseHp(helm, helm.s.maxHp * .01, { source: c.killer, noHitLimit: true, tags: ['catastropheSteel'] });
    }
    const st = stateOf(b);
    if (u.defId === CAT.echo && c.reason === 'killed' && st.charging) {
      stopConcord(b, st);
      if (st.pipe?.alive) applyHpLoss(b, c.killer, st.pipe, st.pipe.s.maxHp * .05,
        makeDamageInfo({ type: 'true', sourceless: true, tags: ['catastropheDiscord'] }), null);
      b.fx('phase', { x: u.x, y: u.y, id: u.id, kind: 'catastropheInterrupted' });
    } else if ((u === st.pipe || u === st.string) && st.charging) stopConcord(b, st);
  }, { priority: -100 });
}
