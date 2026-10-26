import {test} from 'node:test';import assert from 'node:assert/strict';
import {DATA,makeMatch,give} from '../match/harness.js';
import {GameData} from '../../server/match/gamedata.js';import {SharedPool} from '../../server/match/pool.js';
import {diyRecord} from '../../shared/diy.js';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('all natural identities, aliases and four-tier Recorder price/stock have one regular identity',()=>{
  const expected={谬因:['columbiaShip'],伊芙利特:['sarkazShip'],号角:['victoriaShip','steadShip'],
    锡人:['swiftShip','columbiaShip','investShip'],菲莱:['sargonShip','steadShip'],录武官:['yanShip','miraShip']};
  for(const c of Object.values(DATA.chess))if(expected[c.name])assert.deepEqual(c.bonds,expected[c.name],c.chessId);
  const copies=Object.values(DATA.chess).filter(c=>c.name==='录武官'&&c.visible&&!c.isGolden);
  assert.equal(copies.length,1);const c=copies[0];assert.equal(c.chessId,'chess_char_5_23_a');
  for(const id of [c.chessId,c.goldenId]) {
    assert.equal(DATA.chess[id].tier,4);assert.equal(DATA.chess[id].price,3);assert.equal(DATA.chess[id].sellPrice,1);
    assert.deepEqual(DATA.chess[id].status,DATA.chess[id.replace('5_23','4_15')].status);
  }
  const gd=new GameData(DATA,'mode_single_hard'),pool=new SharedPool(gd);
  assert.equal(pool.cap(c.chessId),16);assert.equal(pool.has('chess_char_4_15_a'),false);
  const onlyRecorder=id=>id===c.chessId;
  assert.equal(pool.roll(()=>0,{maxTier:3,filter:onlyRecorder}),null);
  assert.equal(pool.roll(()=>0,{maxTier:4,filter:onlyRecorder}),c.chessId);
  assert.equal([...pool.entries.keys()].filter(id=>DATA.chess[id].name==='录武官').length,1);
  assert.equal(Object.values(DATA.chess).filter(x=>x.visible&&!x.isGolden&&x.bonds.includes('egirShip')).length,10);
});

test('legacy Recorder, Nymph, Ptilopsis and Tin Man aliases never double-count any shared Alliance',()=>{
  for(const [old,canonical]of [['4_15','5_23'],['6_10','5_22'],['5_16','4_21'],['1_16','2_19']]) {
    const h=makeMatch({mode:'solo',fake:true}).start().toPrep(1),m=h.m,p=m.order[0];
    p.board.clear();p.hand.fill(null);p.temp.fill(null);p.bandId=null;p.bondCountBonus={};
    give(m,p,`chess_char_${old}_a`,'board',[10,3]);give(m,p,`chess_char_${canonical}_b`,'board',[10,4]);p.recompute();
    for(const bond of DATA.chess[`chess_char_${canonical}_a`].bonds)assert.equal(p.bonds[bond].count,1,`${old}/${canonical}/${bond}`);
    m.dispose();
  }
});

test('Clemens becomes a single formal five-tier Aegir identity and is no longer selectable',()=>{
  for(const tier of [5,6])for(const elite of [false,true]) {
    const c=diyRecord(`chess_char_${tier}_diy1_a`,{charId:'char_4231_clemnt',skillIndex:0,uniEquipId:null},{data:DATA,elite});
    assert.equal(c,null);
  }
  assert.equal(Object.values(DATA.chess).filter(c=>c.charId==='char_4231_clemnt'&&c.visible).length,2);
});

test('Hoshiguma scales HP/DEF only, with active Yan; Jian and Harold retain their shared old traits',()=>{
  for(const form of ['a','b'])for(const active of [false,true]) {
    const id=`chess_char_4_17_${form}`,h=makeBattle({units:[{chessId:'probe',row:10,col:4}],autoFinish:false,
      defs:{chess:{probe:{...chessRec({id:'probe',bonds:[],skill:null,stats:{atk:1000,maxHp:10000,def:1000}}),garrisonIds:DATA.chess[id].garrisonIds}}},
      bonds:{yanShip:{active,count:active?3:0,tier:active?1:0,layers:600}}}).step(),u=h.unit('probe'),n=form==='a'?2:4;
    near(u.s.maxHp,u.base.maxHp*(active?1+n:1));near(u.s.def,u.base.def*(active?1+n:1));
    near(u.s.atk,u.base.atk);
    assert.ok(!DATA.chess[id].garrisonIds.includes(`garrison_65_${form}`));
    assert.ok(DATA.chess[`chess_char_6_19_${form}`].garrisonIds.includes(`garrison_65_${form}`));
    assert.ok(DATA.chess[`chess_char_2_05_${form}`].garrisonIds.includes(`garrison_09_${form}`));
    assert.deepEqual(h.b.errors,[]);
  }
});

test('Rosmontis fixed HP/ATK applies once; only active core sums add independent damage',()=>{
  for(const form of ['a','b']) {
    const id=`chess_char_6_12_${form}`,h=makeBattle({units:[{chessId:'probe',row:10,col:4}],autoFinish:false,
      defs:{chess:{probe:{...chessRec({id:'probe',bonds:[],skill:null,stats:{atk:1000,maxHp:10000,def:1000}}),garrisonIds:DATA.chess[id].garrisonIds}}},
      bonds:Object.fromEntries([['sarkazShip',300,true],['columbiaShip',300,true],['yanShip',999,false],['preciShip',999,true]]
        .map(([k,layers,active])=>[k,{count:active?3:0,tier:active?1:0,layers,active}]))}).step(),u=h.unit('probe');
    near(u.s.atk,u.base.atk*(form==='a'?1.2:1.4));near(u.s.maxHp,u.base.maxHp*(form==='a'?1.2:1.4));
    near(u.s.dmgDealtMul,form==='a'?3:5);assert.deepEqual(h.b.errors,[]);
  }
});

test('two owners keep Columbia snapshots/cooldowns and Sarkaz cast recipients isolated',()=>{
  const chess={},players=[];
  for(let seat=0;seat<2;seat++) {
    const units=[];for(let i=0;i<6;i++) {
      const id=`own_${seat}_${i}`;chess[id]=chessRec({id,bonds:['sarkazShip','columbiaShip'],skill:null,stats:{atk:seat?9000:1000,maxHp:1e5,def:0}});
      units.push({uid:seat*10+i+1,kind:'chess',chessId:id,row:seat?11:10,col:i+2});
    }
    players.push({playerId:`p${seat+1}`,seat,side:'L',colOffset:0,units,
      bonds:{sarkazShip:{active:true,count:6,tier:2,layers:0},columbiaShip:{active:true,count:6,tier:2,layers:0}}});
  }
  const h=makeBattle({players,defs:{chess,enemies:{dummy:enemyRec({key:'dummy',hp:1e8,def:0,res:0,speed:0})}},autoFinish:false}).step();
  const a=h.unit('own_0_0'),b=h.unit('own_1_0'),e=h.spawn('dummy',{pos:[7,9]}),seen=[];
  h.b.on('damaged',c=>{if(c.dmg?.tags?.includes('bond:columbia:burst'))seen.push(c);});
  const bAtk=b.s.atk;h.b.emit('skillStart',{unit:a});near(b.s.atk,bAtk);assert.equal(b.findBuff('bond:sarkaz:barrier'),null);
  const expected=h.b.allyUnits.filter(u=>u.kind==='op'&&u.ownerId===a.ownerId).reduce((n,u)=>n+u.s.atk,0)*2;
  h.b.dealDamage(a,e,{amount:1,type:'arts',isAttack:true});h.step();assert.equal(seen.length,1);near(seen[0].amount,expected);
  h.b.dealDamage(b,e,{amount:1,type:'arts',isAttack:true});h.step();assert.equal(seen.length,2);
  assert.deepEqual(h.b.errors,[]);
});
