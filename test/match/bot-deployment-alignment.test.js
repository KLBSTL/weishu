import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeMatch,give} from './harness.js';
import {prepLineupDiagnostic,prepFeatures,teamPrepFeatures,contextTeamPrepFeatures,arrange} from '../../server/match/bot.js';
import {forkPrep,applyPrepAction} from '../../server/match/botEnvironment.js';
import {teamBoundarySignature} from '../../server/match/botTeamRollout.js';
import {CONTEXT_TEAM_FEATURES as F} from '../../server/match/botTeamContextModel.js';
import {TEAM_FEATURES,TEAM_WORLD,TEAM_SCOPE,teamRuleHash,validateTeamModel} from '../../server/match/botTeamModel.js';
import {prepRuleHash} from '../../server/match/botValueModel.js';
const ids=['chess_char_4_16_a','chess_char_5_15_a','chess_char_4_20_a','chess_char_3_04_a','chess_char_1_03_a',
  'chess_char_4_22_a','chess_char_4_22_a','chess_char_5_21_a','chess_char_4_17_a','chess_char_2_09_a','chess_char_1_03_a'];
function fixture(players=2) {
  const h=makeMatch({mode:'coop',difficulty:'ABYSS',humans:0,bots:players,seed:7901,fake:true,botRehearsal:0,captureFrames:false}).start().toPrep(6);
  const m=h.m,p=m.order[0];p.board.clear();p.hand.fill(null);p.temp.fill(null);p.shop.level=3;
  p.layers={skillfulShip:200,preciseShip:200,swiftShip:200,arcaneShip:200};
  ids.forEach((id,i)=>give(m,p,id,i<7?'hand':'temp',i<7?i:i-7));p.recompute();return {m,p};
}
test('actual single-swap deployment and evaluated features agree across a real two-swap activation valley',()=>{
  const {m,p}=fixture();m.botPlanner='off';const before=teamBoundarySignature(m,{runtime:true}),off=prepLineupDiagnostic(m,p);
  const xs=contextTeamPrepFeatures(m,p,{type:'stop'});
  assert.equal(xs[F.indexOf('root_strength')],off.score/200);
  m.botPlanner='beam';const beam=prepLineupDiagnostic(m,p);
  assert.ok(beam.score>off.score+.5,'fixture must distinguish single and double swaps');
  assert.notDeepEqual(new Set(beam.chosen),new Set(off.chosen));
  assert.equal(contextTeamPrepFeatures(m,p,{type:'stop'})[F.indexOf('root_strength')],beam.score/200);
  m.botPlanner='off';assert.equal(teamBoundarySignature(m,{runtime:true}),before);
  arrange(m,p);assert.deepEqual(new Set([...p.board.values()].filter(x=>x.kind==='chess').map(x=>x.uid)),new Set(off.chosen));m.dispose();
});
test('first-action deltas use the production planner without changing the formal state or its random streams',()=>{
  const {m,p}=fixture(),before=teamBoundarySignature(m,{runtime:true}),action={type:'sell',uid:p.hand[0].uid,id:p.hand[0].id};
  const branch=forkPrep(m,p,{seed:51});
  try {
    const base=prepFeatures(branch.m,branch.ps);assert.equal(applyPrepAction(branch.m,branch.ps,action).ok,true);
    const after=prepFeatures(branch.m,branch.ps),xs=teamPrepFeatures(m,p,action);
    assert.equal(xs[TEAM_FEATURES.indexOf('delta_strength')],after.strength-base.strength);
    assert.equal(teamBoundarySignature(m,{runtime:true}),before);
  }finally{branch.dispose();m.dispose();}
});
for(const players of [2,3])test(`${players} seats normalize public teammate context by actual team capacity`,()=>{
  const h=makeMatch({mode:'coop',difficulty:'ABYSS',humans:0,bots:players,seed:7901,fake:true,captureFrames:false}).start().toPrep(6),m=h.m,p=m.order[0];
  for(const q of m.order.slice(1))q.board.clear();
  const a=contextTeamPrepFeatures(m,p,{type:'stop'});assert.equal(a[F.indexOf('root_teamAlive')],1);
  assert.equal(a[F.indexOf('root_teamRoleGaps')],1);
  m.order.at(-1).alive=false;m.order.at(-1).lp=0;
  assert.equal(contextTeamPrepFeatures(m,p,{type:'stop'})[F.indexOf('root_teamAlive')],(players-1)/players);m.dispose();
});
test('feature semantics change invalidates historical ranker rules',()=>{
  const {m}=fixture(),model={version:1,kind:'linear-team-prep-ranker',world:TEAM_WORLD,scope:TEAM_SCOPE,rules:teamRuleHash(m.gd),
    features:TEAM_FEATURES,weights:TEAM_FEATURES.map(()=>0),mean:TEAM_FEATURES.map(()=>0),scale:TEAM_FEATURES.map(()=>1),margin:.2};
  assert.equal(validateTeamModel(model,m.gd),null);
  const historical='normal-team-v2-spring-ordinary-sourceless';
  assert.equal(validateTeamModel({...model,world:historical},m.gd),'TEAM_MODEL_SCOPE');
  const oldRules=createHash('sha256').update(`1|${historical}|${prepRuleHash(m.gd)}`).digest('hex');
  assert.equal(validateTeamModel({...model,rules:oldRules},m.gd),'TEAM_MODEL_RULES');m.dispose();
});
