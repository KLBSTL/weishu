// Offline central teacher only. Production bots never import or execute terminal continuations.
import {PHASE} from '../../shared/constants.js';
import {forkTeamPrep,teamBoundarySignature,teamRolloutSnapshot} from './botTeamRollout.js';
export const TEAM_ENDGAME_WORLD='native-team-endgame-v1-off';

/** Audit-only private signature; never an actor input or a public dump. */
export function endgameBoundarySignature(m) {
  return JSON.stringify([teamBoundarySignature(m,{runtime:true}),m.teamLp,m.hiddenReached,m.hiddenLayerSum,m.outcome,
    m._teamEndgameRoot,m._teamEndgameStages,m.bossWaves]);
}

export function forkTeamEndgame(source,playerId,opts={}) {
  const early=opts.earlyPrep===true&&[6,8].includes(source.round);
  if((source.round<source.gd.bossRound-3&&!early)||source.round>source.gd.hiddenRound)throw new Error('LATE_PREP_REQUIRED');
  if(opts.continuation&&!source._teamEndgameBranch)throw new Error('SAMPLED_ENDGAME_REQUIRED');
  const base=forkTeamPrep(source,playerId,{...opts,policy:'off',details:true,endgame:true}),m=base.m;
  m._teamEndgameBranch=true;
  m._teamEndgameRoot=opts.continuation?source._teamEndgameRoot:source.round;
  m._teamEndgameStages=opts.continuation?structuredClone(source._teamEndgameStages||[]):[];
  const stages=m._teamEndgameStages,errors=()=>m.errorCount+m.simErrors+m.dispatcher.errors+m.sched.errors.length;
  const start=m.startFinalAssault.bind(m);
  m.startFinalAssault=hidden=>{
    const active=m.alivePlayers(),entryLp=hidden?m.teamLp:active.reduce((s,p)=>s+Math.max(0,p.lp),0);
    const stage={round:m.round,kind:hidden?'hidden':'boss',bossId:hidden?m.hiddenBossId:m.bossId,entrants:active.map(p=>p.playerId),
      entryLp,entryLayers:Object.fromEntries(active.map(p=>[p.playerId,{...p.layers}])),fields:[],complete:false};
    stages.push(stage);start(hidden);stage.maxHp=m.bossPool?.maxHp??null;
  };
  const finish=m._finishFinal.bind(m);
  m._finishFinal=(hidden,resultOf)=>{
    if(m.phase!==(hidden?PHASE.HIDDEN_CORE:PHASE.FINAL_ASSAULT))return finish(hidden,resultOf);
    const stage=stages.at(-1);if(!stage)throw new Error('ENDGAME_STAGE_MISSING');
    const cleared=m._finalEnding?m._finalEnding==='cleared':m.bossPool.hp<=0;
    finish(hidden,f=>{
      const result=resultOf(f);if(result?.synthetic)m.reportError('endgame rollout','synthetic boss battle');
      stage.fields.push({fieldId:f.fieldId,time:result?.time??null,players:Object.fromEntries(Object.entries(result?.perPlayer||{}).map(([pid,p])=>{
        const uids=new Set([...m.players.get(pid).board.values()].filter(u=>u.kind==='chess').map(u=>u.uid));
        const ops=(p.unitsEnd||[]).filter(u=>uids.has(u.uid));
        return [pid,{bossDamage:p.bossDamage||0,damage:p.damageDealt||0,healing:p.healingDone||0,
          operators:ops.length,standing:ops.filter(u=>u.alive).length,unitStats:structuredClone(p.unitStats||[])}];
      }))});
      return result;
    });
    Object.assign(stage,{complete:true,cleared,maxHp:m.bossPool?.maxHp??stage.maxHp,hp:m.bossPool?.hp??null,exitLp:m.teamLp,
      seconds:Math.max(0,...stage.fields.map(f=>f.time||0))});
  };
  let started=false,closed=false,terminalStarted=false;
  function schedule() {
    if(started)return;started=true;
    m.setDeadline(m.soloUntimed?null:m.gd.prepTime(m.round),()=>m.prepDeadline());
    let i=0;for(const p of m.alivePlayers())m.scheduleBotPrep(p,i++);
  }
  const env={m,actor:base.actor,seed:base.seed,
    apply(action){if(started||closed)return {error:'ROLLOUT_ALREADY_STARTED'};return base.apply(action);},
    advance(rounds=1,options={}) {
      if(closed)throw new Error('ROLLOUT_CLOSED');
      if(terminalStarted)throw new Error('TERMINAL_CONTINUATION_STARTED');
      const r=base.advance(rounds,options);started=true;return r;
    },
    finish({maxSteps=1000000,cancelled=()=>false}={}) {
      if(closed)throw new Error('ROLLOUT_CLOSED');
      if(!Number.isInteger(maxSteps)||maxSteps<1)throw new Error('BAD_ENDGAME_BUDGET');
      terminalStarted=true;
      if(!m.ended)schedule();
      let steps=0,interrupted=false;
      while(!m.ended&&!errors()&&steps<maxSteps) {
        if(cancelled()){interrupted=true;break;}
        if(!m.sched.runNext())break;steps++;
      }
      const status=errors()?'error':interrupted?'cancelled':m.ended?'terminal':'budget';
      return {version:1,kind:'team-endgame-rollout',world:TEAM_ENDGAME_WORLD,policy:'off',seed:m.seed,startRound:m._teamEndgameRoot,endRound:m.round,
        complete:status==='terminal',status,errors:errors(),steps,outcome:structuredClone(m.outcome||null),
        stages:structuredClone(stages),normalRounds:structuredClone(base.rows),team:teamRolloutSnapshot(m)};
    },
    dispose(){if(!closed){closed=true;base.dispose();}},
  };
  return env;
}
