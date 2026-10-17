import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle,chessRec,checkInvariants } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';

const wall=chessRec({id:'wall',stats:{maxHp:1e8,atk:0,def:0,res:0,blockCnt:10},skill:null});
const arena=()=>makeBattle({content:'generic',extraContent:[enemiesMod],defs:{chess:{wall}},
  kits:{wall:()=>({trait:{noAttack:true}})},units:[{chessId:'wall',uid:1,row:10,col:6}],
  autoFinish:false,timeLimit:180,captureNoisy:true,hooks:['damaged','death','enemySpawn']}).step();
const put=(h,key,pos=[10,6.5])=>h.spawn(key,{pos,routeIndex:0,mods:{speedMul:0}});
const done=h=>{assert.deepEqual(h.b.errors,[]);checkInvariants(h.b);};

test('split mothers produce the official child counts; silence disables both death and periodic summoning',()=>{
  for(const [key,n,child] of [['enemy_1130_infstr',2,'enemy_1137_plasm'],['enemy_1132_sarchn_2',3,'enemy_1138_tumor'],['enemy_1133_harchn',4,'enemy_1137_plasm']]){
    for(const sil of [false,true]){
      const h=arena(),e=put(h,key);if(sil)h.b.applyStatus(e,'silence',{duration:100});
      h.b.kill(e,null);h.run(1);
      assert.equal(h.enemies().filter(e=>e.defId===child).length,sil?0:n);done(h);
    }
  }
});
test('continuous mothers really summon, keeping inherited round mods and safe routes',()=>{
  for(const [key,child,n,wait] of [['enemy_1133_harchn', 'enemy_1137_plasm',1,5.2],['enemy_10049_pcaptn_2','enemy_10043_sailor_2',2,10.2],['enemy_1321_wdarft_2','enemy_1269_nhfly_2',3,10.2]]){
    const h=arena(),e=put(h,key,[12,10]);h.run(wait);
    const children=h.enemies().filter(x=>x.defId===child);assert.equal(children.length,n,key);
    for(const child of children)assert.equal(child.mods.speedMul,e.mods.speedMul);
    done(h);
  }
});
test('sailors gain erosion only while their matching captain is alive; tumor attack-speed debuff is non-stacking',()=>{
  const h=arena(),s=put(h,'enemy_10043_sailor');h.run(3);
  assert.equal(h.unit(1).elem.erosion,0);
  const c=put(h,'enemy_10049_pcaptn',[12,10]);h.run(6);
  assert.ok(h.unit(1).elem.erosion>0);
  h.b.kill(c,null);put(h,'enemy_1138_tumor',[10,6.1]);put(h,'enemy_1138_tumor',[10,6.1]);h.run(1);
  assert.equal(h.unit(1).s.aspd,20);done(h);
});
test('blood witch loses HP and explodes with arts damage on death; shell briefly accelerates on damage',()=>{
  const h=arena(),w=put(h,'enemy_1089_ltlntc');const initial=w.hp;h.run(1.1);assert.ok(w.hp<initial);
  const hp=h.unit(1).hp;h.b.kill(w,null);assert.ok(h.unit(1).hp<hp);
  const s=h.spawn('enemy_2043_smsbr',{pos:[12,8],routeIndex:1});const speed=s.s.moveSpeed;
  h.b.dealDamage(h.unit(1),s,{amount:1,type:'true'});assert.ok(s.s.moveSpeed>speed);h.run(2.2);assert.equal(s.s.moveSpeed,speed);done(h);
});
test('ghosts and heavy breakthrough units enforce their block rules, while wood warriors stay ordinary melee',()=>{
  for(const [key,weight,ghost] of [['enemy_1008_ghost',1,true],['enemy_1058_traink',3,false],['enemy_1111_ucommd_2',2,false],['enemy_1309_mhboar',2,false],['enemy_2046_smwar',1,false]]){
    const h=arena(),e=put(h,key);assert.equal(!!e.s.flags.unblockable,ghost);assert.equal(e.blockWeight ?? 1,weight);done(h);
  }
});
test('firepower signatures run without errors: splash, one-shot RPG, four-target armor, charge, and flame summons',()=>{
  for(const key of ['enemy_1024_mortar','enemy_1143_merrpg','enemy_1256_lyacpa','enemy_1184_cadkgt','enemy_1176_dusocr']){
    const h=arena(),e=put(h,key);h.run(34);
    if(key==='enemy_1256_lyacpa')assert.equal(e.profile.maxTargets,4);
    if(key==='enemy_1143_merrpg')assert.equal(e.profile.attack,'melee');
    if(key==='enemy_1176_dusocr')assert.ok(h.hooksOf('enemySpawn').some(x=>x.enemy.defId==='enemy_1177_dufrbl'));
    else assert.ok(h.unit(1).hp<h.unit(1).s.maxHp,key);
    done(h);
  }
});
