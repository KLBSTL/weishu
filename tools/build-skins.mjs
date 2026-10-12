// Validate downloaded Spine triplets and generate both the public catalogue and data/assets.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkel } from './assets/skel.mjs';
import { atlasInfo, normalizeAtlas } from './assets/atlas.mjs';
import { resolveRoles } from './assets/anim-roles.mjs';
import { attachSkinCatalogue } from './assets/skin-catalogue.mjs';
import { contentHash } from './assets/manifest.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogueFile = path.join(root, 'public/assets/skins/catalogue.json');
const existing = fs.existsSync(catalogueFile) ? JSON.parse(fs.readFileSync(catalogueFile, 'utf8')) : null;
const reportFile = path.resolve(root, process.argv[2] || '../testing/skin-assets/download-report.json');
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : {
  source: existing?.source,
  models: Object.entries(existing?.chars || {}).flatMap(([charId, skins]) => skins.flatMap(skin =>
    [['Front', skin.spine.front], ['Back', skin.spine.back], ['Base', skin.base]].filter(([, entry]) => entry).map(([view, entry]) =>
      ({ charId, skinId: skin.skinId, view, stem: path.basename(entry.skel, '.skel'), ok: true })))),
};
if (!report.models?.length) throw new Error('No downloaded skin report or committed catalogue found');
const nameFile = path.resolve(root, '../testing/skin-assets/skin_table.json');
const official = fs.existsSync(nameFile) ? JSON.parse(fs.readFileSync(nameFile, 'utf8')).charSkins || {} : {};
const chars = {}, models = {}, errors = [];
for (const job of report.models) {
  if (!job.ok) { errors.push(`${job.skinId}/${job.view}: download missing`); continue; }
  try {
    const dir = path.join(root, 'public/assets/skins', job.skinId, job.view);
    const atlasFile = path.join(dir, job.stem + '.atlas');
    const text = fs.readFileSync(atlasFile, 'utf8');
    const ai = atlasInfo(text);
    const normalized = normalizeAtlas(text, { pma: true, pageSize: name => {
      const png = fs.readFileSync(path.join(dir, name));
      if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG');
      return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    } });
    if (normalized.missingSize.length) throw new Error('Missing texture size');
    const skel = parseSkel(fs.readFileSync(path.join(dir, job.stem + '.skel')), ai.regions);
    if (skel.missingRegions.length) throw new Error(`Missing ${skel.missingRegions.length} atlas regions`);
    if (normalized.changed) fs.writeFileSync(atlasFile, normalized.text);
    const prefix = `/assets/skins/${job.skinId}/${job.view}/`;
    const entry = { skel: prefix + job.stem + '.skel', atlas: prefix + job.stem + '.atlas',
      textures: ai.pages.map(page => prefix + page), pma: true, version: skel.version,
      anims: resolveRoles(skel.animations, { skillIndices: [0, 1, 2], durations: skel.durations }),
      animations: skel.durations, events: skel.events, hits: skel.hits, bounds: skel.bounds };
    (models[job.skinId] ||= {})[job.view.toLowerCase()] = entry;
  } catch (error) { errors.push(`${job.skinId}/${job.view}: ${error.message}`); }
}
for (const job of report.models.filter(job => job.view === 'Front')) {
  const model = models[job.skinId];
  if (!model?.front || !model.back) continue;
  const suffix = job.skinId.slice(job.charId.length + 1);
  const record = official[job.charId + '@' + suffix.replace(/_(\d+)$/, '#$1')];
  const savedName = existing?.chars?.[job.charId]?.find(skin => skin.skinId === job.skinId)?.name;
  const skin = { skinId: job.skinId, name: record?.displaySkin?.skinName || savedName || suffix,
    spine: { front: model.front, back: model.back }, base: model.base || null };
  (chars[job.charId] ||= []).push(skin);
}
const catalogue = { source: report.source, chars };
fs.writeFileSync(catalogueFile, JSON.stringify(catalogue));
const manifestFile = path.join(root, 'data/assets.json');
const previous = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const previousSkinStats = previous.skinStats;
const files = new Set();
const manifest = attachSkinCatalogue(previous, root, files);
const skinStats = manifest.skinStats;
manifest.stats.files += skinStats.files - (previousSkinStats?.files || 0);
manifest.stats.bytes += skinStats.bytes - (previousSkinStats?.bytes || 0);
manifest.stats.spineModels += skinStats.models - (previousSkinStats?.models || 0);
const body = Object.fromEntries(Object.entries(manifest).filter(([key]) => !['version', 'hash', 'generator', 'stats'].includes(key)));
manifest.hash = contentHash(body);
fs.writeFileSync(manifestFile, JSON.stringify(manifest));
const validationFile = path.resolve(root, '../testing/skin-assets/validation-report.json');
if (fs.existsSync(path.dirname(validationFile))) fs.writeFileSync(validationFile, JSON.stringify({
  operators: Object.keys(chars).length, skins: Object.values(chars).flat().length,
  models: Object.values(models).reduce((n, views) => n + Object.keys(views).length, 0), errors,
}, null, 2) + '\n');
console.log(JSON.stringify({ operators: Object.keys(chars).length, skins: Object.values(chars).flat().length, errors }));
if (errors.length) process.exitCode = 1;
