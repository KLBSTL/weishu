// Small, explicitly selected static pack. Downloaded art stays outside the source distribution.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contentHash } from './manifest.mjs';

const upstream = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/cn/assets/dyn/arts/';
export const STANDBY_FILES = Object.freeze([
  ...['rhodes_night', 'rhodes_flower_1'].flatMap(scene => ['left', 'right'].map(side => ({
    file: `${scene}-${side}.png`, source: `${upstream}ui/homebackground/wrapper/bg_${scene}/bg_${scene}_${side}.png`,
  }))),
  ...['char_102_texas', 'char_103_angel', 'char_1012_skadi2', 'char_1035_wisdel'].map(id => ({
    file: `${id}.png`, source: `${upstream}characters/${id}/${id}_1.png`,
  })),
  { id: 'art_mahoro', file: 'mahoro-card.png', source: 'user-supplied:lora-randomizer_00041_.png' },
  { id: 'art_pastel', file: 'pastel-geometry-card.png', source: 'user-supplied:lora-randomizer_00087_.png' },
  { id: 'art_vinyl', file: 'silver-vinyl-card.png', source: 'user-supplied:26fb548c-daa3-482e-bdc9-7df8a3e10a5b.png' },
  { id: 'art_academy', file: 'green-academy-card.png', source: 'user-supplied:lora-randomizer_00081_.png' },
  { id: 'art_film', file: 'film-dance-card.png', source: 'user-supplied:lora-randomizer_00067_.png' },
  { id: 'art_mint', file: 'mint-pink-card.png', source: 'user-supplied:lora-randomizer_00057_.png' },
  { id: 'art_mahoro_sky', file: 'mahoro-sky-card.png', source: 'user-supplied:云端碎片：少女与天空系统.png' },
]);

function image(root, file) {
  const bytes = fs.readFileSync(path.join(root, 'public/assets/standby', file));
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || bytes.subarray(-8, -4).toString() !== 'IEND') throw Error(`Invalid PNG: ${file}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}

export function attachStandbyArt(manifest, root, files = null) {
  const present = STANDBY_FILES.filter(entry => fs.existsSync(path.join(root, 'public/assets/standby', entry.file)));
  if (!present.length) return manifest;
  const images = Object.fromEntries(present.map(entry => [entry.file, { ...image(root, entry.file), source: entry.source }]));
  const url = file => `/assets/standby/${file}`;
  const scenes = {};
  for (const [id, prefix] of [['rhodesNight', 'rhodes_night'], ['rhodesFlower', 'rhodes_flower_1']]) {
    const left = `${prefix}-left.png`, right = `${prefix}-right.png`;
    if (!images[left] || !images[right]) continue;
    if (images[left].height !== images[right].height) throw Error(`Mismatched scene halves: ${id}`);
    scenes[id] = { left: url(left), right: url(right), ratio: (images[left].width + images[right].width) / images[left].height };
  }
  const portraits = {};
  for (const entry of present) {
    files?.add(`standby/${entry.file}`);
    const id = entry.id || entry.file.replace(/\.png$/, '');
    if (id.startsWith('char_') || id.startsWith('art_')) portraits[id] = url(entry.file);
  }
  manifest.standbyArt = { scenes, portraits, images };
  manifest.standbyStats = { files: present.length, bytes: Object.values(images).reduce((sum, img) => sum + img.bytes, 0) };
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const file = path.join(root, 'data/assets.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = manifest.standbyStats;
  attachStandbyArt(manifest, root);
  if (manifest.standbyStats && manifest.stats) {
    manifest.stats.files += manifest.standbyStats.files - (before?.files || 0);
    manifest.stats.bytes += manifest.standbyStats.bytes - (before?.bytes || 0);
  }
  const body = Object.fromEntries(Object.entries(manifest).filter(([key]) => !['version', 'hash', 'generator', 'stats'].includes(key)));
  manifest.hash = contentHash(body);
  fs.writeFileSync(file, JSON.stringify(manifest));
  const pack = manifest.standbyArt;
  console.log(JSON.stringify({ scenes: Object.keys(pack?.scenes || {}).length, portraits: Object.keys(pack?.portraits || {}).length,
    files: Object.keys(pack?.images || {}).length, bytes: Object.values(pack?.images || {}).reduce((sum, img) => sum + img.bytes, 0) }));
}
