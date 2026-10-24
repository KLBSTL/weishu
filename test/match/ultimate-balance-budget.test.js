import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATA,makeMatch} from './harness.js';
import {GameData} from '../../server/match/gamedata.js';
import {createRng} from '../../server/sim/rng.js';
import {buildNormalWave,setupMatchWaves} from '../../server/match/waves.js';
import {uniteSurvivors} from '../../server/match/unite.js';
function fixture({routes=1,zero=false,motherPrice=10000,pure=false,splitRoutes=false}={}){
  const d=structuredClone(DATA),g=d.factions.generation;
  for(const [key,power]of [['bm',motherPrice],['bc',4000],['bn',zero?0:16000],['bs',zero?0:10000]])
    d.enemies[key]={...d.enemies.enemy_1137_plasm,attrPower:power,beFactor:1,isFlyEnemy:false};
  Object.assign(g.placeholders,{bn:{slot:'N',cls:'normal',fly:false},bs:{slot:'S',cls:'special',fly:false}});
  g.presetMotherCaps={bm:[[1,13,4]]};g.summonBudget={mothers:['bm'],families:{},motherBatchMul:2,childPowerMul:.75};
  const gd=new GameData(d,'mode_multi_abyss');
  const tpl={routes:Array.from({length:routes},(_,i)=>({motion:'WALK',start:[i?12:9,10],end:[9,2],checkpoints:[]})),spawns:[]};
  for(let routeIndex=0;routeIndex<routes;routeIndex++){
    tpl.spawns.push({key:'bs',slot:'S',count:2,time:0,interval:6,routeIndex});
    for(let i=0;i<5;i++)tpl.spawns.push({key:'bn',slot:'N',count:1,time:12+i*12,interval:12,routeIndex});
  }
  if(splitRoutes){
    const original=tpl.routes;tpl.routes=tpl.spawns.map(s=>structuredClone(original[s.routeIndex]));
    tpl.spawns.forEach((s,i)=>{s.routeIndex=i;});
  }
  gd.roundCfg=()=>({template:'budget'});gd.wave=()=>tpl;gd.combatTimeLimit=()=>100;
  const picks=[];picks[6]={type:'SUMMON',entryId:'budget',key:pure?'bc':'bm',normal:'bc',elite:'bc',fly:false};
  return buildNormalWave(gd,createRng(1),{picks},6);
}
test('100000 budget pays 4 × 10000 mothers, then 20 discounted children at 3000; original windows remain',()=>{
  const w=fixture();assert.equal(w.spawns.filter(s=>s.enemyKey==='bm').reduce((n,s)=>n+s.count,0),4);
  const children=w.spawns.filter(s=>s.enemyKey==='bc');assert.equal(children.length,5);assert.ok(children.every(s=>s.count===4&&s.interval===3));
  assert.deepEqual(children.map(s=>s.time),[12,24,36,48,60]);
});

test('separate template route indices at the same entrance share the budget without deleting batches',()=>{
  const compact=w=>w.spawns.map(s=>[s.enemyKey,s.time,s.count,s.interval]);
  assert.deepEqual(compact(fixture({splitRoutes:true})),compact(fixture()));
});

test('fractional child shares reuse affordable remainder, without exceeding budget or five per batch',()=>{
  const w=fixture({motherPrice:10001,splitRoutes:true});
  const mothers=w.spawns.filter(s=>s.enemyKey==='bm').reduce((n,s)=>n+s.count,0);
  const children=w.spawns.filter(s=>s.enemyKey==='bc').reduce((n,s)=>n+s.count,0);
  assert.equal(mothers,4);assert.equal(children,19);
  assert.ok(mothers*10001+children*3000<=100000);
  assert.ok(100000-mothers*10001-children*3000<3000);
  assert.ok(w.spawns.every(s=>s.count<=5));
});
test('two routes share the whole-field mother cap, while each route spends only its own budget',()=>{
  const w=fixture({routes:2});assert.equal(w.spawns.filter(s=>s.enemyKey==='bm').reduce((n,s)=>n+s.count,0),4);
  for(const route of [0,1]){
    const cost=w.spawns.filter(s=>s.routeIndex===route).reduce((n,s)=>n+s.count*(s.enemyKey==='bm'?10000:3000),0);
    assert.ok(cost<=100000);
  }
});
test('zero budgets add no forced enemy; unaffordable mothers are omitted; pure children use the full discounted budget',()=>{
  const zero=fixture({zero:true});assert.equal(zero.spawns.length,0);assert.ok(zero.actions.every(a=>a.count===0&&!a.valid));
  assert.ok(fixture({motherPrice:1e6}).spawns.every(s=>s.enemyKey==='bc'));
  assert.equal(fixture({pure:true}).spawns.reduce((n,s)=>n+s.count,0),30);
});
test('R6/8/10/11/13 schedules in solo/co-op Abyss/Catastrophe share continuous-mother caps by family',()=>{
  for(const mode of ['mode_single_abyss','mode_multi_abyss','mode_single_catastrophe','mode_multi_catastrophe']){
    const gd=new GameData(DATA,mode),gen=gd.factions.generation;
    for(let seed=1;seed<=100;seed++){
      const setup=setupMatchWaves(gd,createRng(seed));
      for(const r of [6,8,10,11,13]){
        const w=buildNormalWave(gd,createRng(1),setup,r),count={};
        for(const s of w.spawns){
          if(s.mods?.ultimateType!=='SUMMON')continue;
          const cap=gen.presetMotherCaps[s.enemyKey]?.find(([lo,hi])=>r>=lo&&r<=hi)?.[2];if(cap===undefined)continue;
          const family=gen.summonBudget.families[s.enemyKey]??s.enemyKey;count[family]=(count[family]??0)+s.count;
          assert.ok(count[family]<=cap,`${mode} seed${seed} R${r} ${family}`);
        }
      }
    }
  }
});
test('fireball leak billing is zero in solo settlement and co-op survivors, without changing leak/perfect statistics',()=>{
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',fake:true}).start(),m=h.m;
  h.drive(()=>m.phase==='PREP');const ps=h.ps('p_0'),hp=ps.lp;
  const free={enemyKey:'enemy_1177_dufrbl',mods:{ultimateType:'FIREPOWER',ultimateRound:6},counted:true,sourcePlayerId:ps.playerId,lpr:0};
  m.lastResults.set(ps.playerId,{leaked:[free],perfect:false,killed:0,coins:0,layerGains:{}});
  m.settle(null,null);assert.equal(ps.lp,hp);assert.equal(ps.stats.leaks,1);
  const plan={notReentered:new Map()};
  assert.equal(uniteSurvivors(plan,{perPlayer:{p:{leaked:[free]}}}).get(ps.playerId)??0,0);
  assert.equal(uniteSurvivors(plan,{unspawned:[free]}).get(ps.playerId)??0,0);
  assert.equal(uniteSurvivors(plan,{perPlayer:{p:{leaked:[{...free,mods:null}]}}}).get(ps.playerId),1);
  m.dispose();
});
