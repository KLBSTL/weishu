import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATA} from './harness.js';
import {GameData} from '../../server/match/gamedata.js';
import {validateClientResult} from '../../server/match/fields.js';
import {buildBattleSpec,createBattleFromSpec,compactResult,fitResult} from '../../server/sim/spec.js';
import {getDefaultSource} from '../../server/sim/simdata.js';
import {spawnChildren} from '../../server/sim/content/enemies/helpers.js';
const mods={ultimateType:'FIREPOWER',ultimateRound:6,atkMul:1.2};
const base={kind:'normal',round:6,modeId:'mode_single_abyss',seed:19,timeLimit:1,stageId:'act2autochess_m04',
  routes:[{motion:'WALK',start:[12,10],end:[12,2],checkpoints:[]}],players:[{playerId:'p1',side:'L',units:[]}]};
const gd=new GameData(DATA,'mode_single_abyss');
test('client normalization restores scoped derived fireball provenance and zero LPR from genuine parent mods',()=>{
  const spec=buildBattleSpec({...base,spawns:[{enemyKey:'enemy_1176_dusocr',time:0,routeIndex:0,count:1,mods}]});
  const b=createBattleFromSpec(spec,getDefaultSource(),{quiet:true});b.autoFinish=false;b.step();
  const [ball]=spawnChildren(b,b.enemies[0],'enemy_1177_dufrbl',1);b.leak(ball);
  while(!b.finished)b.step();const result=validateClientResult(spec,compactResult(b.result()),{gd});
  assert.equal(result.ok,true,result.reason);const leak=result.result.perPlayer.p1.leaked.find(l=>l.enemyKey==='enemy_1177_dufrbl');
  assert.equal(leak.lpr,0);assert.equal(leak.mods.ultimateType,'FIREPOWER');
  const fitted=validateClientResult(spec,fitResult(compactResult(b.result()),{budget:1}),{gd});
  assert.equal(fitted.ok,true,fitted.reason);
  assert.equal(fitted.result.perPlayer.p1.leaked.find(l=>l.enemyKey==='enemy_1177_dufrbl').lpr,0);
});
test('client compact/validation preserves the free-LP provenance of timed-out unite re-entries',()=>{
  const spec=buildBattleSpec({...base,kind:'unite',spawns:[{enemyKey:'enemy_1177_dufrbl',time:5,routeIndex:0,count:1,mods,sourcePlayerId:'p1'}]});
  const b=createBattleFromSpec(spec,getDefaultSource(),{quiet:true});b.autoFinish=false;while(!b.finished)b.step();
  const result=validateClientResult(spec,compactResult(b.result()),{gd});assert.equal(result.ok,true,result.reason);
  assert.equal(result.result.unspawned[0].mods.ultimateType,'FIREPOWER');
});
