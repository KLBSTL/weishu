// Additional appearances are generated from validated local assets, never from machine-specific extraction paths.
import fs from 'node:fs';
import path from 'node:path';
import { totalBytes } from './manifest.mjs';
export function attachSkinCatalogue(manifest, root, files = null) {
  const file = path.join(root, 'public/assets/skins/catalogue.json');
  if (!fs.existsSync(file)) return manifest;
  const catalogue = JSON.parse(fs.readFileSync(file, 'utf8'));
  const skinFiles = new Set(['skins/catalogue.json']), models = new Set();
  const include = entry => {
    models.add(entry.skel);
    for (const url of [entry.skel, entry.atlas, ...entry.textures]) skinFiles.add(url.slice('/assets/'.length));
  };
  for (const [charId, skins] of Object.entries(catalogue.chars)) {
    if (manifest.chars?.[charId]) manifest.chars[charId].skins = skins;
    for (const skin of skins) for (const entry of [skin.spine.front, skin.spine.back, skin.base].filter(Boolean)) {
      include(entry);
    }
  }
  for (const [charId, record] of Object.entries(catalogue.defaults || {})) {
    if (manifest.chars?.[charId]) manifest.chars[charId].base = record.base;
    include(record.base);
  }
  for (const rel of skinFiles) files?.add(rel);
  manifest.skinSource = catalogue.source;
  manifest.skinStats = { files: skinFiles.size, bytes: totalBytes(path.join(root, 'public/assets'), skinFiles), models: models.size };
  return manifest;
}
