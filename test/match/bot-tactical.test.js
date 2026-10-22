import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,give,DATA,legalTileFor} from './harness.js';
import {parseKey} from '../../server/match/board.js';
import {normalLineupAlternatives,normalLineupAlternativeSteps,arrange,arrangeSteps,botPrepEnd,planLayout,createRehearsal,runSteps} from '../../server/match/bot.js';
import {prepSignature} from '../../server/match/botEnvironment.js';

function setup(real=false) {
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',humans:1,seed:91,fake:!real,botRehearsal:3,botTactics:'combined'}).start().toPrep(1);
  const m=h.m,ps=m.order[0];
  ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.layers={};ps.counters={};m.round=6;ps.shop.level=4;
  const incoming=['空弦','断崖'].map(name=>Object.values(DATA.chess).find(c=>c.visible&&!c.isGolden&&c.name===name));
  assert.ok(incoming.every(Boolean));
  const possible=Object.values(DATA.chess).filter(c=>c.visible&&!c.isGolden&&!c.bonds.includes('skillfulShip')&&c.attackKind!=='none');
  const healer=possible.find(c=>c.dmgType==='heal'||c.attackKind==='heal');
  const others=possible.filter(c=>c!==healer&&c.dmgType!=='heal'&&c.attackKind!=='heal').slice(0,7);
  const chosen=[healer,...others].map(c=>give(m,ps,c.chessId,'board',parseKey(legalTileFor(m,ps,c.chessId))));
  for(const c of incoming)give(m,ps,c.chessId,'hand');
  ps.recompute();return {m,ps,chosen};
}
test('ordinary roster proposals cross a two-member activation threshold without source or RNG mutation',()=>{
  const {m,ps,chosen}=setup();
  try {
    const before=prepSignature(m,ps),rng=m.rngBots.state(),options=normalLineupAlternatives(m,ps,chosen);
    assert.ok(options.length>=1&&options.length<=2);
    assert.ok(options.some(o=>o.chosen.filter(p=>m.gd.chess(p.id).bonds.includes('skillfulShip')).length>=2));
    for(const o of options){assert.equal(o.chosen.length,chosen.length);assert.equal(new Set(o.chosen.map(p=>p.uid)).size,chosen.length);
      assert.ok(o.chosen.some(p=>m.gd.chess(p.id).dmgType==='heal'||m.gd.chess(p.id).attackKind==='heal'));}
    assert.equal(prepSignature(m,ps),before);assert.equal(m.rngBots.state(),rng);
  }finally{m.dispose();}
});
test('roster generation respects opt-in, ordinary rounds, budget, and full genuine hand capacity',()=>{
  const {m,ps,chosen}=setup();
  try {
    for(const tactics of ['legacy','risk']){m.botTactics=tactics;assert.deepEqual(normalLineupAlternatives(m,ps,chosen),[]);}
    m.botTactics='roster';m.round=12;assert.deepEqual(normalLineupAlternatives(m,ps,chosen),[]);
    m.round=6;m.botRehearsal=0;assert.deepEqual(normalLineupAlternatives(m,ps,chosen),[]);
    m.botRehearsal=3;ps.hand=ps.hand.map(p=>p||{kind:'item',uid:10000,id:'none'});
    assert.deepEqual(normalLineupAlternatives(m,ps,chosen),[]);
    assert.throws(()=>makeMatch({botTactics:'invalid'}),/BOT_TACTICS/);
  }finally{m.dispose();}
});
test('real Battle rehearsal keeps legal chosen rosters, bounded extra calls, and a reproducible final deployment',()=>{
  const {m,ps}=setup(true);
  try {
    const beforeUids=ps.allChess().map(p=>p.uid).sort((a,b)=>a-b);
    const job=arrange(m,ps,{final:true,defer:true});assert.ok(job);job.run();
    assert.ok(job.metrics.length>=1&&job.metrics.length<=5);
    assert.ok(job.metrics.every(x=>!x.errors&&Number.isFinite(x.score)));
    const alternate=job.plans.find(p=>p.tactical);assert.ok(alternate,'at least one actual different-member trial');
    job.best=alternate;
    const expected=new Set(alternate.chosen.map(p=>p.uid));botPrepEnd(m,ps,job);
    assert.deepEqual(new Set([...ps.board.values()].filter(p=>p.kind==='chess').map(p=>p.uid)),expected);
    assert.deepEqual(ps.allChess().map(p=>p.uid).sort((a,b)=>a-b),beforeUids);
  }finally{m.dispose();}
});

test('the independent risk flag changes ordinary layout choice for free fireballs without enabling macro search',()=>{
  for(const tactics of ['legacy','risk']) {
    const {m,ps,chosen}=setup();
    try {
      m.botTactics=tactics;assert.equal(m.botPlanner,'off');
      const a=planLayout(m,ps,chosen),b=planLayout(m,ps,chosen);b.dirs.set(chosen[0].uid,a.dirs.get(chosen[0].uid)==='UP'?'DOWN':'UP');
      let index=0;
      m.newBattle=()=>{
        const free={enemyKey:'enemy_1177_dufrbl',counted:true,mods:{ultimateType:'FIREPOWER',ultimateRound:6}};
        const leaked=index++===0?[free,free]:[{enemyKey:'enemy_1000_gopro',counted:true}];
        return {finished:false,time:0,errorCount:0,step(){this.finished=true;},forceEnd(){this.finished=true;},
          result(){return {synthetic:false,perPlayer:{[ps.playerId]:{leaked,killed:0}}};}};
      };
      const job=createRehearsal(m,ps,chosen,[a,b]);assert.ok(job);job.run();
      assert.equal(job.best,tactics==='risk'?a:b);assert.equal(job.metrics.length,2);
    }finally{m.dispose();}
  }
});

test('sliced owned-roster proposals equal the one-shot entry and cancellation preserves formal state and RNG',()=>{
  const {m,ps,chosen}=setup();
  try {
    const before=prepSignature(m,ps),rng=m.rngBots.state();
    const expected=normalLineupAlternatives(m,ps,chosen),gen=normalLineupAlternativeSteps(m,ps,chosen);
    let step,count=0;do{step=gen.next();count++;assert.equal(prepSignature(m,ps),before);}while(!step.done);
    assert.ok(count>2);assert.deepEqual(step.value,expected);
    const cancelled=normalLineupAlternativeSteps(m,ps,chosen);assert.equal(cancelled.next().done,false);cancelled.return();
    assert.equal(prepSignature(m,ps),before);assert.equal(m.rngBots.state(),rng);
  }finally{m.dispose();}
});

test('whole and sliced real tactical arrangement choose the same tested roster and legal final board',()=>{
  const execute=sliced=>{
    const {m,ps}=setup(true);
    try {
      const gen=arrangeSteps(m,ps,{final:true,defer:true});let job,yields=0;
      if(sliced){let s;do{s=gen.next();yields++;}while(!s.done);job=s.value;}else job=runSteps(gen);
      assert.ok(job);while(!job.run(sliced?1e-6:Infinity)){}
      const result={best:job.plans.indexOf(job.best),metrics:job.metrics};botPrepEnd(m,ps,job);
      result.state=prepSignature(m,ps);assert.ok(!sliced||yields>10);return result;
    }finally{m.dispose();}
  };
  assert.deepEqual(execute(true),execute(false));
});

test('extra owned-roster proposals do not advance formal RNG or change original layout candidates',()=>{
  const inspect=tactics=>{
    const {m,ps}=setup(true);
    try {
      m.botTactics=tactics;
      const job=arrange(m,ps,{final:true,defer:true});
      assert.ok(job);
      const signature=plan=>[...plan].map(([uid,at])=>[uid,at,plan.dirs.get(uid)]);
      const layouts=job.plans.filter(p=>!p.tactical).map(signature);
      const extra=job.plans.filter(p=>p.tactical).length;
      job.run();
      return {rng:m.rngBots.state(),layouts,extra};
    }finally{m.dispose();}
  };
  const base=inspect('legacy'),alternate=inspect('roster');
  assert.ok(alternate.extra>0,'actually constructed and tested a different-member candidate');
  assert.deepEqual(alternate.layouts,base.layouts);
  assert.equal(alternate.rng,base.rng,'unselected extra planning must not perturb the next teammate');
});
