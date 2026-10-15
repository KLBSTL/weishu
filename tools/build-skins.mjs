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
const reportFile = process.argv[2] ? path.resolve(root, process.argv[2]) : null;
const report = reportFile ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : {
  source: existing?.source,
  models: [...Object.entries(existing?.chars || {}).flatMap(([charId, skins]) => skins.flatMap(skin =>
    [['Front', skin.spine.front], ['Back', skin.spine.back], ['Base', skin.base]].filter(([, entry]) => entry).map(([view, entry]) =>
      ({ charId, skinId: skin.skinId, view, stem: path.basename(entry.skel, '.skel'), ok: true })))),
  ...Object.entries(existing?.defaults || {}).map(([charId, record]) =>
    ({ charId, skinId: charId, view: 'Base', stem: path.basename(record.base.skel, '.skel'), defaultBase: true, ok: true }))],
};
if (!report.models?.length) throw new Error('No downloaded skin report or committed catalogue found');
const nameFile = path.resolve(root, process.argv[3] || '../testing/skin-assets/skin_table.json');
const official = fs.existsSync(nameFile) ? JSON.parse(fs.readFileSync(nameFile, 'utf8')).charSkins || {} : {};
const chars = {}, defaults = {}, models = {}, errors = [], seen = new Set();
const manifestFile = path.join(root, 'data/assets.json');
const previous = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const chess = JSON.parse(fs.readFileSync(path.join(root, 'data/chess.json'), 'utf8'));
const formalIds = new Set(Object.values(chess).filter(c => !c.isDiy && c.charId).map(c => c.charId));
for (const job of report.models) {
  if (!job.ok) { errors.push(`${job.skinId}/${job.view}: download missing`); continue; }
  try {
    if (!previous.chars[job.charId] || !/^[a-zA-Z0-9_]+$/.test(job.skinId) || !/^[a-zA-Z0-9_]+$/.test(job.stem) || !['Front', 'Back', 'Base'].includes(job.view)) throw new Error('Invalid model identity');
    if (!formalIds.has(job.charId)) throw new Error('Appearance outside formal chess roster');
    if (job.defaultBase && (job.skinId !== job.charId || job.view !== 'Base')) throw new Error('Invalid default Base');
    const key = job.skinId + '/' + job.view;
    if (seen.has(key)) throw new Error('Duplicate model');
    seen.add(key);
    const dir = path.join(root, 'public/assets/skins', job.skinId, job.view);
    const atlasFile = path.join(dir, job.stem + '.atlas');
    const text = fs.readFileSync(atlasFile, 'utf8');
    const ai = atlasInfo(text);
    if (ai.pages.some(name => path.basename(name) !== name || name.includes('\\'))) throw new Error('Invalid atlas page path');
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
    if (job.defaultBase) defaults[job.charId] = { base: entry };
    else (models[job.skinId] ||= {})[job.view.toLowerCase()] = entry;
  } catch (error) { errors.push(`${job.skinId}/${job.view}: ${error.message}`); }
}
for (const job of report.models.filter(job => job.view === 'Front')) {
  const model = models[job.skinId];
  if (!model?.front || (!model.back && previous.chars[job.charId]?.spine?.back)) {
    errors.push(`${job.skinId}: incomplete battle directions`); continue;
  }
  const suffix = job.skinId.slice(job.charId.length + 1);
  const record = official[job.charId + '@' + suffix.replace(/_(\d+)$/, '#$1')];
  const savedName = existing?.chars?.[job.charId]?.find(skin => skin.skinId === job.skinId)?.name;
  const skin = { skinId: job.skinId, name: record?.displaySkin?.skinName || savedName || suffix,
    spine: { front: model.front, ...(model.back ? { back: model.back } : {}) }, base: model.base || null };
  (chars[job.charId] ||= []).push(skin);
}
for (const [charId, skins] of Object.entries(existing?.chars || {})) for (const skin of skins) {
  if (!chars[charId]?.some(candidate => candidate.skinId === skin.skinId)) errors.push(`${skin.skinId}: existing skin would be removed`);
}
for (const charId of Object.keys(existing?.defaults || {})) if (!defaults[charId]) errors.push(`${charId}: existing default Base would be removed`);
const summary = { operators: Object.keys(chars).length, skins: Object.values(chars).flat().length,
  defaultBases: Object.keys(defaults).length, models: seen.size, errors };
const validationFile = process.argv[4] ? path.resolve(root, process.argv[4]) : null;
if (validationFile) fs.writeFileSync(validationFile, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
if (errors.length) throw new Error('Skin validation failed; catalogue and manifest were not replaced');
const catalogue = { source: report.source, scope: { kind: 'formal-chess', charIds: [...formalIds].sort() }, chars, defaults };
fs.writeFileSync(catalogueFile, JSON.stringify(catalogue));
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
