import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemyContent from '../../server/sim/content/enemies.js';

test('Visiting Group Shieldguard grows by time outside heaters, not by taking damage, and caps at ten layers', () => {
  const h=makeBattle({content:'generic',extraContent:[enemyContent],autoFinish:false,timeLimit:100,
    defs:{chess:{wall:chessRec({id:'wall',profession:'TANK',stats:{maxHp:1e9,atk:0,blockCnt:3},skill:null})}},
    kits:{wall:()=>({trait:{noAttack:true}})},units:[{chessId:'wall',row:10,col:5}],
    enemies:[{key:'enemy_1387_winshd',pos:[10,5.2]}]});
  h.step();const e=h.enemies()[0],base=e.base.def,baseRes=e.base.res;
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ~= ${b}`);
  near(e.s.def,base);near(e.s.res,baseRes);
  for(let i=0;i<8;i++)h.b.dealDamage(null,e,{amount:1,type:'true'});
  near(e.s.def,base);near(e.s.res,baseRes);
  h.run(2.8);near(e.s.def,base);
  h.run(.3);near(e.s.def,base*1.1);near(e.s.res,baseRes+5);
  h.run(35);assert.ok(e.alive);near(e.s.def,base*2);near(e.s.res,baseRes+50);
  h.run(12);near(e.s.def,base*2);near(e.s.res,baseRes+50);
  assert.equal(h.b.errors.length,0);
});
