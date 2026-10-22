import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch, give, giveItem, legalTileFor} from './harness.js';
import {parseKey} from '../../server/match/board.js';
import {botPickBand, bondPlan, levelUp, itemTarget, botPrep, prepLineupDiagnostic} from '../../server/match/bot.js';
import {playbookPlan, playbookFeasible, playbookRetention, playbookAcquisition, playbookModuleTarget,
  playbookTrade, recordPlaybookTrade, playbookMerchant} from '../../server/match/botPlaybooks.js';
import {forkPrep} from '../../server/match/botEnvironment.js';

function fixture(id, band = {siracusa:'band_chiave', yan:'band_duyaoy', kjerag:'band_jesica'}[id]) {
  const h = makeMatch({mode:'solo', humans:1, difficulty:'ABYSS', fake:true, seed:91, botPlaybook:id}).start().toPrep(1);
  const {m} = h, ps = h.ps('p_0');
  for (const p of ps.allChess()) ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.layers = {}; ps.counters = {}; ps.funds = 60;
  m.round = 5; ps.bandId = band; ps.lp = 40;
  m.pool.entries = new Map(m.gd.visibleChess.map(id => [id, {tier:m.gd.tierOf(id), left:100}]));
  ps.recompute();
  return {h,m,ps};
}
function put(m, ps, id, {board=false, elite=false}={}) {
  id = elite ? m.gd.goldenIdOf(id) : id;
  return give(m, ps, id, board ? 'board' : 'hand', board ? parseKey(legalTileFor(m, ps, id)) : null);
}
function fill(m, ps) {
  const ids = m.gd.visibleChess.filter(id => m.gd.tierOf(id) <= 2);
  for (const id of ids.slice(0,6)) put(m, ps, id, {board:true});
}

test('playbooks are independently opt-in; bad options fail and default bond behavior is unchanged', () => {
  const {m,ps} = fixture('off', 'band_chiave');
  try {
    assert.equal(playbookPlan(m,ps),null);
    assert.equal(ps._botPlaybook,undefined);
    assert.equal(bondPlan(m,ps).reason,'specialty-reachable');
    assert.throws(() => makeMatch({mode:'solo',botPlaybook:'invalid'}),/BOT_PLAYBOOK/);
    assert.throws(() => makeMatch({mode:'solo',botPlaybook:'auto',botPlanner:'beam'}),/BOT_PLAYBOOK_PLANNER/);
    assert.throws(() => makeMatch({mode:'solo',botPlaybook:'auto',botPlanner:'team'}),/BOT_PLAYBOOK_PLANNER/);
  } finally {m.dispose();}
});

test('all upgrade paths respect the level-two ceiling, then a latched transition unlocks leveling', () => {
  const {m,ps} = fixture('siracusa');
  try {
    fill(m,ps); ps.shop.level=2; ps.shop.upgradePrice=0;
    levelUp(m,ps); levelUp(m,ps,{spare:true}); assert.equal(ps.shop.level,2);
    ps.shop.upgradePrice=1; ps.funds=100; levelUp(m,ps,{spare:true}); assert.equal(ps.shop.level,2);
    m.round=9; assert.equal(playbookPlan(m,ps).phase,'transition');
    levelUp(m,ps); assert.ok(ps.shop.level>2);
    m.round=5; assert.equal(playbookPlan(m,ps).phase,'transition','exit cannot revert into the reroll loop');
  } finally {m.dispose();}
});

test('elite milestones mark engine readiness while low LP exits immediately', () => {
  for(const low of [false,true]) {
    const {m,ps} = fixture('siracusa');
    try {
      if(low) ps.lp=8;
      else {put(m,ps,'chess_char_2_16_a',{elite:true});put(m,ps,'chess_char_1_07_a',{elite:true});}
      assert.equal(playbookPlan(m,ps).phase,low?'transition':'assemble');
    } finally {m.dispose();}
  }
});

test('surviving multibond core is legal; missing engine abandons; only dedicated recruitment reserves copies', () => {
  const {m,ps} = fixture('siracusa');
  try {
    m.disabledBonds=['siracusaShip']; assert.equal(playbookFeasible(m,ps,'siracusa'),true);
    const id='chess_char_2_16_a'; m.pool.entries.get(id).left=0;
    ps.shop.slots=[{kind:'chess',id,sold:false}]; assert.equal(playbookFeasible(m,ps,'siracusa'),false,'a stale displayed card cannot be bought');
    ps.recruitment.pending={ids:[id]};assert.equal(playbookFeasible(m,ps,'siracusa'),true);
    ps.recruitment.pending=null;assert.equal(playbookPlan(m,ps),null); assert.equal(ps._botPlaybook.abandoned,true);
    m.pool.entries.get(id).left=100; assert.equal(playbookPlan(m,ps),null);
    m.gd.modeInactiveBonds.add('siracusaShip'); assert.equal(playbookFeasible(m,ps,'siracusa'),false);
  } finally {m.dispose();}
});

test('Jessica explicitly selects Kjerag despite its empty natural core tags; squads avoid teammate recipe when possible', () => {
  const {m,ps} = fixture('auto','band_jesica');
  try {
    assert.deepEqual(m.gd.bandBondIds('band_jesica'),[]);
    assert.equal(bondPlan(m,ps).focus,'kjeragShip');
    m.gd.bandIds=()=>['band_jesica']; m.bandTaken=()=>false; assert.equal(botPickBand(m,ps),'band_jesica');
    const mate=Object.create(ps);mate.bandId='band_chiave';m.alivePlayers=()=>[ps,mate];
    m.gd.bandIds=()=>['band_chiave','band_duyaoy']; assert.equal(botPickBand(m,ps),'band_duyaoy');
  } finally {m.dispose();}
});

test('Yan goal is level five by R7; the third investor is a retained acquisition even off board', () => {
  const {m,ps} = fixture('yan');
  try {
    m.round=7; fill(m,ps); ps.shop.level=4; ps.shop.upgradePrice=0;
    const tin=put(m,ps,'chess_char_2_19_a'); put(m,ps,'chess_char_3_04_a');
    const plan=playbookPlan(m,ps); assert.equal(plan.target,5); assert.equal(plan.phase,'assemble');
    assert.ok(playbookRetention(m,ps,tin,plan)>0);
    assert.ok(playbookAcquisition(m,ps,'chess_char_5_17_a',plan)>0);
    levelUp(m,ps); assert.equal(ps.shop.level,5); assert.equal(ps.find(tin.uid).area,'hand');
  } finally {m.dispose();}
});

test('Yan holds level five before Dusk is found; full lineup selection fields the reachable core and Dusk', () => {
  const {m,ps}=fixture('yan');
  try {
    m.round=9;ps.shop.level=5;ps.shop.upgradePrice=0;
    const gd=ps.gd;
    const strong=gd.visibleChess.filter(id=>gd.tierOf(id)===6&&!gd.chess(id).bonds.includes('yanShip'));
    for(const id of strong.slice(0,6))put(m,ps,id,{board:true});
    for(const id of gd.visibleChess.filter(id=>gd.tierOf(id)<=2&&gd.chess(id).bonds.includes('yanShip')).slice(0,2))put(m,ps,id);
    levelUp(m,ps,{spare:true});assert.equal(ps.shop.level,5);
    const dusk=put(m,ps,'chess_char_5_12_a');
    const selected=prepLineupDiagnostic(m,ps).chosen.map(uid=>ps.find(uid).piece);
    assert.ok(selected.some(p=>p.uid===dusk.uid));
    assert.ok(new Set(selected.filter(p=>gd.chess(p.id).bonds.includes('yanShip')).map(p=>gd.baseIdOf(p.id))).size>=3);
    m.round=11;levelUp(m,ps);assert.equal(ps.shop.level,6);
  }finally{m.dispose();}
});

test('Dusk cycles require actual fielded engine/activation and have a finite bound including final prep', () => {
  const {m,ps} = fixture('yan');
  try {
    m.round=9;
    put(m,ps,'chess_char_2_19_a');put(m,ps,'chess_char_3_04_a');put(m,ps,'chess_char_5_17_a');
    const dusk=put(m,ps,'chess_char_5_12_a',{board:true});
    assert.equal(playbookTrade(m,ps,'chess_char_1_07_a',2),false,'inactive Yan cannot start the recipe cycle');
    put(m,ps,'chess_char_1_03_a',{board:true});put(m,ps,'chess_char_2_02_a',{board:true});
    // Use actual Yan members rather than assuming a hand member activates a field-only core.
    if(!ps.bonds.yanShip?.active) {
      const yan=m.gd.visibleChess.find(id=>m.gd.chess(id).bonds?.includes('yanShip')&&!ps.allChess().some(p=>p.id===id));
      put(m,ps,yan,{board:true});
    }
    assert.equal(ps.bonds.yanShip.active,true);assert.equal(ps.bonds.investShip.active,true);
    assert.equal(playbookPlan(m,ps).phase,'growth');
    for(let i=0;i<6;i++){assert.equal(playbookTrade(m,ps,'chess_char_1_07_a',2),true);recordPlaybookTrade(m,ps);}
    assert.equal(playbookTrade(m,ps,'chess_char_1_07_a',2),false);
    m.round=10; assert.equal(playbookTrade(m,ps,'chess_char_1_07_a',2),true);
    m.round=12; assert.equal(playbookTrade(m,ps,'chess_char_1_07_a',2),true);assert.ok(ps.find(dusk.uid));
  } finally {m.dispose();}
});

test('formed Yan engine executes a real buy/sell cycle without selling its held investor identities', () => {
  const {m,ps}=fixture('yan');
  try {
    m.round=9;ps.shop.level=5;ps.shop.upgradePrice=100;
    put(m,ps,'chess_char_5_12_a',{board:true});
    for(const id of ps.gd.visibleChess.filter(id=>ps.gd.tierOf(id)<=2&&ps.gd.chess(id).bonds.includes('yanShip')).slice(0,2))put(m,ps,id,{board:true});
    const extra=ps.gd.visibleChess.filter(id=>ps.gd.tierOf(id)===6&&!ps.gd.chess(id).bonds.includes('yanShip'));
    for(const id of extra.slice(0,5))put(m,ps,id,{board:true});
    const investors=['chess_char_2_19_a','chess_char_3_04_a','chess_char_5_17_a'];
    for(const id of investors)put(m,ps,id);
    assert.equal(playbookPlan(m,ps).phase,'growth');
    const id='chess_char_1_07_a';ps.shop.slots=[{kind:'chess',id,basePrice:ps.gd.chessPrice(id),sold:false}];ps.funds=ps.priceOf(ps.shop.slots[0]);
    assert.ok(Number.isFinite(ps.funds));
    botPrep(m,ps);
    assert.equal(ps._botPlaybookTrades?.count,1);
    assert.ok(ps.round.gainedChess>=1);assert.ok(!ps.allChess().some(p=>p.id===id));
    assert.ok(investors.every(id=>ps.allChess().some(p=>m.gd.baseIdOf(p.id)===id)));
  }finally{m.dispose();}
});

test('Texas merchant never sells the only identity or a pair; safe spare elite duplicate uses the real sale effect', () => {
  const {m,ps} = fixture('siracusa');
  try {
    put(m,ps,'chess_char_1_07_a',{board:true});put(m,ps,'chess_char_2_16_a',{board:true});
    const texas=put(m,ps,'chess_char_1_08_a');
    assert.equal(playbookMerchant(m,ps),null);
    put(m,ps,'chess_char_1_08_a',{elite:true,board:true});
    assert.equal(playbookMerchant(m,ps)?.uid,texas.uid);
    const before=ps.shop.freeRefreshes;ps.sell(texas.uid);assert.ok(ps.shop.freeRefreshes>before);
    assert.equal(ps.bonds.siracusaShip.active,true);
  } finally {m.dispose();}
});

test('Jessica holds early module, then favors pure Kjerag carrier over a polluted union without replacing equipment', () => {
  const {m,ps} = fixture('kjerag');
  try {
    m.round=4;ps.shop.level=3;
    const pure=put(m,ps,'chess_char_4_22_a'), mixed=put(m,ps,'chess_char_5_14_a');
    const item=giveItem(m,ps,'chess_item_4_01_e_a');
    assert.equal(itemTarget(m,ps,item),null);
    ps.shop.level=4;assert.equal(playbookModuleTarget(m,ps)?.uid,pure.uid);
    assert.equal(itemTarget(m,ps,item)?.uid,pure.uid);
    pure.items=Array.from({length:m.gd.equipPerChess},()=>({id:'chess_item_4_01_e_a'}));
    assert.equal(playbookModuleTarget(m,ps)?.uid,mixed.uid);
  } finally {m.dispose();}
});

test('Jessica module really produces a free, current-tier Kjerag offer with a pure carrier', () => {
  const {m,ps} = fixture('kjerag');
  try {
    ps.shop.level=4;
    const pure=put(m,ps,'chess_char_4_22_a');
    const item=giveItem(m,ps,'chess_item_4_01_e_a'), funds=ps.funds;
    assert.equal(ps.equip(item.uid,itemTarget(m,ps,item).uid).ok,true);
    assert.ok(ps.offers.length);const offer=ps.offers[0];
    assert.equal(offer.slots.length,3);
    assert.ok(offer.slots.every(s=>m.gd.chess(s.id).bonds.includes('kjeragShip')&&m.gd.tierOf(s.id)<=4));
    assert.equal(ps.pickReward(0).ok,true);assert.equal(ps.funds,funds);assert.ok(ps.find(pure.uid));
  } finally {m.dispose();}
});

test('a planning branch owns independent macro commitment and cycle counters', () => {
  const {m,ps}=fixture('siracusa');
  try {
    playbookPlan(m,ps);recordPlaybookTrade(m,ps);
    const before=JSON.stringify(ps._botPlaybook), trades=JSON.stringify(ps._botPlaybookTrades), branch=forkPrep(m,ps);
    try {
      branch.m.round=9;playbookPlan(branch.m,branch.ps);recordPlaybookTrade(branch.m,branch.ps);
      assert.equal(branch.ps._botPlaybook.transition,true);
      assert.equal(JSON.stringify(ps._botPlaybook),before);assert.equal(JSON.stringify(ps._botPlaybookTrades),trades);
    }finally{branch.dispose();}
  }finally{m.dispose();}
});

test('full prep respects macro ceiling and retains Lapland while using only legal, deterministic intents', () => {
  function run() {
    const {m,ps,h}=fixture('siracusa');
    try {
      ps.shop.level=2;fill(m,ps);
      const lap=put(m,ps,'chess_char_2_16_a');ps.funds=22;
      botPrep(m,ps);assert.equal(ps.ready,true);assert.equal(ps.shop.level,2);
      assert.ok(ps.allChess().some(p=>m.gd.baseIdOf(p.id)===m.gd.baseIdOf(lap.id)));
      assert.deepEqual(h.logs.error,[]);
      return JSON.stringify({board:[...ps.board],hand:ps.hand,funds:ps.funds,layers:ps.layers,shop:ps.shop,bots:m.rngBots.state()});
    } finally {m.dispose();}
  }
  assert.equal(run(),run());
});
