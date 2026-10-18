// Official enemy_database blackboards; user-approved ultimate composition (docs/ultimate-three-enemies-draft.md).
import { T, hurt, elem, areaAllies, areaAlliesInTiles, spawnChildren, targetsNear, unbalancedNow } from './helpers.js';
import { unblockable, blockWeight, splashAttack, skill, deathSpawn } from './archetypes.js';
import { FLY_KITS } from './fly.js';
import { hypot } from '../../detmath.js';

const mortar = () => [splashAttack({ unblocked: false, tiles: 1, noAir: true })];
const rpg = ab => [{
  before(c,b,e,a) { e.profile.atkScale = a.fired ? 1 : (T(ab,'Combat.attack@atk_scale') ?? 2); },
  hitOut(c,b,e,a) {
    if (a.fired || !c.dmg.isAttack) return;
    a.fired = true;
    for (const u of areaAlliesInTiles(b,e,c.target.tileR,c.target.tileC,'box',1)) {
      if (u !== c.target && !u.isFlying) hurt(b,e,u,e.s.atk*(T(ab,'Combat.attack@atk_scale') ?? 2),'phys');
    }
    e.profile.attack = 'melee'; e.profile.rangeRadius = 0; e.base.rangeRadius = 0;
    b.addBuff(e,{key:'ab:rpg:run',mods:{moveMul:1+(T(ab,'MoveSpeedUp.move_speed') ?? 2)},persist:true});
  },
}];
const armor = ab => [{
  spawn(b,e) { e.profile.maxTargets = 4; },
  before(c,b,e) { e.profile.atkScale = e.blockedBy ? 1 : (T(ab,'Passive.attack@ranged.atk_scale') ?? .5); },
}];
const knight = ab => [skill(ab.sk.ChargeAttack,(b,e) => {
  const s = ab.sk.ChargeAttack, target = targetsNear(b,e,e.base.rangeRadius)[0];
  if (!target) return;
  const duration = s.bb.duration ?? 7;
  b.addBuff(e,{key:'ab:knight:charge',duration,flags:{noMove:true,disarm:true}});
  b.fx('telegraph',{x:target.x,y:target.y,r:s.bb.range_radius ?? 2.2,dur:duration,kind:'arts'});
  b.after(duration,() => {
    if (!e.alive || unbalancedNow(b,e) || e.s.flags.stun || e.s.flags.freeze || e.s.flags.sleep || !target.alive) return;
    for (const u of areaAllies(b,e,target.x,target.y,s.bb.range_radius ?? 2.2)) hurt(b,e,u,e.s.atk*(s.bb.atk_scale ?? 2.5),'arts');
  });
},{cond:(b,e)=>targetsNear(b,e,e.base.rangeRadius).length>0})];
const caster = ab => ['SummonFireBall','SummonFireBall2'].map((id,i) => skill(ab.sk[id],(b,e) => {
  spawnChildren(b,e,ab.sk[id].bs.enemy_key,ab.sk[id].bb.cnt ?? 1);
},{cond:(b,e)=>!!e.blockedBy === !!i}));
const flame = ab => [{
  spawn(b,e,a) {
    a.x=e.x; a.y=e.y;
    e.profile.noAttack=true;
    b.addBuff(e,{key:'ab:flame',flags:{unblockable:true,invulnerable:true,untargetable:true},persist:true});
  },
  tick(b,e,a) {
    const travelled=hypot(e.x-a.x,e.y-a.y);
    // Official Weaken blackboard: gradual 70% loss over 10 seconds [ASSUMED linear distance at base movement].
    const weaken=Math.min(1,travelled/Math.max(.01,e.base.moveSpeed*(T(ab,'Weaken.duration') ?? 10)));
    const scale=1+(T(ab,'Weaken.atk') ?? -.7)*weaken;
    if (!b.alliesInRadius(e.x,e.y,.6).some(u=>u.alive && u.ground && !u.isFlying && !u.s.flags.liftoff)) return;
    for (const u of areaAllies(b,e,e.x,e.y,e.def.raw.stats.rawRangeRadius || 1.8)) {
      hurt(b,e,u,e.s.atk*scale,'arts'); elem(b,e,u,'burn',e.s.atk*scale*(T(ab,'epdamage.attack@ep_damage_ratio') ?? 1));
    }
    b.fx('explode',{x:e.x,y:e.y,r:1.8,kind:'fire'}); b.kill(e,null);
  },
}];
const witch = ab => [{
  iv:1,
  tick(b,e) { b.loseHp(e,T(ab,'periodic_damage.damage') ?? 400,{source:e}); },
  death(c,b,e) {
    if(c.reason!=='killed') return;
    // No gramophones in the mode. Radius 1.5 [ASSUMED] where the official blackboard has no area value.
    const damage=e.s.atk*(T(ab,'boom.atk_scale') ?? 2);
    for(const u of areaAllies(b,e,e.x,e.y,1.5))hurt(b,e,u,damage,'arts');
    for(const u of b.foesInRadius(e.x,e.y,1.5))if(u!==e)hurt(b,e,u,damage,'arts',{ignoreSelect:true});
    b.fx('explode',{x:e.x,y:e.y,r:1.5,kind:'arts'});
  },
}];
const shell = ab => [{
  taken(c,b,e,a) {
    if(b.time < (a.ready ?? 0))return;
    a.ready=b.time+(T(ab,'SpeedUp.cooldown') ?? 5);
    b.addBuff(e,{key:'ab:shell:run',duration:T(ab,'SpeedUp.duration') ?? 2,mods:{moveMul:1+(T(ab,'SpeedUp.move_speed') ?? 3)}});
  },
}];
const boar = ab => [blockWeight(2),{
  spawn(b,e,a) { a.started=b.time; a.x=e.x; a.y=e.y; a.stacks=0; a.touch=new Set(); },
  blocked(c,b,e,a) { if(a.stacks)a.impact=e.s.moveSpeed; },
  iv:.333,
  tick(b,e,a) {
    if(e.blockedBy) { a.stacks=0; a.started=b.time; a.touch.clear(); }
    else if(b.time-a.started >= (T(ab,'Rush.mhboar_t_predelay.predelay') ?? 5)) {
      a.stacks=Math.min(T(ab,'Rush.mhboar_t[trigger].trig_cnt') ?? 30,a.stacks+1);
    }
    const bonus=a.stacks*(T(ab,'Rush.mhboar_t[trigger].move_speed') ?? .333);
    b.addBuff(e,{key:'ab:boar:rush',mods:{moveMul:1+bonus}});
    if(!e.blockedBy && a.stacks)for(const u of areaAllies(b,e,e.x,e.y,.7)) {
      if(a.touch.has(u.id))continue;
      a.touch.add(u.id); hurt(b,e,u,(T(ab,'Crash.atk_scale') ?? 700)*e.s.moveSpeed,'phys');
    }
  },
  before(c,b,e,a) {
    if(a.impact && e.blockedBy) {
      // First collision uses the pre-reset charge speed; ordinary attacks keep their base ATK afterwards.
      e.profile.atkScale=Math.max(1,(T(ab,'FirstAttack.atk_scale') ?? 500)*a.impact/Math.max(1,e.s.atk));
      a.impact=0;
      a.stacks=0; b.removeBuff(e,'ab:boar:rush');
    } else e.profile.atkScale=1;
  },
}];
const splitting = ab => [{...deathSpawn(ab.tS['deathrattle.enemy_key'],T(ab,'deathrattle.cnt') ?? 0),sil:true}];
const giant = ab => [...splitting(ab),skill(ab.sk.SummonToken,(b,e)=>spawnChildren(b,e,ab.sk.SummonToken.bs.enemy_key,ab.sk.SummonToken.bb.cnt ?? 1),{sil:true})];
const tumor = ab => [{
  iv:.1,
  tick(b,e) {
    if(e.blockedBy)b.addBuff(e.blockedBy,{key:'ab:tumor',duration:.15,mods:{aspdFinalMul:1+(T(ab,'atkSpeedDown.attack_speed') ?? -.8)},source:e});
  },
}];
const captain = ab => [skill(ab.sk.SummonSailor,(b,e)=>spawnChildren(b,e,ab.sk.SummonSailor.bs.enemy_key,ab.sk.SummonSailor.bb.cnt ?? 2)),{
  before(c,b,e) { e.profile.atkScale=e.blockedBy ? (T(ab,'1.attack@combat_atk_scale') ?? 3) : 1; },
}];
const sailor = ab => [{
  dealt(c,b,e) {
    const captainKey=e.defId.endsWith('_2')?'enemy_10049_pcaptn_2':'enemy_10049_pcaptn';
    if(c.dmg.isAttack && b.enemies.some(u=>u.alive && u.defId===captainKey))elem(b,e,c.target,'erosion',e.s.atk*(T(ab,'1.attack@ep_damage_ratio') ?? .3));
  },
}];

export const ULTIMATE_KITS = Object.freeze({
  enemy_1024_mortar:mortar, enemy_1024_mortar_2:mortar,
  enemy_1143_merrpg:rpg, enemy_1143_merrpg_2:rpg,
  enemy_1184_cadkgt:knight, enemy_1184_cadkgt_2:knight,
  enemy_1256_lyacpa:armor, enemy_1256_lyacpa_2:armor,
  enemy_1176_dusocr:caster, enemy_1176_dusocr_2:caster,
  enemy_1177_dufrbl:flame, enemy_1177_dufrbl_2:flame,
  enemy_1008_ghost:()=>[unblockable()],
  enemy_1058_traink:()=>[blockWeight(3)], enemy_1058_traink_2:()=>[blockWeight(3)],
  enemy_1111_ucommd:()=>[blockWeight(2)], enemy_1111_ucommd_2:()=>[blockWeight(2)],
  enemy_1089_ltlntc:witch, enemy_1089_ltlntc_2:witch,
  enemy_2043_smsbr:shell, enemy_1309_mhboar:boar, enemy_1309_mhboar_2:boar,
  enemy_1130_infstr:splitting, enemy_1132_sarchn:splitting, enemy_1132_sarchn_2:splitting,
  enemy_1133_harchn:giant, enemy_1133_harchn_2:giant, enemy_1138_tumor:tumor,
  enemy_10049_pcaptn:captain, enemy_10049_pcaptn_2:captain, enemy_10043_sailor:sailor, enemy_10043_sailor_2:sailor,
  enemy_1321_wdarft_2:ab=>[skill(ab.sk.BornBugs,(b,e)=>spawnChildren(b,e,'enemy_1269_nhfly_2',3))],
  enemy_1269_nhfly_2:FLY_KITS.enemy_1269_nhfly,
});
