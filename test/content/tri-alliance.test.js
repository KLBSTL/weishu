import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { makeMatch, DATA } from '../match/harness.js';
import { shieldLayers } from '../../server/sim/content/bonds/sarkaz.js';
import { numericShieldTotal } from '../../server/sim/buffs.js';
import { validateDiyPicks } from '../../shared/diy.js';
import { KITS } from '../../server/sim/content/kits/index.js';
import { installAegirTraits } from '../../server/sim/content/garrisons/aegir.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`expected ${b}, got ${a}`);
const state=(count,layers=0,thresholds=[3,6])=>({count,layers,active:count>=thresholds[0],tier:thresholds.filter(t=>count>=t).length});
const rec=(id,bonds=['egirShip'],g=[],extra={})=>({...chessRec({id,bonds,skill:null,stats:{atk:1000,maxHp:1000000,def:0},...extra}),garrisonIds:g});
const enemy=enemyRec({key:'dummy',hp:1e8,def:0,res:0,speed:0});
function field(records,bonds={},more={}){
  const chess=Object.fromEntries(records.map(c=>[c.chessId,c]));
  const h=makeBattle({defs:{chess,enemies:{dummy:enemy}},units:records.map((c,i)=>({chessId:c.chessId,row:10,col:2+i,dir:'UP'})),
    bonds,autoFinish:false,timeLimit:300,...more});h.step();return h;
}
const trait=(code,form='b')=>`garrison_aegir_${code}_${form}`;

test('A/B/C: current expanded range, caster dedup, tokens/non-members, teammate/bench exclusion, shield order and bypasses',()=>{
  const caster=rec('caster',['sarkazShip'],[],{rangeGrid:[[0,0]],skill:{duration:100,spCost:999}});
  const h=field([caster,rec('ally',[]),rec('far',[])],{sarkazShip:state(6)},{kits:{caster:()=>({
    skill:{kind:'duration',duration:100,spCost:999,trigger:'manual',targeting:{rangeGrid:[[0,0],[0,1],[0,2]]}}
  })},units:[{chessId:'caster',row:10,col:2,dir:'RIGHT'},{chessId:'ally',row:10,col:3},{chessId:'far',row:10,col:6}]});
  const u=h.unit('caster'),a=h.unit('ally'),f=h.unit('far');
  const token=h.b.spawnToken(u,'token_test',10,4,{def:{...u.def,id:'token_test',kind:'token',stats:{...u.base},raw:{}}});
  // A real attack range is rebuilt by skill activation, rather than trusting stale cached cells.
  u.skill.activate('test',{free:true});
  close(shieldLayers(u),1);close(shieldLayers(a),1);close(shieldLayers(f),0);
  assert.equal(numericShieldTotal(u),0);
  const e=h.spawn('dummy',{pos:[7,9]}),hp=u.hp;
  h.b.addBuff(u,{key:'immune',flags:{invulnerable:true}});
  h.b.dealDamage(e,u,{type:'phys',amount:100});close(shieldLayers(u),1);h.b.removeBuff(u,'immune');
  h.b.dealDamage(e,u,{type:'arts',amount:0});close(shieldLayers(u),1);
  for(const type of ['true','elemental'])h.b.dealDamage(e,u,{type,amount:100,canDodge:false});
  h.b.loseHp(u,100);close(shieldLayers(u),1);close(u.hp,hp-300);
  h.b.addBuff(u,{key:'older-other',shieldHits:1});
  h.b.dealDamage(e,u,{type:'phys',amount:100,canDodge:false});close(shieldLayers(u),0);
  assert.equal(u.findBuff('older-other').shieldHits,1);
  assert.ok(token);assert.equal(token.ownerId,u.ownerId);close(shieldLayers(token),1);
  checkInvariants(h.b);
});

test('D/E/F: 20/40 caps, dual expiry, live lifetime and initial SP snapshot, Narantuya exclusion',()=>{
  for(const [count,bandId,cap,sp]of [[3,null,20,1],[6,null,40,2],[6,'band_narant',20,1]]){
    const h=field([rec('s',['sargonShip'],[],{skill:{duration:999,spCost:999}})],{sargonShip:state(count,100)},{bandId});
    const u=h.unit('s');close(u.s.spRecovery,sp);
    h.b.addLayers('p1','sargonShip',500);h.step(2);close(u.s.spRecovery,sp);
    for(let i=0;i<45;i++)h.b.emit('skillStart',{unit:u});
    close(u.s.atk,1000*(1+.1*cap));close(u.s.aspd,100+10*cap);
    close(u.findBuff('bond:sargon').duration,137);
    h.run(137.2);close(u.s.atk,1000);close(u.s.aspd,100);
    h.b.kill(u);h.b.redeploy(u,{free:true});close(u.s.spRecovery,sp);checkInvariants(h.b);
  }
});

test('G: independent 3/5/6 gates, base-add ledger, legal repeated origin paths and immutable starting snapshot',()=>{
  for(const n of [3,5,6]){
    const h=field([rec('a'),rec('b'),rec('c',[],[],{stats:{atk:500,maxHp:1000000,def:0}})],{egirShip:state(n,100,[3,5,6])},{
      units:[{chessId:'a',row:10,col:2,dir:'RIGHT'},{chessId:'b',row:10,col:3,dir:'RIGHT'},{chessId:'c',row:10,col:4}],
      setup:b=>{b.addBuff(b.allyUnits[1],{key:'previous-devour',mods:{atkFlat:500},persist:true,allowDead:true});}});
    const a=h.unit('a'),six=n===6?100:0;
    // A marks B and C. B's already settled 500 is not globally deduplicated against C's 500.
    close(a.findBuff('bond:egir:devour').mods.atkFlat,2000+six);
    h.b.addBuff(a,{key:'double',mods:{atkPct:1}});close(a.s.atk,(3000+2*six)*2);
    h.b.addLayers('p1','egirShip',500);h.step(2);close(a.findBuff('bond:egir:six')?.mods.atkFlat??0,six);
    assert.equal(a.mem.egirDevourLedger.length,2);assert.deepEqual(h.b.errors,[]);
  }
});

test('H/J: shared traits survive knock-out, clear non-KO source independently, dedup and recovery paths once',()=>{
  const h=field([rec('u',undefined,[trait('ulpia')]),rec('u2',undefined,[trait('ulpia')]),
    rec('s',undefined,[trait('skadi2')]),rec('c',undefined,[trait('clemnt')]),rec('receiver'),
    rec('ordinary',undefined,[trait('ulpia','a')])],{egirShip:state(3,600,[3,5,6])});
  const u=h.unit('u'),u2=h.unit('u2'),r=h.unit('receiver');
  close(r.s.recoveryTakenMul,7);close(r.s.hpRegen,3000);close(r.s.spRecovery,7);close(r.s.atk,4000);
  r.hp-=100000;close(h.b.heal(null,r,100),700);close(h.b.heal(r,r,3000,{self:true,regen:true}),21000);
  h.b.addBuff(r,{key:'noheal',flags:{healFree:true}});close(h.b.heal(null,r,100),0);
  close(h.b.heal(r,r,100,{self:true,regen:true}),700);h.b.removeBuff(r,'noheal');
  h.b.kill(u);close(r.s.recoveryTakenMul,7);
  h.b.retreat(u2);close(r.s.recoveryTakenMul,7);
  h.b.redeploy(u,{free:true});h.b.retreat(u,{reason:'forcedExit',suppressDeath:true});close(r.s.recoveryTakenMul,1);
  h.b.redeploy(u2,{free:true});close(r.s.recoveryTakenMul,7);
  installAegirTraits(h.b);close(r.s.recoveryTakenMul,7);
  h.b.addLayers('p1','egirShip',10);h.step(2);close(r.s.recoveryTakenMul,7.1);
  checkInvariants(h.b);
});

test('H: Deepcolor conditional attack per-target at 49/50 percent, original and elite coefficient match',()=>{
  for(const form of ['a','b']){
    const h=field([rec('d',undefined,[trait('udflow',form)]),rec('r')],{egirShip:state(3)});
    const e=h.spawn('dummy',{pos:[7,9]}),s=form==='a'?h.unit('d'):h.unit('r');
    e.hp=e.s.maxHp*.5;let hp=e.hp;h.b.dealDamage(s,e,{amount:100,type:'true',isAttack:true});close(hp-e.hp,100);
    e.hp=e.s.maxHp*.49;hp=e.hp;h.b.dealDamage(s,e,{amount:100,type:'true',isSkill:true});close(hp-e.hp,150);
    h.b.kill(h.unit('d'));if(form==='b'){hp=e.hp;h.b.dealDamage(s,e,{amount:100,type:'true',isAttack:true});close(hp-e.hp,150);}
  }
});

test('I: Haini one 6/12 grant including friendly KO; Skadi each enemy, independent activation, disabled growth',()=>{
  for(const form of ['a','b']){
    const n=form==='b'?2:1,h=field([rec('h',undefined,[`garrison_131_${form}`]),rec('sk',['egirShip','raidShip'],[`garrison_38_${form}`]),rec('victim',[])],
      {egirShip:state(3),raidShip:{active:true,count:2,tier:1,layers:0},arcaneShip:{active:true,count:2,tier:1,layers:0}});
    h.b.kill(h.unit('victim'),h.unit('h'));const e=h.spawn('dummy',{pos:[7,9]});
    h.b.kill(e,h.unit('h'));close(h.b.players[0].bonds.egirShip.layers,6*n);close(h.b.players[0].bonds.arcaneShip.layers,0);
    const e2=h.spawn('dummy',{pos:[7,9]});h.b.kill(e2,h.unit('sk'));close(h.b.players[0].bonds.egirShip.layers,7*n);close(h.b.players[0].bonds.raidShip.layers,n);
    h.b.flags.layerGainsEnabled=false;h.b.emit('kill',{killer:h.unit('sk'),victim:e2});close(h.b.players[0].bonds.egirShip.layers,7*n);
  }
});

test('K: same-carrier set shares independent counter, provider KO/removal, multiple providers, cooldown preserved',()=>{
  const records=[rec('p'),rec('p2'),rec('r'),rec('r2')],items=['chess_item_6_04_e_a','chess_item_3_07_e_a'];
  const h=field(records,{egirShip:state(3)},{units:records.map((c,i)=>({chessId:c.chessId,row:10,col:2+i,dir:'UP',items:i<2?items:[]}))});
  const e=h.spawn('dummy',{pos:[7,9]}),r=h.unit('r'),r2=h.unit('r2'),p=h.unit('p'),p2=h.unit('p2');
  const hit=u=>{const hp=e.hp;h.b.dealDamage(e,u,{amount:1000,type:'true',canDodge:false});return hp-e.hp;};
  close(hit(r),r.s.atk*.5);close(hit(r2),r2.s.atk*.5);close(hit(r),0);
  h.b.kill(p);close(hit(r),0);h.run(.51);close(hit(r),r.s.atk*.5);
  h.b.kill(p2);h.run(.51);close(hit(r),0);
  h.b.redeploy(p,{free:true});close(hit(r),r.s.atk*.5);close(hit(p),p.s.atk*.5);
  assert.deepEqual(h.b.errors,[]);
});

test('L: roster, one inventory identity, legal skill kit, DIY exclusion, fixed rewards once and soft-ban validation',()=>{
  const visible=Object.values(DATA.chess).filter(c=>c.visible&&!c.isGolden);
  assert.equal(visible.length,124);assert.equal(visible.filter(c=>c.bonds.includes('egirShip')).length,10);
  assert.deepEqual([1,2,3,4,5,6].map(t=>visible.filter(c=>c.tier===t).length),[18,19,21,25,19,22]);
  const c=DATA.chess.chess_char_5_aegir_clemnt_a;assert.equal(c.skill.skillId,'skchr_clemnt_2');assert.equal(c.price,4);
  assert.equal(DATA.chess.chess_char_5_05_a.tier,4);assert.equal(DATA.chess.chess_char_5_05_a.price,3);
  assert.deepEqual(DATA.chess.chess_char_3_05_a.bonds,['egirShip','raidShip']);
  assert.ok(!DATA.backups.diy.ownedPool.includes('char_4231_clemnt'));assert.equal(DATA.backups.diy.operators.char_4231_clemnt,undefined);
  assert.equal(typeof KITS[c.baseId],'function');
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',fake:true,seed:1}),m=h.m,ps=h.ps('p_0');ps.bandId='band_glady';
  for(const [i,r]of [1,3,6,8].entries()){m.round=r;const before=ps.allChess().length;ps.startRecruitmentRound(r);ps.startRecruitmentRound(r);assert.equal(ps.allChess().length,before+1);assert.ok(ps.allChess().some(p=>p.id===DATA.bands.band_glady.recruitment.rewards[i]));}
  m.softBannedBonds=['egirShip'];assert.equal(m.recruitmentBandOff('band_glady'),true);
  assert.equal(validateDiyPicks({chess_char_5_diy1_a:{charId:'char_4231_clemnt',skillIndex:1}},{data:DATA}).error,'BAD_TARGET');
});


test('M: shared-field shields and elite traits stay with their owning player, temporary shields survive disabled growth',()=>{
  const chess={cast:rec('cast',['sarkazShip','egirShip'],[trait('ulpia')],{rangeGrid:[[0,0],[0,1],[0,2],[0,3]]}),own:rec('own'),foreign:rec('foreign')};
  const h=makeBattle({kind:'unite',defs:{chess,enemies:{dummy:enemy}},autoFinish:false,flags:{layerGainsEnabled:false},
    players:[{playerId:'p1',bonds:{sarkazShip:state(6),egirShip:state(3,100,[3,5,6])},units:[{chessId:'cast',row:10,col:2,dir:'RIGHT'},{chessId:'own',row:10,col:3}]},
      {playerId:'p2',bonds:{},units:[{chessId:'foreign',row:10,col:4}]}]});
  h.step();const cast=h.unit('cast'),own=h.unit('own'),foreign=h.unit('foreign');
  h.b.emit('skillStart',{unit:cast});close(shieldLayers(own),1);close(shieldLayers(foreign),0);
  close(own.s.recoveryTakenMul,2);close(foreign.s.recoveryTakenMul,1);assert.deepEqual(h.b.errors,[]);
});

test('E/J: extra natural SP does not turn attack/hurt skills into auto recovery and respects active/blocked windows',()=>{
  const records=['time','attack','hurt'].map(type=>rec(type,['sargonShip'],[],{skill:{spCost:999}}));
  const kits=Object.fromEntries(records.map(c=>[c.chessId,()=>({skill:{kind:'duration',duration:10,spCost:999,initSp:0,spType:c.chessId,trigger:'manual'}})]));
  const h=field(records,{sargonShip:state(6,600)},{kits});
  const t=h.unit('time'),a=h.unit('attack'),d=h.unit('hurt'),before=[t.skill.sp,a.skill.sp,d.skill.sp];
  h.run(1);close(t.skill.sp-before[0],7);close(a.skill.sp-before[1],0);close(d.skill.sp-before[2],0);
  h.b.addBuff(t,{key:'blocksp',flags:{noSp:true}});let sp=t.skill.sp;h.run(1);close(t.skill.sp,sp);
  h.b.removeBuff(t,'blocksp');t.skill.activate('test',{free:true});sp=t.skill.sp;h.run(1);close(t.skill.sp,sp);
  assert.deepEqual(h.b.errors,[]);
});
