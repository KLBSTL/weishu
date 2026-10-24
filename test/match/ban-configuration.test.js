import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bannedByBonds, normalizeBanConfig} from '../../shared/banConfig.js';
import {DATA, makeMatch} from './harness.js';
import {GameData} from '../../server/match/gamedata.js';
import {drawDisabledBonds, SharedPool} from '../../server/match/pool.js';
import {createRng} from '../../server/sim/rng.js';

test('hard-any and soft-all identities, multiple cores/addons, no addons, empty and static exclusions',()=>{
  const core=b=>['a','b'].includes(b), filters={hard:['b'],soft:['a'],addon:['x'],staticOff:['s']};
  for(const [labels,expected] of [[['b'],true],[['b','y'],true],[['a','x'],true],[['a','x','y'],false],
    [['a'],true],[['x'],true],[['x','y'],false],[[],false],[['s'],true],[['a','s'],true],[['a','b','y'],true]])
    assert.equal(bannedByBonds(labels,core,filters),expected,JSON.stringify(labels));
  assert.equal(bannedByBonds(['a','b','x'],core,{soft:['a'],addon:['x']}),false);
  assert.equal(bannedByBonds(['a','b','x'],core,{soft:['a','b'],addon:['x']}),true);
});

test('Leonhardt ordinary/elite leave the pool only when all natural addon Alliances are filtered',()=>{
  const gd=new GameData(DATA,'mode_multi_hard');
  const ids=gd.visibleChess.filter(id=>gd.chess(id).name==='莱恩哈特');assert.equal(ids.length,1);
  const id=ids[0],normal=gd.chess(id);assert.deepEqual([...normal.bonds].sort(),['preciShip','swiftShip']);
  for(const form of [id,normal.goldenId]){
    const labels=gd.chess(form).bonds,core=b=>gd.bond(b)?.isCore;
    assert.equal(bannedByBonds(labels,core,{addon:['preciShip','swiftShip']}),true);
    assert.equal(bannedByBonds(labels,core,{addon:['preciShip']}),false);
    assert.equal(bannedByBonds(labels,core,{addon:['swiftShip']}),false);
  }
  let covered=0;
  for(let seed=1;seed<=50;seed++){
    const bans=drawDisabledBonds(gd,createRng(seed),{hardCore:0,softCore:0,addon:5});
    if(!['preciShip','swiftShip'].every(b=>bans.addon.includes(b)))continue;
    covered++;assert.ok(bans.banned.includes(id));assert.ok(!new SharedPool(gd,bans).has(id));
    const h=makeMatch({mode:'coop',difficulty:'HARD',humans:1,bots:0});
    const ps=h.m.order[0];ps._diyRecords=new Map([['chess_char_5_diy1_a',{bonds:normal.bonds}]]);
    ps.diy={'chess_char_5_diy1_a':{charId:normal.charId}};ps.initDiyStock(bans);
    assert.ok(ps.diyBanned.includes('chess_char_5_diy1_a'));h.m.dispose();
  }
  assert.ok(covered>0);
});

test('Ulpianus with only Aegir leaves both ordinary and DIY recruitment under a soft core filter',()=>{
  const gd=new GameData(DATA,'mode_multi_hard'),id='chess_char_5_05_a';
  assert.equal(gd.chess(id).name,'乌尔比安');assert.deepEqual(gd.chess(id).bonds,['egirShip']);
  for(const form of [id,gd.chess(id).goldenId]){
    const bonds=gd.chess(form).bonds;
    assert.equal(bannedByBonds(bonds,b=>gd.bond(b)?.isCore,{soft:['egirShip']}),true);
    assert.equal(bannedByBonds(bonds,b=>gd.bond(b)?.isCore,{hard:['egirShip']}),true);
    assert.equal(bannedByBonds(bonds,b=>gd.bond(b)?.isCore,{soft:['sargonShip'],addon:['swiftShip']}),false);
  }
  let covered=0;
  for(let seed=1;seed<=50;seed++){
    const bans=drawDisabledBonds(gd,createRng(seed));
    if(!bans.soft.includes('egirShip'))continue;
    covered++;assert.ok(!bans.hard.includes('egirShip'));assert.ok(bans.banned.includes(id));
    const h=makeMatch({mode:'coop',difficulty:'HARD',seed,humans:1,bots:0});
    const ps=h.m.order[0];
    ps._diyRecords=new Map([['chess_char_5_diy1_a',{bonds:['egirShip']}]]);
    ps.diy={'chess_char_5_diy1_a':{charId:gd.chess(id).charId}};
    ps.initDiyStock(bans);assert.ok(ps.diyBanned.includes('chess_char_5_diy1_a'));
    h.m.dispose();
  }
  assert.ok(covered>0,'real seeded soft bans exercised');
});

test('zero filters and all legal candidates, deterministic seeds and disjoint cores',()=>{
  const gd=new GameData(DATA,'mode_multi_hard');
  assert.deepEqual(normalizeBanConfig({hardCore:5,softCore:5,addon:10},{core:6,addon:3}),{hardCore:5,softCore:1,addon:3});
  const zero=drawDisabledBonds(gd,createRng(17),{hardCore:0,softCore:0,addon:0});
  assert.deepEqual(zero.banned,[]);assert.deepEqual(zero.drawn,[]);
  for(let seed=1;seed<=50;seed++){
    const a=drawDisabledBonds(gd,createRng(seed)),b=drawDisabledBonds(gd,createRng(seed));assert.deepEqual(a,b);
    assert.equal(new Set(a.drawn).size,9);assert.ok(a.hard.every(id=>!a.soft.includes(id)));
    for(const id of gd.visibleChess.filter(id=>gd.chess(id).bonds.some(x=>a.hard.includes(x))))assert.ok(a.banned.includes(id));
  }
  const all=drawDisabledBonds(gd,createRng(1),{hardCore:64,softCore:0,addon:64});
  for(const id of gd.visibleChess.filter(id=>gd.chess(id).bonds.some(b=>all.hard.includes(b))))assert.ok(all.banned.includes(id));
});

test('Match freezes custom opening filters and exposes the actual sampled groups',()=>{
  const h=makeMatch({mode:'coop',difficulty:'HARD',humans:1,bots:1,banConfig:{hardCore:0,softCore:0,addon:0}}).start();
  const pub=h.lastBc('m.public');assert.deepEqual(pub.banConfig,{hardCore:0,softCore:0,addon:0});
  assert.deepEqual(pub.hardBannedBonds,[]);assert.deepEqual(pub.softBannedBonds,[]);assert.deepEqual(pub.addonBannedBonds,[]);
  assert.equal(h.m.pool.entries.size,h.m.gd.visibleChess.length);h.m.dispose();
});
