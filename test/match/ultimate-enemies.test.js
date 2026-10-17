import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';
import { createRng } from '../../server/sim/rng.js';
import { setupMatchWaves,pickRoundEntry,buildNormalWave,replacedCount,isFlyKey,gateOf } from '../../server/match/waves.js';

const types=['FIREPOWER','BREAKTHROUGH','SUMMON'];
const gd=new GameData(DATA,'mode_multi_abyss');
const groups=Object.values(DATA.factions.entries).filter(e=>e.entryId);
const picked=(e,round)=>({round,type:e.type,key:e.key,normal:e.N[0].key,elite:e.E[0].key,fly:e.fly,entryId:e.entryId});
test('34 approved groups: every interval has candidates, weighted selection never escapes its round range',()=>{
  assert.equal(groups.length,34);
  for(const type of types)for(let r=1;r<=13;r++)for(let seed=1;seed<=80;seed++){
    const p=pickRoundEntry(gd,createRng(seed),type,r),e=DATA.factions.entries[p.entryId];
    assert.equal(e.type,type);assert.ok(e.minRound<=r && r<=e.maxRound);
    const keys=[p.key,p.normal,p.elite];
    if(r<8)assert.ok(!keys.some(k=>/_2$/.test(k)),`${type} R${r} no enhanced variant`);
    if(r>=5 && r<=7 || r>=11)assert.ok(!keys.some(k=>/ghost/.test(k)),`${type} R${r} ghost gap`);
    for(const k of keys)assert.equal(isFlyKey(gd,k),e.fly,'one movement class per group');
    const damage=new Set(keys.map(k=>DATA.enemies[k].stats.dmgType).filter(d=>d!=='none'));
    assert.equal(damage.size,1,'one main direct damage class per group');
  }
});
test('new type slots remain 3; easier modes keep their old pool, R14/15 fall back to original escorts',()=>{
  for(const modeId of ['mode_single_hard','mode_multi_normal','mode_multi_abyss','mode_multi_catastrophe']){
    const g=new GameData(DATA,modeId);
    for(let seed=1;seed<=100;seed++){
      const s=setupMatchWaves(g,createRng(seed));
      if(!/abyss|catastrophe/.test(modeId))assert.ok(s.factions.every(t=>!types.includes(t)));
      for(const t of s.factions)assert.equal(s.typeSlots.filter(x=>x===t).length,modeId.includes('catastrophe') && !s.typeSlots.includes(t)?0:3);
      for(const r of [14,15])assert.equal(s.picks[r].entryId,undefined);
    }
  }
});
test('every group uses original per-batch budgets; mother caps truncate chronologically or replace whole exhausted batches',()=>{
  for(const e of groups)for(let r=e.minRound;r<=e.maxRound;r++){
    const p=picked(e,r),picks=[];picks[r]=p;
    const w=buildNormalWave(gd,createRng(1),{picks},r),tpl=DATA.waves[w.templateId],used={};
    for(const s of w.spawns.slice().sort((a,b)=>a.time-b.time||a.actionIndex-b.actionIndex)){
      const a=tpl.spawns[s.actionIndex],ph=DATA.factions.generation.placeholders[a.key];
      if(!ph)continue;
      const intended=ph.cls==='normal'?p.normal:ph.cls==='elite'?p.elite:p.key;
      assert.equal(isFlyKey(gd,s.enemyKey),ph.fly);
      const cap=DATA.factions.generation.presetMotherCaps[intended]?.find(([lo,hi])=>r>=lo&&r<=hi)?.[2];
      const n=replacedCount(gd,a.key,a.count,intended);
      if(cap===undefined)assert.equal(s.count,n);
      else{
        const remaining=cap-(used[intended]||0);
        if(remaining<=0){assert.equal(s.enemyKey,p.normal);assert.equal(s.count,replacedCount(gd,a.key,a.count,p.normal));}
        else{assert.equal(s.enemyKey,intended);assert.equal(s.count,Math.min(n,remaining));used[intended]=(used[intended]||0)+s.count;}
      }
    }
  }
});
test('Catastrophe resolves both lanes before filtering: no baseline movement class can drop the other lane',()=>{
  for(let seed=1;seed<=300;seed++){
    const g=new GameData(DATA,'mode_multi_catastrophe'),s=setupMatchWaves(g,createRng(seed));
    for(let r=4;r<=7;r++){
      const w=buildNormalWave(g,createRng(1),s,r),tpl=DATA.waves[w.templateId];
      for(const [i,a] of tpl.spawns.entries()){
        const ph=DATA.factions.generation.placeholders[a.key];if(!ph)continue;
        const p=s.lanePicks[r][gateOf(tpl.routes[a.routeIndex].start,false)];
        const key=ph.cls==='normal'?p.normal:ph.cls==='elite'?p.elite:p.key;
        assert.equal(w.spawns.some(x=>x.actionIndex===i),isFlyKey(g,key)===ph.fly,`seed ${seed} R${r} batch ${i}`);
      }
    }
  }
});
