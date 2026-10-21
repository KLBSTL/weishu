import {test} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../../server/match/Match.js';import {VirtualScheduler} from '../../server/match/scheduler.js';
import {getData} from '../../server/data.js';import {STABLE_BOT_PROFILE} from '../../server/match/botPolicy.js';
import {botPrepBegin,botPrepEnd} from '../../server/match/bot.js';
const data=getData({log:{info(){},warn(){},error(){}}});

test('new games actually use the published growth/Boss policy and three layout rehearsals without loading an experimental model',()=>{
  const m=new Match({mode:'coop',difficulty:'ABYSS',seed:17001,data,scheduler:new VirtualScheduler(),clientCombat:false,
    seats:[0,1,2].map(seat=>({seat,playerId:'ai_'+seat,name:'AI '+seat,isBot:true,connected:true})),send:()=>true,broadcast(){},onEnd(){},
    log:{info(){},warn(){},error(){},debug(){}}});
  assert.equal(m.botProfile,STABLE_BOT_PROFILE.id);assert.equal(m.botPlanner,'off');assert.equal(m.botRehearsal,3);
  assert.equal(m.botTeamModel,undefined);assert.equal(m.botPlannerWeights,undefined);
  m.start();m.sched.runUntil(()=>m.phase==='PREP',{maxSteps:100000});
  assert.equal(m.phase,'PREP');const ps=m.alivePlayers()[0],funds=ps.funds;
  botPrepBegin(m,ps);botPrepEnd(m,ps);
  assert.ok(ps.deployCount>0,'off still buys, forms a lineup and places units');assert.ok(ps.funds<=funds);
  assert.equal(ps._botPlannerTrace,undefined,'the stable policy does not run experimental macro/model planning');
  assert.equal(m.errorCount+m.simErrors+m.dispatcher.errors,0);m.dispose();
});
