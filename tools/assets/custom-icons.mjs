// Local, user-supplied icons shared by the full plan and the targeted offline refresh.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {contentHash} from './manifest.mjs';
export const CUSTOM_ICONS = {
  items: {'columbia-power-armor':'/assets/extensions/columbia-equipment/power-armor-20261019.png',
    'columbia-force-field':'/assets/extensions/columbia-equipment/force-field-20261019.png'},
  bands: {band_ferdinand:'/assets/extensions/columbia-equipment/ferdinand-20261019.jpg'},
};
export function refreshCustomIcons(manifest,root){
  for(const [group,entries]of Object.entries(CUSTOM_ICONS))for(const [key,url]of Object.entries(entries)){
    if(!fs.existsSync(path.join(root,'public',url)))throw Error('Missing icon '+url);
    manifest[group][key]=url;
  }
  const body=Object.fromEntries(Object.entries(manifest).filter(([key])=>!['version','hash','generator','stats'].includes(key)));
  manifest.hash=contentHash(body);
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),file=path.join(root,'data/assets.json');
  const manifest=refreshCustomIcons(JSON.parse(fs.readFileSync(file,'utf8')),root);
  fs.writeFileSync(file,JSON.stringify(manifest));console.log('Refreshed 3 supplied icons; hash '+manifest.hash);
}
