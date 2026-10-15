// Rebuild only the distributed board-art part of data/assets.json, preserving all skins and custom assets.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachBoardArt } from './assets/board-art.mjs';
import { contentHash } from './assets/manifest.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'data/assets.json');
const manifest = JSON.parse(readFileSync(target, 'utf8'));
const before = manifest.boardStats;
attachBoardArt(manifest, root);
if (!manifest.boardArt) throw new Error('import the pinned board art before rebuilding the manifest');
manifest.stats.files += manifest.boardStats.files - (before?.files || 0);
manifest.stats.bytes += manifest.boardStats.bytes - (before?.bytes || 0);
const body = Object.fromEntries(Object.entries(manifest).filter(([key]) => !['version', 'hash', 'generator', 'stats'].includes(key)));
manifest.hash = contentHash(body);
writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest.boardStats));
