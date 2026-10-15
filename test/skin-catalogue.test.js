import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { attachSkinCatalogue } from '../tools/assets/skin-catalogue.mjs';
import { parseSkel } from '../tools/assets/skel.mjs';

const sampleSkel = new URL('../public/assets/skins/char_274_astesi_epoque_23/Front/char_274_astesi_epoque_23.skel', import.meta.url);
test('Spine metadata: a file and an offset view of its bytes produce identical animations and bounds', { skip: !existsSync(sampleSkel) }, () => {
  const bytes = readFileSync(sampleSkel);
  const exact = new Uint8Array(bytes);
  const padded = new Uint8Array(exact.length + 64); padded.fill(255); padded.set(exact, 31);
  assert.deepEqual(parseSkel(padded.subarray(31,31+exact.length)), parseSkel(exact));
});

test('skin catalogue: default Base and all costume directions are included in offline asset accounting', () => {
  const root = mkdtempSync(join(tmpdir(), 'sp-skin-accounting-'));
  try {
    const dir = join(root, 'public/assets/skins'); mkdirSync(dir, { recursive: true });
    const entry = name => ({ skel: `/assets/skins/${name}.skel`, atlas: `/assets/skins/${name}.atlas`, textures: [`/assets/skins/${name}.png`] });
    const front = entry('front'), back = entry('back'), base = entry('base'), defaultBase = entry('defaultBase');
    const cat = { source: { ref: 'fixed' }, chars: { char_1_demo: [{ skinId: 'skin', spine: { front, back }, base }] }, defaults: { char_1_demo: { base: defaultBase } } };
    writeFileSync(join(dir, 'catalogue.json'), JSON.stringify(cat));
    for (const model of [front, back, base, defaultBase]) for (const url of [model.skel, model.atlas, ...model.textures]) writeFileSync(join(root, 'public', url), 'asset');
    const files = new Set(), manifest = attachSkinCatalogue({ chars: { char_1_demo: { spine: { front } } } }, root, files);
    assert.deepEqual(manifest.chars.char_1_demo.base, defaultBase);
    assert.deepEqual(manifest.chars.char_1_demo.spine.front, front, 'default battle entry survives');
    assert.equal(manifest.skinStats.models, 4);
    assert.equal(files.size, 13);
    assert.equal(manifest.skinStats.bytes, Buffer.byteLength(JSON.stringify(cat)) + 12 * 5);
    assert.ok(files.has('skins/defaultBase.skel'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('skin builder: invalid downloads fail without replacing the usable catalogue or manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'sp-skin-build-'));
  try {
    cpSync(fileURLToPath(new URL('../tools/assets/', import.meta.url)), join(root, 'tools/assets'), { recursive: true });
    cpSync(fileURLToPath(new URL('../tools/build-skins.mjs', import.meta.url)), join(root, 'tools/build-skins.mjs'));
    mkdirSync(join(root, 'data')); mkdirSync(join(root, 'public/assets/skins'), { recursive: true });
    const catalogue = JSON.stringify({ source: {}, chars: { char_1_demo: [{ skinId: 'old', spine: {} }] } });
    const manifest = JSON.stringify({ chars: { char_1_demo: { spine: {} } }, stats: {} });
    writeFileSync(join(root, 'public/assets/skins/catalogue.json'), catalogue);
    writeFileSync(join(root, 'data/assets.json'), manifest);
    writeFileSync(join(root, 'data/chess.json'), JSON.stringify({ chess1: { charId: 'char_1_demo', isDiy: false } }));
    writeFileSync(join(root, 'broken.json'), JSON.stringify({ source: {}, models: [{ charId: 'char_1_demo', skinId: 'old', view: 'Front', ok: false }] }));
    const result = spawnSync(process.execPath, ['tools/build-skins.mjs', 'broken.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /download missing/);
    assert.equal(readFileSync(join(root, 'public/assets/skins/catalogue.json'), 'utf8'), catalogue);
    assert.equal(readFileSync(join(root, 'data/assets.json'), 'utf8'), manifest);
    writeFileSync(join(root, 'broken.json'), JSON.stringify({ source: {}, models: [{ charId: 'char_2_extra', skinId: 'char_2_extra_skin', stem: 'char_2_extra_skin', view: 'Front', ok: true }] }));
    writeFileSync(join(root, 'data/assets.json'), JSON.stringify({ chars: { char_2_extra: { spine: {} } }, stats: {} }));
    const rejected = spawnSync(process.execPath, ['tools/build-skins.mjs', 'broken.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stdout, /outside formal chess roster/);
    assert.equal(readFileSync(join(root, 'public/assets/skins/catalogue.json'), 'utf8'), catalogue);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
