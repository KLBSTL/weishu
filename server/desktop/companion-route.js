import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';

const states=new Set(['idle','thinking','working','waiting_approval','completed','error','offline']);
export function sanitizeCompanion(value,now=Date.now()){
  const enabled=value?.schemaVersion===1&&value.enabled===true;
  const fresh=enabled&&Number.isFinite(value.expiresAt)&&value.expiresAt>now&&value.expiresAt<=now+10000;
  const connected=fresh&&value.connected===true&&states.has(value.state);
  return {schemaVersion:1,enabled,connected,state:connected?value.state:'offline',pending:connected?Math.max(0,Math.min(1000,Math.trunc(Number(value.pending)||0))):0,expiresAt:fresh?value.expiresAt:now};
}
export async function companionRoute(method){
  if(method!=='GET')return {kind:'json',status:405,obj:{error:'read-only'}};
  let value;
  try{
    const settings=JSON.parse(await readFile(join(process.env.DSH_HOME||join(homedir(),'.dsh'),'dsh-pet','companion-link.json'),'utf8'));
    if(typeof settings.statusFile==='string'&&settings.statusFile.endsWith('ark-companion-status.json')&&(await stat(settings.statusFile)).size<=2048)value=JSON.parse(await readFile(settings.statusFile,'utf8'));
  }catch{}
  return {kind:'json',status:200,obj:sanitizeCompanion(value)};
}
