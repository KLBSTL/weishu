import {test} from 'node:test';
import assert from 'node:assert/strict';
import {botPickBand} from '../../server/match/bot.js';
import {makeMatch,give,legalTileFor} from './harness.js';
import {parseKey} from '../../server/match/board.js';

function fixture() {
  const h=makeMatch({mode:'coop',difficulty:'ABYSS',humans:0,bots:2,fake:true,seed:18501,banConfig:{hardCore:0,softCore:3,addon:5}}),m=h.m,ps=m.order[0];
  let draws=0;
  m.rngBots=()=>{draws++;return 0;};m.bandTaken=()=>false;
  return {m,ps,draws:()=>draws};
}
test('random pool filtering retains a reachable Sargon specialty and its real activation',()=>{
  const {m,ps,draws}=fixture();
  try {
    assert.ok(m.disabledBonds.includes('sargonShip'),'known development counterexample');
    assert.ok([...m.pool.entries].some(([id,e])=>e.left>0&&m.gd.chess(id).bonds.includes('sargonShip')));
    m.gd.bandIds=()=>['band_narant','band_chiave'];
    m.disabledBonds=['sargonShip'];
    assert.equal(botPickBand(m,ps),'band_narant');assert.equal(draws(),1);
    const members=[...m.pool.entries].filter(([id,e])=>e.left>0&&m.gd.chess(id).bonds.includes('sargonShip'));
    assert.ok(members.length>=m.gd.bond('sargonShip').thresholds[0]);
    for(const[id]of members.slice(0,m.gd.bond('sargonShip').thresholds[0]))give(m,ps,id,'board',parseKey(legalTileFor(m,ps,id)));
    ps.recompute();assert.equal(ps.bonds.sargonShip.active,true,'drawn pool labels are not static mode exclusions');
  }finally{m.dispose();}
});
test('a generic-benefit banned squad remains a legal fallback without a reachable specialty',()=>{
  const {m,ps,draws}=fixture();
  try {
    m.gd.bandIds=()=>['band_narant'];m.disabledBonds=['sargonShip'];
    assert.equal(botPickBand(m,ps),'band_narant');assert.equal(draws(),1);
    m.gd.modeInactiveBonds.add('sargonShip');
    assert.equal(botPickBand(m,ps),m.gd.defaultBandId);assert.equal(draws(),2);
  }finally{m.dispose();}
});
test('multi-core bands retain stock checks and teammate exclusion without treating drawn labels as inactive',()=>{
  const {m,ps}=fixture();
  try {
    m.gd.bandIds=()=>['band_narant','band_chiave'];
    const original=m.gd.bandBondIds.bind(m.gd);
    m.gd.bandBondIds=id=>id==='band_narant'?['sargonShip','columbiaShip']:original(id);
    m.disabledBonds=['sargonShip'];
    for(const[id,e]of m.pool.entries)if(m.gd.chess(id)?.bonds.includes('columbiaShip'))e.left=0;
    assert.equal(botPickBand(m,ps),'band_narant');
    m.disabledBonds=['columbiaShip'];
    assert.equal(botPickBand(m,ps),'band_narant','a second unbanned reachable core is sufficient');
    m.bandTaken=id=>id==='band_narant';
    assert.equal(botPickBand(m,ps),'band_chiave');
  }finally{m.dispose();}
});
test('an inactive dedicated recruitment mechanic remains excluded in fallback',()=>{
  const {m,ps}=fixture();
  try {
    m.gd.bandIds=()=>['band_narant','band_bldsk'];m.disabledBonds=['sargonShip'];
    m.recruitmentBandOff=id=>id==='band_narant';
    assert.equal(botPickBand(m,ps),'band_bldsk');
  }finally{m.dispose();}
});
