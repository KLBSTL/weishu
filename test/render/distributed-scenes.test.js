// The release art is a dependency closure, not a machine-local extraction or a set of guessed URLs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssets } from '../../public/js/assets.js';
import { attachBoardArt } from '../../tools/assets/board-art.mjs';
import { PACK_IMAGES, boardArtListed, parseSceneChunks } from '../../public/js/render/board3d/load.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'data/assets.json'), 'utf8'));
const art = manifest.boardArt;
const readUrl = (u) => readFileSync(join(ROOT, 'public', u));

test('distributed art validates hashes, includes all eleven scenes and is retained by asset pruning', () => {
  const files = new Set();
  const rebuilt = attachBoardArt({}, ROOT, files);
  assert.deepEqual(rebuilt.boardArt, art);
  assert.deepEqual(rebuilt.boardStats, manifest.boardStats);
  assert.equal(art.stages.length, 11);
  assert.ok(files.has('scenes/catalogue.json'));
  for (const entries of Object.values(art.groups)) for (const e of Object.values(entries)) {
    assert.ok(files.has(e.path.slice('/assets/'.length)));
    assert.ok(existsSync(join(ROOT, 'public', e.path)), e.path);
  }
});

test('each scene has a valid binary mesh, every used material texture and every lightmap page', () => {
  for (const id of art.stages) {
    const g = art.groups['scene/' + id];
    assert.ok(g.bin.path.endsWith('.mesh'), 'browser-compatible binary URL: ' + id);
    const doc = JSON.parse(readUrl(g.scene.path));
    const bin = readUrl(g.bin.path);
    const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
    const chunks = parseSceneChunks(doc, buf);
    assert.ok(chunks?.length > 0, id);
    for (const material of Object.values(doc.materials)) {
      if (material.map) assert.ok(art.groups['scene/tex'][material.map], id + ': ' + material.map);
    }
    for (let i = 0; i < doc.lightmaps; i++) assert.ok(g['lm' + i], id + ': lm' + i);
  }
});

test('a clean clone resolves board art without local extraction, while a partial local overlay retains priority', async () => {
  const store = createAssets({ manifest, fetch: async () => ({ ok: false }) });
  assert.equal(await boardArtListed(store), true);
  assert.equal((await store.local()).stages.length, 11);
  const [g, n] = PACK_IMAGES.D;
  assert.equal(store.localUrl(g, n), art.groups[g][n].path);
  const overlay = createAssets({ manifest, localManifest: { groups: { [g]: { [n]: { path: '/assets/local/custom.png' } } } } });
  assert.equal(await boardArtListed(overlay), true);
  assert.equal(overlay.localUrl(g, n), '/assets/local/custom.png');
  const id = art.stages[0];
  assert.equal(overlay.localUrl('scene/' + id, 'scene'), art.groups['scene/' + id].scene.path);
  // A primary manifest arriving after the optional one was absent must still enable a retry.
  const late = createAssets({ fetch: async () => ({ ok: false }) });
  assert.equal(await late.local(), null);
  late.seed(manifest);
  assert.equal(await boardArtListed(late), true);
});
