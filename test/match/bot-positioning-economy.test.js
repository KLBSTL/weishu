import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planLayout, rangeTiles, bondPlan, levelUp, arrange, fieldModel, botPickBand} from '../../server/match/bot.js';
import {makeMatch, give, DATA, checkInvariants} from './harness.js';
import {observeBotBoard} from '../../tools/botbench-positioning.mjs';

const normal=name=>Object.values(DATA.chess).find(c=>c.name===name&&!c.isGolden);
function layoutFixture({tiles,records,route=['10,9','10,8','10,7']}){
  const routes=[{n:10,fly:false,tiles:route,tileTime:2,hp:100}];
  const ground=new Map(route.map((key,i)=>[key,{flow:10,prog:i/(route.length-1)}]));
  const gd={chess:id=>records[id],garrison:()=>null};
  const m={round:6,stageId:'fixture',wave:{templateId:'lane'},gd,rngBots:()=>0.5,
    _botPath:{key:'6|fixture|lane|',routes,ground,airflow:new Map(),armor:[]}};
  const ps={gd,deployMap:()=>new Map(tiles)};
  const pieces=Object.keys(records).map((id,i)=>({id,kind:'chess',uid:i+1,items:[]}));
  return{m,ps,pieces};
}
const fighter={chessId:'strong',position:'MELEE',attackKind:'melee',dmgType:'phys',stats:{atk:1e12,bat:1,aspd:100,blockCnt:3},rangeGrid:[[0,0],[0,1],[0,-1]]};
const shooter={chessId:'weak',position:'RANGED',attackKind:'ranged',dmgType:'phys',stats:{atk:100,bat:1,aspd:100},rangeGrid:[[0,1],[0,2]]};
const medic={chessId:'medic',position:'RANGED',attackKind:'heal',dmgType:'heal',stats:{atk:200,bat:2.8,aspd:100},rangeGrid:[[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1],[-1,2],[0,2],[1,2]]};

test('saturated army damage cannot leave a second shooter facing an empty lane',()=>{
  const f=layoutFixture({tiles:[['10,8','melee'],['9,8','ranged']],records:{strong:fighter,weak:shooter}});
  const p=planLayout(f.m,f.ps,f.pieces),tile=p.get(2).split(',').map(Number);
  const covered=rangeTiles(shooter,...tile,p.dirOf(2));
  assert.ok(covered.some(k=>f.m._botPath.ground.has(k)),`shooter ${p.get(2)} ${p.dirOf(2)} must reach enemies`);
});

test('a zero estimated DPS after boss capping still keeps an able attacker facing a target',()=>{
  const f=layoutFixture({tiles:[['10,8','melee'],['9,8','ranged']],records:{strong:fighter,weak:{...shooter,_botDps:0}}});
  const p=planLayout(f.m,f.ps,f.pieces);
  assert.ok(rangeTiles(shooter,...p.get(2).split(',').map(Number),p.dirOf(2)).some(k=>f.m._botPath.ground.has(k)));
});

test('medic treats the front blocker from a safe rear high tile even after kill scores saturate',()=>{
  const f=layoutFixture({tiles:[['10,8','melee'],['11,9','ranged'],['9,6','ranged']],records:{strong:fighter,medic}});
  const p=planLayout(f.m,f.ps,f.pieces);
  assert.equal(p.get(2),'9,6','rear cover exists, so do not stand ahead of the blocker');
  assert.ok(rangeTiles(medic,...p.get(2).split(',').map(Number),p.dirOf(2)).includes(p.get(1)));
});

test('a medic facing allies still has value when the squad has no ground blocker',()=>{
  const f=layoutFixture({tiles:[['10,8','ranged'],['9,8','ranged']],records:{strong:{...fighter,position:'RANGED',stats:{...fighter.stats,blockCnt:0}},medic}});
  const p=planLayout(f.m,f.ps,f.pieces);
  assert.ok(rangeTiles(medic,...p.get(2).split(',').map(Number),p.dirOf(2)).includes(p.get(1)));
});

test('rear safety follows a reversed enemy route instead of always choosing the left edge',()=>{
  const f=layoutFixture({tiles:[['10,8','melee'],['11,7','ranged'],['9,9','ranged']],records:{strong:fighter,medic},route:['10,7','10,8','10,9']});
  const p=planLayout(f.m,f.ps,f.pieces);
  assert.equal(p.get(2),'9,9');
  assert.ok(rangeTiles(medic,...p.get(2).split(',').map(Number),p.dirOf(2)).includes(p.get(1)));
});

test('the medic keeps a functional rear slot before a shooter can occupy it',()=>{
  const f=layoutFixture({tiles:[['10,8','melee'],['11,9','ranged'],['9,6','ranged']],
    records:{strong:fighter,weak:{...shooter,rangeGrid:[[1,1],[1,2],[1,3]]},medic}});
  const p=planLayout(f.m,f.ps,f.pieces);
  assert.equal(p.get(3),'9,6');
  const cover=rangeTiles(f.m.gd.chess('weak'),...p.get(2).split(',').map(Number),p.dirOf(2));
  assert.ok(cover.some(k=>f.m._botPath.ground.has(k)),'the other shooter remains useful');
});

test('a useful exposed tile is retained when no protected healing tile exists',()=>{
  const f=layoutFixture({tiles:[['10,8','melee'],['9,9','ranged']],records:{strong:fighter,medic}});
  const p=planLayout(f.m,f.ps,f.pieces);
  assert.equal(p.size,2);
  assert.ok(rangeTiles(medic,...p.get(2).split(',').map(Number),p.dirOf(2)).includes(p.get(1)));
});

test('Chiave starts toward Siracusa, and a few early Laterano purchases do not replace that specialty',()=>{
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',seed:42,fake:true}).start().toPrep(1),m=h.m,ps=m.order[0];
  ps.bandId='band_chiave';
  assert.equal(bondPlan(m,ps).focus,'siracusaShip','choose the band plan before owning its first member');
  const foreign=Object.values(DATA.chess).filter(c=>c.visible&&!c.isGolden&&c.bonds.includes('lateranoShip')).slice(0,3);
  assert.equal(foreign.length,3);
  foreign.forEach((c,i)=>give(m,ps,c.chessId,'hand',i));
  ps._botFocus=null;ps._botFocusId='lateranoShip';
  assert.equal(bondPlan(m,ps).focus,'siracusaShip');
  checkInvariants(m);m.dispose();
});

test('a disabled specialty is never forced by the band',()=>{
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',fake:true}).start().toPrep(1),m=h.m,ps=m.order[0];
  ps.bandId='band_chiave';m.gd.modeInactiveBonds.add('siracusaShip');
  const c=Object.values(DATA.chess).find(c=>c.visible&&!c.isGolden&&c.bonds.includes('lateranoShip'));
  give(m,ps,c.chessId,'hand',0);
  assert.equal(bondPlan(m,ps).focus,'lateranoShip');m.dispose();
});

test('an exhausted specialty that cannot reach its first threshold allows a different core',()=>{
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',fake:true}).start().toPrep(1),m=h.m,ps=m.order[0];
  ps.bandId='band_chiave';
  for(const[id,e]of m.pool.entries)if(m.gd.chess(id)?.bonds?.includes('siracusaShip'))e.left=0;
  const c=Object.values(DATA.chess).find(c=>c.visible&&!c.isGolden&&c.bonds.includes('lateranoShip'));
  give(m,ps,c.chessId,'hand',0);
  assert.equal(bondPlan(m,ps).focus,'lateranoShip');m.dispose();
});

test('band selection rejects a core with no recruitable members instead of planning a foreign army',()=>{
  const h=makeMatch({mode:'coop',difficulty:'ABYSS',humans:0,bots:1,fake:true}).start().toPrep(1),m=h.m,ps=m.order[0];
  m.gd.bandIds=()=>['band_clementia','band_chiave'];m.rngBots=()=>0;
  assert.equal([...m.pool.entries].filter(([id,e])=>e.left>0&&m.gd.chess(id)?.bonds.includes('egirShip')).length,0);
  assert.equal(botPickBand(m,ps),'band_chiave');m.dispose();
});

test('actual boss left and right boards keep legal tiles and a heading that can reach the public wave',()=>{
  const h=makeMatch({mode:'coop',difficulty:'ABYSS',humans:2,bots:0,fake:true,seed:91}).start().toPrep(1),m=h.m;
  m.disabledBonds=[];m.bannedChess=[];m.round=m.gd.bossRound;m.bossId='boss_1';m.wave=null;m._planBossWaves();
  for(const ps of m.order){
    ps.invalidateDeployMap();ps.recompute();
    const p=give(m,ps,normal('隐现').chessId,'hand',0);
    arrange(m,ps);
    const loc=ps.find(p.uid);assert.equal(loc.area,'board');
    const rec=ps.gd.chess(p.id),model=fieldModel(m,ps),at=loc.key.split(',').map(Number);
    const reaches=dir=>{const cover=new Set(rangeTiles(rec,...at,dir));return model.routes.some(rt=>(!rt.fly||rec.canHitFly)&&rt.tiles.some(k=>cover.has(k)));};
    assert.ok(reaches(loc.piece.dir),`${ps.playerId} ${loc.key} ${loc.piece.dir}`);
    assert.ok(ps.deployMap().has(loc.key));
  }
  checkInvariants(m);m.dispose();
});

test('a stable six-unit board upgrades at R6 before discretionary refreshes',()=>{
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',fake:true}).start().toPrep(1),m=h.m,ps=m.order[0];
  m.round=6;ps.bandId='band_bldsk';ps.shop.level=3;ps.shop.upgradePrice=6;ps.funds=9;
  for(const[name,i]of ['角峰','古米','隐现','惊蛰','赫默','格雷伊'].map((n,i)=>[n,i]))give(m,ps,normal(name).chessId,'hand',i);
  levelUp(m,ps);assert.equal(ps.shop.level,4);assert.equal(ps.funds,3);
  checkInvariants(m);m.dispose();
});

test('two stranded units do not spend their last purchasing funds on a paid upgrade',()=>{
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',fake:true}).start().toPrep(1),m=h.m,ps=m.order[0];
  m.round=6;ps.bandId='band_bldsk';ps.shop.level=2;ps.shop.upgradePrice=6;ps.funds=8;
  give(m,ps,normal('角峰').chessId,'hand',0);give(m,ps,normal('隐现').chessId,'hand',1);
  levelUp(m,ps);assert.equal(ps.shop.level,2);assert.equal(ps.funds,8);m.dispose();
});

test('board diagnostics do not consume RNG, spend funds or alter the prepared lineup',()=>{
  const h=makeMatch({mode:'solo',difficulty:'ABYSS',fake:true}).start().toPrep(1),m=h.m,ps=m.order[0];
  for(const[name,i]of ['角峰','隐现','赫默'].map((n,i)=>[n,i]))give(m,ps,normal(name).chessId,'hand',i);
  arrange(m,ps);
  const snapshot=()=>JSON.stringify({board:[...ps.board],hand:ps.hand,funds:ps.funds,layers:ps.layers,
    bots:m.rngBots.state(),meta:m.rngMeta.state(),shop:m.rngShop.state(),waves:m.rngWaves.state()});
  const before=snapshot(),result=observeBotBoard(m,ps);
  assert.equal(snapshot(),before);assert.equal(result.healers,1);assert.equal(result.uncoveredHealers,0);
  assert.equal(result.wrongFacing,0);m.dispose();
});
