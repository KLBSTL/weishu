import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../server/index.js';
import {StubMatch} from '../server/match/StubMatch.js';
import {TestClient} from './helpers/wsClient.js';
import {validateC2S} from '../shared/protocol.js';

test('ban configuration protocol rejects missing, fractional, negative and non-numeric counts',()=>{
  const config={hardCore:1,softCore:3,addon:5};
  assert.equal(validateC2S({t:'room.setBans',banConfig:config}),null);
  for(const v of [null,[],{},1,{...config,addon:-1},{...config,softCore:1.5},{...config,hardCore:'1'},{...config,addon:Infinity}])
    assert.notEqual(validateC2S({t:'room.setBans',banConfig:v}),null);
});

test('room bans: host authority, bounded totals, readiness, reconnect, frozen start and solo',async()=>{
  let started;class Recording extends StubMatch{constructor(o){super(o);started=o;}}
  const srv=await startServer({host:'127.0.0.1',port:0,MatchClass:Recording,quiet:true}),clients=[];
  const connect=async(name,token)=>{const c=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);clients.push(c);c.welcome=await c.hello(name,token);return c;};
  const req=async(c,msg,type='ok')=>{const r=await c.request(msg);assert.equal(r.t,type,JSON.stringify(r));return r;};
  try{
    const host=await connect('Host'),guest=await connect('Guest');
    await req(host,{t:'room.create',mode:'coop',difficulty:'HARD'});const room=await host.waitFor('room.state');
    assert.deepEqual(room.banConfig,{hardCore:1,softCore:3,addon:5});await req(guest,{t:'room.join',code:room.code});
    const change={t:'room.setBans',banConfig:{hardCore:2,softCore:1,addon:0}};
    assert.equal((await req(guest,change,'error')).code,'NOT_HOST');await req(guest,{t:'room.ready',ready:true});
    assert.equal((await req(host,{...change,banConfig:{hardCore:64,softCore:64,addon:64}},'error')).code,'BAD_TARGET');
    await req(host,change);const selected=await guest.waitFor('room.state',s=>s.banConfig?.hardCore===2);
    assert.equal(selected.seats.find(s=>s?.playerId===guest.welcome.playerId).ready,false);
    await guest.terminate();const restored=await connect('Guest',guest.welcome.token);
    assert.deepEqual((await restored.waitFor('room.state')).banConfig,change.banConfig);
    await req(restored,{t:'room.ready',ready:true});await req(host,{t:'room.start'});assert.deepEqual(started.banConfig,change.banConfig);
    assert.equal((await req(host,change,'error')).code,'ROOM_STARTED');
    const solo=await connect('Solo');await req(solo,{t:'room.create',mode:'solo',difficulty:'HARD'});
    await req(solo,{t:'room.setBans',banConfig:{hardCore:0,softCore:0,addon:0}});await req(solo,{t:'room.start'});
    assert.deepEqual(started.banConfig,{hardCore:0,softCore:0,addon:0});
  }finally{for(const c of clients)await c.terminate().catch(()=>{});await srv.close();}
});
