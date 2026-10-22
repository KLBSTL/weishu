import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,give,legalTileFor} from './harness.js';
import {parseKey} from '../../server/match/board.js';
import {botPrep,levelUp,botPickBand} from '../../server/match/bot.js';
import {playbookPlan,playbookTrade,playbookCycleQuote,playbookPurchaseGrowth,playbookRetention,
  playbookAcquisition,playbookMerchant,pickPlaybookBand} from '../../server/match/botPlaybooks.js';
import {observePrepTransactions} from '../../tools/lib/playbook-observation.mjs';
function setup(book,round=7) {
  const h=makeMatch({mode:'solo',humans:1,difficulty:'ABYSS',fake:true,seed:91,botPlaybook:book}).start().toPrep(1);
  const {m}=h,ps=h.ps('p_0');
  ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.layers={};ps.counters={};ps.funds=30;ps.lp=40;
  m.pool.entries=new Map(m.gd.visibleChess.map(id=>[id,{tier:m.gd.tierOf(id),left:100,cap:100}]));
  m.round=round;ps.bandId=book==='yan'?'band_duyaoy':'band_chiave';ps.recompute();return {m,ps};
}
function put(m,ps,id,{elite=false,board=true}={}) {
  id=elite?ps.gd.goldenIdOf(id):id;
  return give(m,ps,id,board?'board':'hand',board?parseKey(legalTileFor(m,ps,id)):null);
}
const snapshot=(m,ps)=>JSON.stringify({board:[...ps.board],hand:ps.hand,temp:ps.temp,round:ps.round,shop:ps.shop,
  counters:ps.counters,layers:ps.layers,funds:ps.funds,pool:[...m.pool.entries],
  rng:['rngShop','rngBots','rngMeta'].map(k=>m[k].state())});
function yan(m,ps,{dusk=true}={}) {
  for(const id of ['chess_char_1_03_a','chess_char_2_04_a','chess_char_3_04_a'])put(m,ps,id);
  if(dusk)put(m,ps,'chess_char_5_12_a');
}
const offer=(ps,id)=>{ps.shop.slots=[{kind:'chess',id,basePrice:ps.gd.chessPrice(id),sold:false}];};

test('Xiaoman starts a real growth cycle without Dusk or Investor activation; quote and actual handlers agree',()=>{
  const {m,ps}=setup('yan',5);
  try {
    yan(m,ps,{dusk:false});assert.equal(ps.bonds.investShip.active,false);
    assert.equal(playbookPlan(m,ps).phase,'growth');assert.equal(playbookPurchaseGrowth(m,ps).gains.yanShip,1);
    offer(ps,'chess_char_1_07_a');const ledger={};observePrepTransactions(m,ledger,{enabled:true});
    const before=snapshot(m,ps),q=playbookCycleQuote(m,ps,0);
    assert.equal(q.gains.yanShip,1);assert.equal(q.netCost,1);assert.equal(snapshot(m,ps),before);
    assert.deepEqual(playbookCycleQuote(m,ps,0),q);
    assert.equal(ledger.transactions.length,0,'sampled validation does not become a formal trade record');
    const owned=new Set(ps.allChess().map(p=>p.uid));ps.buy(0);ps.sell(ps.allChess().find(p=>!owned.has(p.uid)).uid);
    const layers=ps.layers.yanShip||0;m.dispatch(ps,'onPrepEnd',{round:m.round});
    assert.equal((ps.layers.yanShip||0)-layers,1);
  }finally{m.dispose();}
});

test('Dusk uses independently active Arcane with inactive Yan and zero investors, but refuses capped recipients',()=>{
  const {m,ps}=setup('yan',9);
  try {
    put(m,ps,'chess_char_5_12_a');
    const n=ps.gd.bond('arcaneShip').thresholds[0]-1;
    const ids=ps.gd.visibleChess.filter(id=>ps.gd.chess(id).bonds.includes('arcaneShip')&&!ps.gd.chess(id).bonds.includes('yanShip'));
    for(const id of ids.slice(0,n))put(m,ps,id);
    assert.equal(ps.bonds.yanShip.active,false);assert.equal(ps.bonds.arcaneShip.active,true);
    assert.ok(playbookPurchaseGrowth(m,ps).gains.arcaneShip>0);assert.equal(playbookTrade(m,ps,'chess_char_1_07_a',2),true);
    ps.layers.arcaneShip=999;ps.recompute();assert.equal(playbookTrade(m,ps,'chess_char_1_07_a',2),false);
  }finally{m.dispose();}
});

test('positive final-prep acquisition effects remain available in R12, R13 and boss prep without three investors',()=>{
  for(const r of [12,13,14]) {
    const {m,ps}=setup('yan',r);
    try {
      yan(m,ps);offer(ps,'chess_char_1_07_a');
      assert.equal(playbookTrade(m,ps,'chess_char_1_07_a',2),true);
      assert.equal(playbookCycleQuote(m,ps,0).gains.yanShip,3);
      assert.equal(playbookPlan(m,ps).investors,1);
    }finally{m.dispose();}
  }
});

test('cycle validation rejects full hands and merging candidates, preserves source and cannot conjure refunds',()=>{
  const {m,ps}=setup('yan');
  try {
    yan(m,ps);offer(ps,'chess_char_1_07_a');
    put(m,ps,'chess_char_1_07_a',{board:false});put(m,ps,'chess_char_1_07_a',{board:false});
    let before=snapshot(m,ps);assert.equal(playbookCycleQuote(m,ps,0),null);assert.equal(snapshot(m,ps),before);
    offer(ps,'chess_char_1_08_a');
    while(ps.hand.some(p=>!p))put(m,ps,'chess_char_1_10_a',{board:false});
    before=snapshot(m,ps);assert.equal(playbookCycleQuote(m,ps,0),null);assert.equal(snapshot(m,ps),before);
  }finally{m.dispose();}
});

test('an elite Lapland starts a two-round operating window; transition advances at most one tier per formal prep',()=>{
  const {m,ps}=setup('siracusa',5);
  try {
    for(const id of ['chess_char_2_16_a','chess_char_1_07_a','chess_char_1_08_a'])put(m,ps,id,{elite:true});
    ps.shop.level=2;ps.shop.upgradePrice=0;
    assert.equal(playbookPlan(m,ps).phase,'reroll');assert.equal(ps._botPlaybook.readyRound,5);levelUp(m,ps);assert.equal(ps.shop.level,2);
    m.round=6;levelUp(m,ps,{spare:true});assert.equal(ps.shop.level,2);
    for(const [r,expected]of [[7,3],[8,4],[9,5],[10,6]]) {
      m.round=r;ps.shop.upgradePrice=0;ps.funds=100;levelUp(m,ps);levelUp(m,ps,{spare:true});
      assert.equal(ps.shop.level,expected);
    }
  }finally{m.dispose();}
});

test('one ordinary bench Lapland keeps its real +4 beside an elite; spare Texas sale remains legal during transition',()=>{
  const {m,ps}=setup('siracusa',9);
  try {
    for(const id of ['chess_char_2_16_a','chess_char_1_07_a','chess_char_1_08_a'])put(m,ps,id,{elite:true});
    ps.shop.level=2;
    assert.ok(playbookAcquisition(m,ps,'chess_char_2_16_a')>0);
    const lap=put(m,ps,'chess_char_2_16_a',{board:false}),texas=put(m,ps,'chess_char_1_08_a',{board:false});
    assert.equal(playbookPlan(m,ps).phase,'transition');assert.ok(playbookRetention(m,ps,lap)>0);
    assert.equal(playbookMerchant(m,ps).uid,texas.uid);
    const layers=ps.layers.siracusaShip||0;ps.refresh();assert.equal((ps.layers.siracusaShip||0)-layers,12);
    const extra=put(m,ps,'chess_char_2_16_a',{board:false});assert.equal(playbookRetention(m,ps,extra),0);
    ps.sell(texas.uid);assert.equal(ps.bonds.siracusaShip.active,true);
  }finally{m.dispose();}
});

test('recipe-first selection does not double a recipe weight for two band aliases and uses one RNG draw',()=>{
  const {m,ps}=setup('auto');
  try {
    const bands=['band_chiave','band_jesica','band_duyaoy','band_dusk'];
    const count={siracusa:0,kjerag:0,yan:0};
    for(let i=0;i<300;i++) {
      const band=pickPlaybookBand(m,bands,(i+.5)/300);
      count[band==='band_chiave'?'siracusa':band==='band_jesica'?'kjerag':'yan']++;
    }
    assert.deepEqual(count,{siracusa:100,kjerag:100,yan:100});
    m.gd.bandIds=()=>bands;m.bandTaken=()=>false;m.botPlaybookSelector='recipe';let draws=0;
    m.rngBots=()=>{draws++;return .5;};assert.ok(bands.includes(botPickBand(m,ps)));assert.equal(draws,1);
    assert.throws(()=>makeMatch({mode:'solo',botPlaybookSelector:'bad'}),/BOT_PLAYBOOK_SELECTOR/);
  }finally{m.dispose();}
});

test('a real full prep can acquire missing recovery; optional transaction observations preserve all formal state',()=>{
  function run(trace){
    const {m,ps}=setup('yan',7);
    try {
      ps.shop.level=5;ps.shop.upgradePrice=100;
      const ids=ps.gd.visibleChess.filter(id=>ps.gd.tierOf(id)===6&&!['heal'].includes(ps.gd.chess(id).attackKind)&&ps.gd.chess(id).dmgType!=='heal');
      for(const id of ids.slice(0,8))put(m,ps,id);
      const heal=ps.gd.visibleChess.find(id=>ps.gd.tierOf(id)<=2&&(ps.gd.chess(id).attackKind==='heal'||ps.gd.chess(id).dmgType==='heal'));
      assert.ok(heal);offer(ps,heal);ps.funds=ps.priceOf(ps.shop.slots[0]);
      const rec={};observePrepTransactions(m,rec,{enabled:trace});botPrep(m,ps);
      assert.ok(ps.allChess().some(p=>p.id===heal));
      if(trace)assert.ok(rec.transactions.some(t=>t.action==='buy'&&t.id===heal&&t.ok));
      return snapshot(m,ps);
    }finally{m.dispose();}
  }
  assert.equal(run(false),run(true));
});
