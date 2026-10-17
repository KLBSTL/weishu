// Reproducible composition audit: counts/budgets only, not a claim about match win rate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameData } from '../server/match/gamedata.js';
import { setupMatchWaves,buildNormalWave,gateOf,attrPower } from '../server/match/waves.js';
import { createRng } from '../server/sim/rng.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const raw=Object.fromEntries(['config','chess','bonds','garrisons','items','bands','effects','choices','enemies','factions','waves','stages','bosses','tokens','backups'].map(n=>[n,JSON.parse(fs.readFileSync(path.join(root,'data',n+'.json'),'utf8'))]));
const samples=Number(process.argv[2]||1000),result={samples,modes:{}};
for(const mode of ['abyss','catastrophe']){
  const gd=new GameData(raw,'mode_multi_'+mode),rounds={};
  for(let seed=1;seed<=samples;seed++){
    const setup=setupMatchWaves(gd,createRng(seed));
    for(let r=1;r<=13;r++){
      const wave=buildNormalWave(gd,createRng(1),setup,r);
      const record=rounds[r] ??= {upper:[],lower:[],power:[],emptyUpper:0};
      const count={upper:0,lower:0};let power=0;
      for(const s of wave.spawns){count[gateOf(wave.routes[s.routeIndex].start,false)]+=s.count;power+=s.count*attrPower(gd,s.enemyKey)/(gd.enemy(s.enemyKey).beFactor||1);}
      record.upper.push(count.upper);record.lower.push(count.lower);record.power.push(power);if(!count.upper)record.emptyUpper++;
    }
  }
  const summary=a=>{a.sort((x,y)=>x-y);return {min:a[0],median:a[Math.floor(a.length/2)],max:a.at(-1)};};
  result.modes[mode]=Object.fromEntries(Object.entries(rounds).map(([r,v])=>[r,{upper:summary(v.upper),lower:summary(v.lower),power:summary(v.power),emptyUpper:v.emptyUpper}]));
}
const text=JSON.stringify(result,null,2)+'\n';
if(process.argv[3])fs.writeFileSync(path.resolve(process.argv[3]),text);else console.log(text);
