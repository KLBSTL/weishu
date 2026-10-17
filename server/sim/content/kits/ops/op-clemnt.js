// 克莱门莎: official character/skill blackboards, all three skills. Extra timings/areas absent from the tables are
// [ASSUMED]: pod pickup checks use a 1.1-square centre test; unsupported event-map terrain uses ground passability.
// Sources: local official Excel tables; PRTS 克莱门莎 (front half-plane, burst marks and in-flight tile exclusion).
import { num, skillRec, talentBb, up } from '../shared/tier1.js';
import { dirVec } from '../../../dir.js';
import { canTargetEnemy } from '../../../targeting.js';
import { hypot } from '../../../detmath.js';

const S1='skchr_clemnt_1', S2='skchr_clemnt_2', S3='skchr_clemnt_3';
const GROUND={canHitFly:false,groundOnly:true};
const state=u=>u.mem.clemnt ??= {marks:new Map(),flights:new Set(),pod:null};
const element=(b,u,e,n)=>{if(e?.alive && n>0)b.dealDamage(u,e,{type:'element',element:'erosion',amount:n,tags:['skill','clemnt']});};
const physical=(b,u,e,n)=>b.dealDamage(u,e,{type:'phys',amount:n,isSkill:true,tags:['skill','clemnt']});
const tile=e=>`${Math.round(e.y)},${Math.round(e.x)}`;

export default {
  char_4231_clemnt:(bb,chess)=>{
    const t0=talentBb(chess,0),t1=talentBb(chess,1);
    const rec=id=>skillRec(chess,id), b1=rec(S1)?.bb ?? {}, b2=rec(S2)?.bb ?? {}, b3=rec(S3)?.bb ?? {};
    const epHit=ratio=>({battle,unit,target,dealt})=>element(battle,unit,target,Math.max(0,dealt)*ratio);
    const castPod=({battle:b,unit:u,skill})=>{
      const [dr,dc]=dirVec(u.dir);
      state(u).pod={x:u.x,y:u.y,dr,dc,travel:0,passengers:[],mass:0,acc:0,activation:skill.activations};
      b.addBuff(u,{key:'clemnt:pod:disarm',duration:10,flags:{disarm:true}});
      b.fx('summon',{x:u.x,y:u.y,id:u.id,kind:'clemnt:pod'});
    };
    const podTick=({battle:b,unit:u,skill,dt})=>{
      const p=state(u).pod;
      if(!p || p.activation!==skill.activations)return;
      const moving=p.travel<3;
      if(moving){
        for(const e of b.foesInRadius(p.x,p.y,1.1)){
          if(Math.abs(e.x-p.x)>.55 || Math.abs(e.y-p.y)>.55 || e.isBoss || e.s.flags.selfBound || e.s.flags.noDisplace || e.def?.raw?.otherImmunities?.includes('teleport')
            || e.isFlying || !canTargetEnemy(u,e,GROUND) || p.passengers.includes(e) || p.passengers.length>=num(b2['attack@max_passenger_cnt'],15))continue;
          const mass=Math.max(0,e.s.massLevel ?? e.base.massLevel ?? 0);
          if(p.mass+mass>num(b2['attack@max_passenger_mass'],8))continue;
          p.passengers.push(e);p.mass+=mass;
          b.addBuff(e,{key:'clemnt:banish:'+u.id,flags:{invulnerable:true,unblockable:true,noMove:true,disarm:true},source:u});
        }
        const step=Math.min(2*dt,3-p.travel);
        const r=Math.round(p.y+p.dr*step),c=Math.round(p.x+p.dc*step);
        if(b.grid.groundPassable(r,c)){
          p.x+=p.dc*step;p.y+=p.dr*step;p.travel+=step;
          for(const e of p.passengers)if(e.alive){
            const dx=p.x-e.x,dy=p.y-e.y,d=hypot(dx,dy);
            if(d>0)b.displace(e,{x:dx,y:dy},d,{dur:dt});
          }
        }else p.travel=3;
        if(p.travel>=3){
          b.removeBuff(u,'clemnt:pod:disarm');
          for(const e of p.passengers)b.removeBuff(e,'clemnt:banish:'+u.id);
          b.fx('zone',{x:p.x,y:p.y,r:1.5,dur:Math.max(0,skill.timeLeft),kind:'clemnt:vortex'});
        }
      }
      if(p.travel<3)return;
      p.acc+=dt;
      const pulse=p.acc>=1-1e-9;if(pulse)p.acc-=1;
      for(const e of b.foesInRadius(p.x,p.y,1.5).filter(e=>canTargetEnemy(u,e,{canHitFly:true}))){
        b.addBuff(e,{key:'clemnt:vortex:'+u.id,duration:.1,mods:{moveMul:1+num(b2['attack@move_speed'],-.7)},source:u});
        if(pulse){physical(b,u,e,u.s.atk*u.s.atkScaleMul*num(b2['attack@physical_atk_scale']));element(b,u,e,num(b2['attack@water_element'],200));}
      }
    };
    const bombard=({battle:b,unit:u,skill})=>{
      if(!up(u) || !u.canAct || skill.ammoLeft<=0)return;
      const st=state(u);
      for(const [e,until] of st.marks)if(!e.alive || b.time>=until)st.marks.delete(e);
      const ready=[...st.marks.keys()].filter(e=>!st.flights.has(tile(e)) && canTargetEnemy(u,e,GROUND));
      ready.sort((a,z)=>(a.x-u.x)*(a.x-u.x)+(a.y-u.y)*(a.y-u.y)-(z.x-u.x)*(z.x-u.x)-(z.y-u.y)*(z.y-u.y)||a.spawnSeq-z.spawnSeq);
      const e=ready[0];if(!e)return;
      const key=tile(e),r=Math.round(e.y),c=Math.round(e.x),atk=u.s.atk*u.s.atkScaleMul;
      for(const marked of st.marks.keys())if(!marked.alive || tile(marked)===key)st.marks.delete(marked);
      st.flights.add(key);skill.ammoLeft--;
      b.emit('ammoUsed',{unit:u,left:skill.ammoLeft,skill});
      b.fx('telegraph',{x:c,y:r,r:1,dur:3.5,kind:'clemnt:bombard'});
      b.after(3.5,()=>st.flights.delete(key));
        for(let i=1;i<=3;i++)b.after(i,()=>{
          b.fx('explode',{x:c,y:r,r:1,kind:'clemnt:bombard'});
          for(const target of b.enemies){
            if(!target.alive || target.isFlying || Math.abs(Math.round(target.y)-r)+Math.abs(Math.round(target.x)-c)>1 || !canTargetEnemy(u,target,GROUND))continue;
            physical(b,u,target,atk*num(b3.s3_atk_scale));
            if(target.alive)b.dealDamage(u,target,{type:'elemental',amount:atk*num(b3.ep_damage_scale),isSkill:true,tags:['skill','clemnt:bombard']});
          }
        });
      if(skill.ammoLeft<=0)skill.end('ammo');
    };
    return {
      skills:{
        [S1]:{kind:'instant',attack:{atkScale:num(b1.atk_scale,1),onEachHit:epHit(num(b1.ep_damage_ratio))}},
        [S2]:{kind:'duration',mods:{aspd:num(b2.attack_speed)},targeting:{rangeGrid:rec(S2)?.rangeGrid},
          attack:{atkScale:num(b2['attack@aoe_atk_scale'],1),onEachHit({battle:b,unit:u,target,kind}){
            if(kind!=='main' || !target)return;
            const list=b.foesInRadius(target.x,target.y,1.1).filter(e=>e!==target && !e.isFlying && canTargetEnemy(u,e,GROUND));
            for(const e of list.slice(0,Math.max(0,num(b2['attack@max_target'],5)-1)))physical(b,u,e,u.s.atk*u.s.atkScaleMul);
          }},onStart:castPod,onTick:podTick,onEnd({battle,unit}){
            for(const e of state(unit).pod?.passengers ?? [])battle.removeBuff(e,'clemnt:banish:'+unit.id);
            battle.removeBuff(unit,'clemnt:pod:disarm');state(unit).pod=null;
          }},
        [S3]:{kind:'ammo',ammo:num(b3.trigger_time,10),targeting:{maxTargets:num(b3['attack@max_target'],3),rangeGrid:rec(S3)?.rangeGrid},
          attack:{atkScale:num(b3['attack@atk_scale'],1),onEachHit:epHit(num(b3['attack@ep_damage_ratio']))},
          onAttack(c){c.noAmmo=true;},onStart({unit}){state(unit).marks.clear();},onTick:bombard},
      },
      install(b,u){
        b.on('hit',c=>{
          if(c.source===u && c.target?.side==='enemy' && c.dmg.type==='phys'){
            const chance=c.target.s.def<c.target.base.def?num(t0.prob_special):num(t0.prob_normal);
            if(b.rng()<chance)c.dmg.amount*=num(t0.t1_atk_scale,1);
          }
          if(c.target===u && c.source && ['phys','arts'].includes(c.dmg.type)){
            const [dr,dc]=dirVec(u.dir);
            if((Math.round(c.source.x)-u.tileC)*dc+(Math.round(c.source.y)-u.tileR)*dr>=0){
              const sea=c.source.def?.raw?.tags?.includes('seamonster');
              c.dmg.mul*=1-num(sea?t1.damage_resistance_seamonster:t1.damage_resistance_normal);
            }
          }
        },{owner:u});
        b.on('elementBurst',c=>{
          if(c.element==='erosion' && c.target?.side==='enemy' && up(u) && u.skill?.id===S3 && u.skill.active)state(u).marks.set(c.target,b.time+num(b3['attack@ep_break_duration'],1));
        },{owner:u});
      },
    };
  },
};
