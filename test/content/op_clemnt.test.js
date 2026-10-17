import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle,enemyRec,checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS } from '../../server/sim/content/kits/index.js';
import { diyPool } from '../../shared/diy.js';
const load=name=>JSON.parse(fs.readFileSync(new URL(`../../data/${name}.json`,import.meta.url),'utf8'));
const backups=load('backups'),data={backups,chess:load('chess')};
function field(skill=0,elite=true,tier=6){
  const h=makeBattle({autoFinish:false,timeLimit:300,captureNoisy:true,hooks:['damaged','elementBurst','ammoUsed','skillStart'],
    defs:{enemies:{dummy:enemyRec({key:'dummy',hp:1e9,atk:0,speed:0,def:0,mass:0})}},
    units:[{uid:1,diy:{slot:`chess_char_${tier}_diy1_a`,charId:'char_4231_clemnt',skillIndex:skill,uniEquipId:null},elite,row:10,col:5}]});
  h.step();return {h,u:h.unit(1)};
}
const done=h=>{assert.deepEqual(h.b.errors,[]);checkInvariants(h.b);};
test('three user-selected operators are legal outside-match picks with exactly their requested bonds',()=>{
  for(const [id,bonds] of [['char_4132_ascln',['emptyShip']],['char_4037_demetr',['siracusaShip']],['char_4231_clemnt',['emptyShip']]]){
    assert.deepEqual(backups.diy.operators[id].bonds,bonds);
    for(const tier of [5,6])assert.ok(diyPool(tier,{data,kitted:KITTED_CHARS}).includes(id));
    assert.ok(!Object.values(data.chess).some(c=>!c.isDiy && c.charId===id && c.visible));
  }
});
for(const tier of [5,6])for(const elite of [false,true])for(const skill of [0,1,2]){
  test(`Clement real DIY T${tier} elite=${elite} S${skill+1} has an authored skill and deals damage`,()=>{
    const {h,u}=field(skill,elite,tier);h.spawn('dummy',{pos:[10,6],mods:{speedMul:0}});
    assert.equal(!!u.kit.generic,false);assert.equal(u.skill.id,`skchr_clemnt_${skill+1}`);
    h.run(55);assert.ok(h.hooksOf('damaged').some(c=>c.source===u && c.type==='phys' && c.amount>0));
    assert.ok(h.hooksOf('skillStart').some(c=>c.unit===u));done(h);
  });
}
test('Clement S1 gains erosion from actual physical HP damage; S3 ammo is spent by global erosion bursts, not normal attacks',()=>{
  {
    const {h}=field(0);const e=h.spawn('dummy',{pos:[10,6],mods:{speedMul:0}});h.run(7);assert.ok(e.elem.erosion>0);done(h);
  }
  {
    const {h,u}=field(2);const e=h.spawn('dummy',{pos:[10,6],mods:{speedMul:0}});
    u.skill.sp=u.skill.spCost;h.runUntil(()=>u.skill.active,1);const full=u.skill.ammoLeft;
    h.run(.8);assert.equal(u.skill.ammoLeft,full);
    h.b.dealDamage(null,e,{type:'element',element:'erosion',amount:1000});h.run(.1);
    assert.equal(u.skill.ammoLeft,full-1);h.run(5.5);
    assert.ok(h.hooksOf('damaged').some(c=>c.source===u && c.type==='elemental'));
    done(h);
  }
});
test('Clement front mitigation respects facing and damage type',()=>{
  const {h,u}=field(0),front=h.spawn('dummy',{pos:[10,7]}),back=h.spawn('dummy',{pos:[10,3]});
  const f=h.b.dealDamage(front,u,{type:'arts',amount:100});const z=h.b.dealDamage(back,u,{type:'arts',amount:100});
  assert.ok(f<z);done(h);
});
