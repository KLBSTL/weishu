import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const require=createRequire(import.meta.url),{bridgeTimeout}=require('../server/desktop/bridge-timeouts.cjs');
const bridgeFile=fileURLToPath(new URL('../desktop-pet/node_modules/dsh-pet/runtime/electron-helper/main/bridge.js',import.meta.url));

test('model bridge routes outlive 180 second tasks while ordinary controls keep their short timeout',()=>{
  for(const route of ['chat?pet=main','whisper','stronghold/idle'])assert.ok(bridgeTimeout('POST','/dsh-pet-7340/'+route,'{}')>180000);
  assert.ok(bridgeTimeout('POST','/dsh-pet-7340/stronghold/library','{"action":"research-card"}')>180000);
  for(const [method,path,body]of [['GET','stronghold/idle-status',''],['DELETE','stronghold/idle',''],['POST','stronghold/library','{"action":"snapshot"}'],['POST','stronghold/library','invalid']])
    assert.equal(bridgeTimeout(method,'/dsh-pet-7340/'+path,body),45000);
});

test('actual helper bridge delivers speech after 54 simulated seconds without a premature 45 second timeout',{skip:!existsSync(bridgeFile)},async()=>{
  const timers=[],messages=[],module={exports:{}},actualRequire=createRequire(bridgeFile);let respond;
  const http={createServer:handler=>{respond=handler;return {on(){},listen(_port,_host,ready){ready();},address(){return {port:31999};}};}};
  const context={module,require:name=>name==='node:http'?http:actualRequire(name),console:{error(){}},process:{stdout:{write:line=>messages.push(JSON.parse(line.slice(6)))}},
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return {unref(){}};}};
  vm.runInNewContext(readFileSync(bridgeFile,'utf8'),context,{filename:bridgeFile});
  const bridge=module.exports.createBridge({isBridge:true,prefix:'probe:',origin:'http://127.0.0.1',token:''});
  bridge.startCallback();
  const response=bridge.hostRequest('POST','/dsh-pet-7340/stronghold/idle','{"manual":true}');
  assert.ok(timers[0].ms>180000,'installed helper must use the project timeout policy');
  for(const t of timers)if(t.ms<=54000)t.fn();
  const listeners={};respond({method:'POST',url:'/respond',on:(event,handler)=>{listeners[event]=handler;}},{writeHead(){},end(){}});
  listeners.data(JSON.stringify({id:messages[0].id,status:200,body:JSON.stringify({text:'模型已经生成的台词。'})}));listeners.end();
  assert.equal(JSON.parse((await response).body).text,'模型已经生成的台词。');
  const status=bridge.hostRequest('GET','/dsh-pet-7340/stronghold/idle-status');
  const expired=assert.rejects(status,/bridge request timeout/u);timers.at(-1).fn();await expired;
});
