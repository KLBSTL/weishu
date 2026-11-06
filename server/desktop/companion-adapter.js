// Compose with the actively maintained ark conversation adapter; never patch its source.
import './standalone-persona.js';
import {registerHooks} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const entry=pathToFileURL(resolve(process.argv[1])).href;
const helper=new URL('./companion-route.js',import.meta.url).href;
const marker='return async (url, rest, method, body, signal) => {';
registerHooks({load(url,context,nextLoad){
  const loaded=nextLoad(url,context);if(url!==entry)return loaded;
  const source=typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString('utf8');
  if(source.split(marker).length!==2)throw Error('DSH Companion adapter requires dsh-pet 0.4.1');
  const adapted=source.replace(marker,marker+'\n if (rest === "stronghold/companion-status") return dshCompanionRoute(method);');
  const at=adapted.startsWith('#!')?adapted.indexOf('\n')+1:0;
  return {...loaded,source:adapted.slice(0,at)+`import {companionRoute as dshCompanionRoute} from ${JSON.stringify(helper)};\n`+adapted.slice(at)};
}});
