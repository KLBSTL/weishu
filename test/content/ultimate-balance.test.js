import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,chessRec} from '../helpers/battleHarness.js';
import * as enemies from '../../server/sim/content/enemies.js';
import {spawnChildren} from '../../server/sim/content/enemies/helpers.js';
import {battleProgress,uniteLeft,compactResult} from '../../server/sim/spec.js';
import {freeFireball} from '../../shared/ultimateBalance.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const wall=chessRec({id:'wall',stats:{maxHp:1e8,atk:0,def:0,res:0,blockCnt:3},skill:null});
const arena=(opts={})=>makeBattle({content:'generic',extraContent:[enemies],modeId:'mode_single_abyss',round:6,
  defs:{chess:{wall}},kits:{wall:()=>({trait:{noAttack:true}})},units:[{chessId:'wall',row:10,col:6}],
  autoFinish:false,captureNoisy:true,hooks:['damaged'],...opts}).step();
const mods=(type,round=6)=>({atkMul:2,hpMul:3,speedMul:0,ultimateType:type,ultimateRound:round});
for(const modeId of ['mode_single_abyss','mode_multi_abyss','mode_single_catastrophe','mode_multi_catastrophe']){
  test(`${modeId}: firepower attack and ghost initial/max HP scale once, base records remain original`,()=>{
    const h=arena({modeId}), m=mods('FIREPOWER');
    for(const key of ['enemy_1024_mortar','enemy_1143_merrpg_2','enemy_1256_lyacpa','enemy_1184_cadkgt']){
      const e=h.spawn(key,{pos:[12,10],mods:m});near(e.s.atk,e.def.atk*2*.9);assert.equal(e.mods.atkMul,2);
    }
    for(const key of ['enemy_1008_ghost','enemy_1026_aghost']){
      const e=h.spawn(key,{pos:[12,10],mods:mods('BREAKTHROUGH')});near(e.hp,e.def.maxHp*3*.8);near(e.s.maxHp,e.hp);
      near(e.s.atk,e.def.atk*2);assert.ok(e.s.flags.unblockable);
    }
    assert.deepEqual(h.b.errors,[]);
  });
}
test('scope excludes other types, untagged bounties, easy modes and R14/15',()=>{
  for(const opts of [{},{modeId:'mode_single_hard'},{round:14},{round:15,kind:'hidden'}]){
    const h=arena(opts),e=h.spawn('enemy_1143_merrpg',{pos:[12,10],mods:opts.modeId||opts.round?mods('FIREPOWER',opts.round??6):{atkMul:2}});
    near(e.s.atk,e.def.atk*2);
    const ghost=h.spawn('enemy_1008_ghost',{pos:[12,10],mods:mods('SUMMON')});near(ghost.s.maxHp,ghost.def.maxHp*3);
  }
});
for(const [caster,ball,atk]of [['enemy_1176_dusocr','enemy_1177_dufrbl',500],['enemy_1176_dusocr_2','enemy_1177_dufrbl_2',600]]){
  test(`${ball}: inherited firepower applies once, still deals Arts/burn and leaks for zero LP`,()=>{
    const h=arena(),parent=h.spawn(caster,{pos:[12,10],mods:mods('FIREPOWER')});
    const [child]=spawnChildren(h.b,parent,ball,1,{pos:[10,6.5]});
    near(child.s.atk,atk*2*.9);assert.equal(child.lpr,0);
    h.run(.1);assert.ok(h.hooksOf('damaged').some(c=>c.source===child&&c.type==='arts'&&Math.abs(c.amount-atk*2*.9)<1e-6));
    assert.ok(h.unit('wall').elem.burn>0);
    const [leaker]=spawnChildren(h.b,parent,ball,1,{pos:[12,9]});h.b.leak(leaker);
    assert.equal(h.b._perPlayer.p1.leaked[0].lpr,0);assert.equal(battleProgress(h.b).leaks,0);
    assert.equal(parent.lpr,parent.def.lpr);assert.deepEqual(h.b.errors,[]);
  });
}
test('firepower RPG still deals 200% grenade then 100% melee after the attack reduction',()=>{
  const h=arena(),e=h.spawn('enemy_1143_merrpg',{pos:[10,6.5],mods:mods('FIREPOWER')});
  const hits=()=>h.hooksOf('damaged').filter(c=>c.source===e&&c.dmg.isAttack);
  assert.ok(h.runUntil(()=>hits().length>=2,10));assert.deepEqual(hits().map(c=>c.amount),[1800,900]);
});
test('free fireballs remain free through pending, timeout, compacted and finished unite results',()=>{
  const m=mods('FIREPOWER'),key='enemy_1177_dufrbl';
  const h=arena({kind:'unite',timeLimit:1,enemies:[{key,time:5,route:0,mods:m,sourcePlayerId:'p1'}]});
  assert.deepEqual(uniteLeft(h.b),{});h.runToEnd(2);
  const r=compactResult(h.result());assert.ok(freeFireball(key,r.unspawned[0].mods));assert.deepEqual(uniteLeft(h.b),{});
});
