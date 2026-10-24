import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { PHASE } from '../../shared/constants.js';

for(const clientCombat of [false,true])for(const win of [false,true]){
  test(`R14 ${win?'victory':'defeat'}, zero layers and 1 LP (${clientCombat?'client':'server'} combat)`,()=>{
    const h=makeMatch({mode:'solo',difficulty:'HARD',seed:105,fake:true,clientCombat,
      script:b=>b.kind==='boss'?{bossDps:win?1e9:0}:b.kind==='hidden'?{bossDps:1e9}:{}}).start();
    const m=h.m;h.drive(()=>m.phase===PHASE.PREP&&m.round===14);
    const ps=h.ps('p_0');ps.layers={};ps.lp=1;ps.recompute();
    assert.equal(ps.activatedLayers(),0);
    h.drive(()=>m.phase===PHASE.HIDDEN_CORE||h.ended!=null);
    assert.equal(m.hiddenReached,win);
    if(win){assert.equal(m.round,15);assert.equal(m.teamLp,1);assert.equal(m.phase,PHASE.HIDDEN_CORE);}
    else{assert.equal(h.ended.victory,false);assert.equal(h.ended.hiddenReached,false);}
    m.dispose();
  });
}
