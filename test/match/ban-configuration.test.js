import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bannedByBonds, normalizeBanConfig} from '../../shared/banConfig.js';
import {DATA, makeMatch} from './harness.js';
import {GameData} from '../../server/match/gamedata.js';
import {drawDisabledBonds} from '../../server/match/pool.js';
import {createRng} from '../../server/sim/rng.js';

test('hard-any and soft-all identities, multiple cores/addons, no addons, empty and static exclusions',()=>{
  const core=b=>['a','b'].includes(b), filters={hard:['b'],soft:['a'],addon:['x'],staticOff:['s']};
  for(const [labels,expected] of [[['b'],true],[['b','y'],true],[['a','x'],true],[['a','x','y'],false],
    [['a'],false],[['x'],false],[[],false],[['s'],true],[['a','s'],true],[['a','b','y'],true]])
    assert.equal(bannedByBonds(labels,core,filters),expected,JSON.stringify(labels));
  assert.equal(bannedByBonds(['a','b','x'],core,{soft:['a'],addon:['x']}),false);
  assert.equal(bannedByBonds(['a','b','x'],core,{soft:['a','b'],addon:['x']}),true);
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
