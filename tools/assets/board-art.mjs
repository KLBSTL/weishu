// Distributed, validated board art. Optional machine-local extraction keeps priority at runtime.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { totalBytes } from './manifest.mjs';

export function attachBoardArt(manifest, root, files = null) {
  const source = join(root, 'public/assets/scenes/catalogue.json');
  if (!existsSync(source)) return manifest;
  const catalogue = JSON.parse(readFileSync(source, 'utf8'));
  if (catalogue.version !== 1 || !catalogue.groups) throw new Error('invalid distributed board-art catalogue');
  const refs = new Set(['scenes/catalogue.json']);
  const surface = join(root, 'public/assets/scenes/materials.json');
  if (existsSync(surface)) {
    const extra = JSON.parse(readFileSync(surface, 'utf8'));
    if (extra.version !== 1 || !extra.groups || Object.keys(extra.groups).some(g => g !== 'scene/material')) {
      throw new Error('invalid scene-material catalogue');
    }
    catalogue.groups = { ...catalogue.groups, ...extra.groups };
    catalogue.materialSource = extra.source;
    refs.add('scenes/materials.json');
  }
  for (const entries of Object.values(catalogue.groups)) for (const entry of Object.values(entries)) {
    if (!entry.path.startsWith('/assets/scenes/') || /[\\\x00-\x20?#%:]/.test(entry.path) || entry.path.split('/').includes('..')) {
      throw new Error('unsafe board-art URL: ' + entry.path);
    }
    const rel = entry.path.slice('/assets/'.length);
    const data = readFileSync(join(root, 'public/assets', rel));
    if (data.length !== entry.bytes || createHash('sha256').update(data).digest('hex') !== entry.sha256) {
      throw new Error('board-art integrity mismatch: ' + rel);
    }
    refs.add(rel);
  }
  for (const rel of refs) files?.add(rel);
  manifest.boardArt = catalogue;
  manifest.boardStats = { stages: catalogue.stages.length, files: refs.size, bytes: totalBytes(join(root, 'public/assets'), refs) };
  return manifest;
}
