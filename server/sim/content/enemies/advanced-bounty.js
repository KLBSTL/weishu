// R12 leaders. Official level-0 blackboards plus PRTS mechanisms; explicit local deviations in docs/design/advanced-bounties.md.
import { T, hurt, elem, areaAllies, areaAlliesInTiles, fieldAllies, targetsNear, byPriority,
  spawnChildren, auraBuff, canCast, setForm } from './helpers.js';
import { reborn, skill, blinkForward } from './archetypes.js';
import { hypot } from '../../detmath.js';
import { aggroCmp } from '../../targeting.js';

const sameField = (e, u) => e.ownerId == null || u.ownerId === e.ownerId;
const removeStatuses = (b, e, keys) => {
  for (const buff of e.buffs.slice()) if (keys.includes(buff.status)) b.removeBuff(e, buff);
};
const strike = (b, e, u, amount, type = 'phys', tag = 'advancedAttack') => {
  if (u?.alive && e.alive) b.dealDamage(e, u, { amount, type, isAttack: true, canDodge: true, tags: ['enemyAbility', tag] });
};

function patriot(ab) {
  const P = { phase2: false, sacrificing: false, pulse: 0, spear: null };
  const aura = (b, e) => {
    for (const u of b.enemies) if (u.alive && sameField(e, u)) auraBuff(b, u, 'ab:patriotAura', 0.1,
      { atkPct: T(ab, 'strength.atk'), defFlat: T(ab, 'strength.def') });
  };
  const sacrifice = (b, e, dt) => {
    P.pulse += dt;
    const iv = T(ab, 'immo_trigger[rage].interval');
    while (P.pulse >= iv - 1e-9) {
      P.pulse -= iv;
      for (const u of areaAllies(b, e, e.x, e.y, 1.75)) if (!u.isFlying && sameField(e, u)) {
        hurt(b, e, u, e.s.atk * ab.sk['Immo[Rage]'].bb.atk_scale, 'true');
      }
    }
  };
  return [{
    spawn(b, e) {
      ab.immune = new Set(['sleep']); // PRTS/prefab immunity, absent from the database attribute block.
      e.profile.deferHit = true;
      b.addBuff(e, { key: 'ab:patriotShield', persist: true, mods: {
        atkPct: T(ab, 'shield.atk'), defPct: T(ab, 'shield.def'), resMul: 1 + T(ab, 'shield.magic_resistance'),
        taunt: T(ab, 'taunt.taunt_level'),
      } });
      aura(b, e);
    },
    iv: 0.1,
    tick(b, e, a, dt) {
      aura(b, e);
      if (P.phase2 || P.sacrificing) sacrifice(b, e, dt);
      if (P.spear && b.time >= P.spear.at - 1e-9) {
        strike(b, e, P.spear.target, e.s.atk * ab.sk['throwspear[Rage]'].bb.atk_scale, 'phys', 'patriotSpear');
        e.profile.noAttack = false; b.removeBuff(e, 'ab:patriotSpear');
        P.spear.ability.left = P.spear.ability.cd;
        P.spear = null;
      }
    },
    attack(c, b, e) {
      for (const u of c.targets) for (let i = 0; i < (P.phase2 ? 1 : 4) && u.alive; i++) strike(b, e, u, e.s.atk);
    },
  }, reborn({ dur: T(ab, 'reborn.duration'), invincible: T(ab, 'reborn.patrt_t_state_2[reborn_invincible].duration'),
    onKo() { P.sacrificing = true; P.pulse = 0; },
    onReborn(b, e) {
      P.phase2 = true; P.sacrificing = false; P.pulse = 0;
      b.removeBuff(e, 'ab:patriotShield');
      ab.immune = new Set(['sleep', 'stun', 'freeze', 'levitate']);
      removeStatuses(b, e, ['stun', 'freeze', 'levitate']);
      e.profile.melee = false; e.profile.canTarget = u => !u.isFlying;
      e.base.rangeRadius = 0.85;
      b.addBuff(e, { key: 'ab:patriotRage', persist: true, mods: {
        batPct: T(ab, 'immo_trigger[rage].base_attack_time') / e.base.bat,
        moveFlat: T(ab, 'immo_trigger[rage].move_speed'),
      } });
    },
  }), skill(ab.sk['throwspear[Rage]'], (b, e, ability) => {
    const list = targetsNear(b, e, 20).filter(u => !u.ground && !u.isFlying && sameField(e, u));
    list.sort((a, c) => hypot(c.x - e.x, c.y - e.y) - hypot(a.x - e.x, a.y - e.y) || aggroCmp(a, c));
    if (!list.length) return;
    P.spear = { target: list[0], at: b.time + 3, ability }; // PRTS: approximately 3 s wind-up.
    e.profile.noAttack = true;
    b.addBuff(e, { key: 'ab:patriotSpear', duration: 3.1, flags: { noMove: true } });
    b.fx('telegraph', { id: e.id, x: list[0].x, y: list[0].y, dur: 3, r: 0.5, kind: 'patriotSpear' });
  }, { cond: (b, e) => P.phase2 && !P.spear && targetsNear(b, e, 20).some(u => !u.ground && !u.isFlying && sameField(e, u)) })];
}

function cliff(ab) {
  const P = { phase2: false, hand: null };
  const hand = skill(ab.sk.MarkStunAttack_S1, (b, e) => {
    const target = byPriority(e, targetsNear(b, e, e.base.rangeRadius))[0];
    if (!target) return;
    const s = ab.sk[P.phase2 ? 'MarkStunAttack_S2' : 'MarkStunAttack_S1'];
    const area = areaAlliesInTiles(b, e, target.tileR, target.tileC, 'plus', 1);
    if (!area.includes(target)) area.push(target);
    for (const u of area) b.applyStatus(u, 'stun', { duration: s.bb.stun, source: e });
    // [ASSUMED] 0.2 s between hand hits; data defines count, but not the individual strike timestamps.
    P.hand = { target, left: P.phase2 ? 6 : 3, next: b.time, until: b.time + (P.phase2 ? 6 : 3) * 0.2 };
    e.profile.noAttack = true;
    b.addBuff(e, { key: 'ab:cliffHand', duration: 2, flags: { noMove: true, noDisplace: true } });
    b.fx('telegraph', { id: e.id, x: target.x, y: target.y, r: 1, tiles: 'plus', dur: 1.2, kind: 'cliffHand' });
  }, { cond: (b, e) => !P.hand && targetsNear(b, e, e.base.rangeRadius).length > 0 });
  return [{
    hitOut(c, b, e) {
      if (!c.dmg.isAttack) return;
      b.addBuff(c.target, { key: `ab:cliffDef:${e.id}`, duration: T(ab, 'reduce_def.duration'),
        refresh: 'independent', maxStacks: Number.MAX_SAFE_INTEGER, mods: { defFlat: T(ab, 'reduce_def.def') } });
    },
    tick(b, e) {
      if (!P.hand) return;
      const h = P.hand;
      while (h.left > 0 && b.time >= h.next - 1e-9) {
        strike(b, e, h.target, e.s.atk, 'phys', 'cliffHand'); h.left--; h.next += 0.2;
      }
      if (b.time < h.until - 1e-9) return;
      P.hand = null; e.profile.noAttack = false; b.removeBuff(e, 'ab:cliffHand');
      hand.left = hand.cd;
      if (P.phase2 && (!h.target.alive || !h.target.deployed)) {
        blinkForward(b, e, ab.sk.MarkStunAttack_S2.bb.dist); hand.left = 0;
      }
    },
  }, reborn({ dur: T(ab, 'reborn.duration'), invincible: T(ab, 'reborn.invincible_time'),
    onKo(b, e, a) { P.hand = null; a.noAtk = false; b.removeBuff(e, 'ab:cliffHand'); },
    onReborn(b, e) {
      P.phase2 = true;
      b.addBuff(e, { key: 'ab:cliff2', persist: true, mods: { atkPct: T(ab, 'reborn.atk'),
        aspd: T(ab, 'reborn.attack_speed'), defFlat: T(ab, 'reborn.def') } });
    },
  }), hand];
}

const hymn = ab => [{
  iv: 1,
  tick(b, e) {
    if (e.blockedBy) return;
    for (const u of fieldAllies(b, e)) if (sameField(e, u)) b.dealDamage(null, u,
      { amount: T(ab, 'poison.damage'), type: 'arts', canDodge: false, sourceless: true, tags: ['hymn'] });
  },
}];

function lastKnight(ab) {
  return [{
    taken(c, b, e) {
      const u = c.source;
      if (!(c.amount > 0) || !u?.alive || u.side !== 'ally') return;
      b.applyStatus(u, 'cold', { source: e, ignoreSelect: true,
        duration: T(ab, e.hpRatio < 0.5 ? 'InverseDamage.sydonq_t[freeze2].freeze' : 'InverseDamage.sydonq_t[freeze1].freeze') });
    },
    hitOut(c) { if (c.dmg.isAttack && c.target.s.flags.freeze) c.dmg.amount *= T(ab, 'DamageScaleToFrozen.atk_scale'); },
  }, reborn({ dur: T(ab, 'Reborn.duration'), hpRatio: T(ab, 'Reborn.hp_ratio'), invincible: 2,
    onReborn(b, e) {
      e.profile.noAttack = true;
      b.addBuff(e, { key: 'ab:knightCharge', persist: true, flags: { unblockable: true }, mods: { moveMul: 1 + T(ab, 'Slow.move_speed') } });
    },
  })];
}

function wood(ab) {
  const P = { crossed: new Set(), active: false };
  const cold = (b, e, dur) => {
    for (const u of areaAllies(b, e, e.x, e.y, T(ab, 'FreezeAura.range_radius'))) b.applyStatus(u, 'cold', { duration: dur, source: e });
  };
  const enter = (b, e, duration) => {
    const old = e.findBuff('ab:annihilation');
    if (old) { old.timeLeft += duration; old.duration += duration; return; }
    P.active = true;
    ab.immune = new Set([...(ab.immune || []), 'fear', 'bind', 'sluggish']);
    removeStatuses(b, e, ['fear']);
    e.mem.ignoredStatuses = new Set(['bind', 'sluggish']);
    e.mem.ignoreRouteWait = true;
    e.profile.noAttack = true; b._cutAttackStand(e);
    cold(b, e, T(ab, 'DemonBuff.freeze'));
    b.addBuff(e, { key: 'ab:annihilation', duration, visible: true,
      flags: { unblockable: true }, mods: { moveMul: 1 + T(ab, 'DemonBuff.move_speed'),
        physTakenMul: 1 - T(ab, 'DemonBuff.damage_resistance'), artsTakenMul: 1 - T(ab, 'DemonBuff.damage_resistance') },
      onExpire: ({ battle }) => {
        P.active = false;
        for (const s of ['fear', 'bind', 'sluggish']) ab.immune.delete(s);
        e.mem.ignoredStatuses = null; e.mem.ignoreRouteWait = false; e.markDirty(); e.profile.noAttack = false;
        cold(battle, e, T(ab, 'DemonBuff.freeze'));
        setForm(battle, e, 'normal', 'phase', { kind: 'annihilationEnd' });
      },
    });
    setForm(b, e, 'annihilation', 'phase', { kind: 'annihilation', dur: duration });
  };
  const thresholds = (b, e) => {
    let duration = 0;
    for (let i = 1; i <= 3; i++) if (!P.crossed.has(i) && e.hpRatio <= T(ab, `Demonize.enemy_smlead_hp_trigger_${i}.hp_ratio`) + 1e-9) {
      P.crossed.add(i); duration += T(ab, `Demonize.enemy_smlead_hp_trigger_${i}.duration`);
    }
    if (duration > 0 && e.hp > 0) enter(b, e, duration);
  };
  return [{
    taken(c, b, e) { thresholds(b, e); },
    tick(b, e) { thresholds(b, e); },
    dealt(c, b, e) { b.applyStatus(c.target, 'cold', { duration: T(ab, 'Attack.attack@freeze'), source: e }); },
    iv: 0,
  }, { iv: T(ab, 'FreezeAura.interval'), tick(b, e) { cold(b, e, T(ab, 'FreezeAura.freeze')); } }];
}

const caster = ab => [{
  spawn(b, e) { e.profile.maxTargets = 2; },
  dealt(c, b, e) { elem(b, e, c.target, 'apoptosis', e.s.atk * T(ab, '1.attack@ep_damage_ratio')); },
  death(c, b, e) {
    if (c.reason !== 'killed') return;
    b.after(7, () => {
      if (!b.finished && !b._endReq) spawnChildren(b, e, ab.tS['1.enemy_key'], 1, { countInTotal: false });
    }); // Deliberately does not hold the battle open and survives its owner's removal.
  },
}];

function steam(ab) {
  const P = { phase2: false, sp: 0, lost: 0, pending: false, guard: null, air: null, boost: false };
  const guard = (b, e, target) => {
    P.sp = 0;
    P.guard = { target, at: b.time + 4.5, until: b.time + ab.sk.Zantetsuken.bb.duration, fired: false };
    e.profile.noAttack = true;
    b.addBuff(e, { key: 'ab:steamGuard', duration: ab.sk.Zantetsuken.bb.duration, flags: { noMove: true } });
    b.fx('telegraph', { id: e.id, x: e.x, y: e.y, r: 1, dur: 4.5, kind: 'steamGuard' });
  };
  const boost = (b, e, permanent = false) => {
    P.boost = true; b.removeBuff(e, 'ab:steamWeak');
    removeStatuses(b, e, ['stun', 'freeze', 'disarm']);
    ab.immune = new Set(['stun', 'freeze', 'disarm']);
    const s = ab.sk.Boost;
    b.addBuff(e, { key: 'ab:steamBoost', ...(permanent ? { persist: true } : { duration: s.bb.boost_duration }), visible: true,
      mods: { moveMul: 1 + s.bb.move_speed, aspd: s.bb.attack_speed, dmgTakenMul: 1 - s.bb.damage_resistance },
      onExpire: ({ battle }) => {
        P.boost = false; ab.immune = null;
        battle.applyStatus(e, 'stun', { duration: s.bb.stun, source: e });
      },
    });
  };
  const fly = (b, e) => {
    P.pending = false; P.lost = 0;
    P.air = { markAt: b.time + 8, until: b.time + 13.5, next: b.time + 8, shots: 0, centers: null };
    e.profile.noAttack = true; b._cutAttackStand(e); b._unblock(e);
    b.addBuff(e, { key: 'ab:steamAir', duration: 13.5, flags: { invulnerable: true, untargetable: true,
      noMove: true, float: true, noDisplace: true, unblockable: true } });
    setForm(b, e, P.phase2 ? 'barrage2' : 'barrage', 'phase', { kind: 'steamBarrage', dur: 13.5 });
  };
  const re = reborn({ dur: T(ab, 'reborn.duration'), invincible: T(ab, 'reborn.stmkgt_t_state_2[reborn_invincible].duration'),
    onKo(b, e, a) {
      P.guard = null; P.air = null; P.pending = false; P.lost = 0; a.noAtk = false;
      b.removeBuff(e, 'ab:steamGuard'); b.removeBuff(e, 'ab:steamAir'); b.removeBuff(e, 'ab:steamBoost');
    },
    onReborn(b, e) {
      P.phase2 = true; P.sp = 0; boost(b, e, true);
      b.addBuff(e, { key: 'ab:steam2', persist: true, mods: { defFlat: T(ab, 'reborn.def'), resFlat: T(ab, 'reborn.magic_resistance') } });
      P.pending = true; // The next tick starts the barrage after reborn() has finished restoring HP/form.
    },
  });
  return [{
    spawn(b, e) { b.addBuff(e, { key: 'ab:steamWeak', persist: true,
      mods: { aspd: T(ab, 'BornWeak.attack_speed'), moveMul: 1 + T(ab, 'BornWeak.move_speed') } }); },
    taken(c, b, e) {
      if (re.state === 'reborn' || P.air || !(c.amount > 0)) return;
      P.lost += c.amount;
      if (P.lost >= e.s.maxHp * T(ab, P.phase2 ? 'TriggerHeroBomb_2.hp_ratio' : 'TriggerHeroBomb.hp_ratio') - 1e-9) P.pending = true;
    },
    before(c, b, e) {
      // 怒守 outranks an already queued 誓死 when both can start at this attack action.
      if (P.sp < ab.sk.Zantetsuken.sp || P.guard || P.air) return;
      guard(b, e, c.targets[0]);
      c.targets = [];
    },
    attack() { P.sp++; },
    tick(b, e) {
      if (re.state === 'reborn') return;
      if (P.guard) {
        const g = P.guard;
        if (!g.fired && b.time >= g.at - 1e-9) {
          g.fired = true;
          for (let i = 0; i < ab.sk.Zantetsuken.bb.times; i++) strike(b, e, g.target, e.s.atk * ab.sk.Zantetsuken.bb.atk_scale, 'phys', 'steamGuard');
        }
        if (b.time < g.until - 1e-9) return;
        P.guard = null; e.profile.noAttack = false; b.removeBuff(e, 'ab:steamGuard');
      }
      if (P.air) {
        const a = P.air;
        if (!a.centers && b.time >= a.markAt - 1e-9) {
          a.centers = fieldAllies(b, e).sort((u, v) => v.s.maxHp - u.s.maxHp || aggroCmp(u, v))
            .slice(0, P.phase2 ? 2 : 1).map(u => [u.tileR, u.tileC]);
          for (const [r, c] of a.centers) b.fx('zone', { id: e.id, x: c, y: r, r: 1, dur: 5.5, tiles: 'box', kind: 'steamBarrage' });
        }
        while (a.centers && a.shots < 8 && b.time >= a.next - 1e-9) {
          for (const [r, c] of a.centers) {
            const u = areaAlliesInTiles(b, e, r, c, 'box', 1).sort((u, v) => v.hpRatio - u.hpRatio || aggroCmp(u, v))[0];
            const s = ab.sk[P.phase2 ? 'HeroBomb[second_state]' : 'HeroBomb[first_state]'];
            strike(b, e, u, e.s.atk * s.bb.atk_scale, 'arts', 'steamBarrage');
          }
          a.shots++; a.next += 0.5;
        }
        if (b.time < a.until - 1e-9) return;
        P.air = null; e.profile.noAttack = false; b.removeBuff(e, 'ab:steamAir');
        if (e.route) e.route.pts = null; // remains over its legal launch tile, resumes the existing route.
        e.atkCd = 0;
        setForm(b, e, P.phase2 ? 'form2' : 'normal', 'phase', { kind: 'steamLanded' });
      }
      if (P.pending) fly(b, e);
    },
  }, re, skill(ab.sk.Boost, (b, e) => boost(b, e), { cond: (b, e) => !P.phase2 && !P.guard && !P.air && !P.pending && canCast(e, false, b) })];
}

export const ADVANCED_BOUNTY_KITS = Object.freeze({
  enemy_1506_patrt: patriot, enemy_1546_cliff: cliff, enemy_2013_csbot: hymn,
  enemy_2038_sydonq: lastKnight, enemy_2055_smlead: wood, enemy_2072_skdny2: caster,
  enemy_1533_stmkgt: steam,
  enemy_2073_skzrck: () => [{ spawn(b, e) {
    e.mem.nonPrimary = true; e.mem.noLeak = true; e.profile.noAttack = true;
    b.addBuff(e, { key: 'ab:weepingThorn', persist: true, flags: { selfBound: true, noMove: true,
      noDisplace: true, noHeal: true, unblockable: true } });
  } }],
});
