import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { sceneSurface } from '../../public/js/render/board3d/surface.js';
import { sceneMaterial, focusUniforms } from '../../public/js/render/board3d/materials.js';
import { BoardScene } from '../../public/js/render/board3d/scene.js';
import { loadScenePack, resetBoardPack, SCENE_MATERIAL_GROUP } from '../../public/js/render/board3d/load.js';

const info = () => ({ shader: 'Torappu/Scene/StandardRealtimeShadow',
  keywords: ['_NORMALMAP', '_METALLICGLOSSMAP', '_EMISSION'],
  textures: { _MainTex: { texture: 'A', scale: [2, 3], offset: [0.1, 0.2] },
    _BumpMap: { texture: 'N' }, _MetallicGlossMap: { texture: 'M' }, _EmissionMap: { texture: 'E' } },
  floats: { _BumpScale: 0.7, _Metallic: 0.3, _Glossiness: 0.6, _GlossMapScale: 0.8 },
  colors: { _EmissionColor: [0.5, 1, 2, 1] } });

test('scene surfaces use enabled keywords, finite controls and the shared original UV transform', () => {
  const source = info(), s = sceneSurface(source);
  assert.deepEqual(s.names, { normal: 'N', metallic: 'M', emission: 'E' });
  assert.deepEqual(s.transform, [2, 3, 0.1, 0.2]);
  assert.deepEqual([s.normalScale, s.metallic, s.smoothness, s.glossScale], [0.7, 0.3, 0.6, 0.8]);
  assert.deepEqual(sceneSurface({ ...source, keywords: [] }).names, {}, 'assigned maps do not enable variants');
  for (const shader of ['Torappu/Scene/Unlit Texture', 'Torappu/Particles/AlphaBlend']) {
    const unlit = sceneSurface({ ...source, shader });
    assert.ok(unlit.unlit && !unlit.emission && !unlit.specular && !unlit.reflections);
    assert.deepEqual(unlit.names, {});
  }
  assert.equal(sceneSurface({ floats: { _SpecularHighlights: 0, _GlossyReflections: 0 } }).specular, false);
  assert.equal(sceneSurface({ keywords: ['_GLOSSYREFLECTIONS_OFF'] }).reflections, false);
  const bad = sceneSurface({ floats: { _Metallic: -2, _Glossiness: 4, _BumpScale: NaN },
    textures: { _MainTex: { scale: [Infinity, -1], offset: [NaN, 3] } } });
  assert.deepEqual([bad.metallic, bad.smoothness, bad.normalScale], [0, 1, 1]);
  assert.deepEqual(bad.transform, [1, -1, 0, 3]);
});

test('material bindings keep linear data, original controls, missing-map scalar fallbacks and emission gating', () => {
  const source = info(), n = new THREE.Texture(), metal = new THREE.Texture(), e = new THREE.Texture();
  const m = sceneMaterial(THREE, { info: source, normalMap: n, metallicMap: metal, emissionMap: e }, focusUniforms(THREE));
  assert.equal(m.uniforms.uNormalMap.value, n);
  assert.equal(m.uniforms.uMetallicMap.value, metal);
  assert.equal(m.uniforms.uEmissionMap.value, e);
  assert.deepEqual(m.uniforms.uSurface.value.toArray(), [0.3, 0.6, 0.8, 0.7]);
  assert.deepEqual(m.uniforms.uSurfaceUV.value.toArray(), [2, 3, 0.1, 0.2]);
  assert.ok(Math.abs(m.uniforms.uEmissionColor.value.x - 0.5 ** 2.2) < 1e-10);
  assert.ok(m.defines.SCENE_NORMAL && m.defines.SCENE_METALLIC && m.defines.SCENE_EMISSION);
  const missing = sceneMaterial(THREE, { info: source }, focusUniforms(THREE));
  assert.ok(!missing.defines.SCENE_NORMAL && !missing.defines.SCENE_METALLIC);
  assert.deepEqual(missing.uniforms.uSurface.value.toArray(), m.uniforms.uSurface.value.toArray());
  const disabled = sceneMaterial(THREE, { info: { ...source, keywords: [] }, emissionMap: e }, focusUniforms(THREE));
  assert.ok(!disabled.defines.SCENE_EMISSION);
  assert.deepEqual(disabled.uniforms.uEmissionColor.value.toArray(), [0, 0, 0]);
});

test('scene GPU textures separate color/data interpretations, reuse resources, and release both kinds once', () => {
  const board = Object.create(BoardScene.prototype);
  Object.assign(board, { THREE, sceneRes: new Map(), renderer: { capabilities: { getMaxAnisotropy: () => 4 } } });
  const image = { width: 4, height: 4 };
  const pack = { key: 'surface', images: { tex: { E: image }, data: { N: image, M: image }, lm: [image] } };
  const res = board._sceneResources(pack);
  assert.equal(res.tex.E.colorSpace, THREE.SRGBColorSpace);
  for (const t of [res.data.N, res.data.M, res.lm[0]]) assert.equal(t.colorSpace, THREE.NoColorSpace);
  assert.notEqual(res.tex.E, res.data.N);
  assert.equal(board._sceneResources(pack), res);
  let releases = 0;
  for (const t of [res.tex.E, res.data.N, res.data.M, res.lm[0]]) t.addEventListener('dispose', () => releases++);
  board._disposeScene(pack);
  board._disposeScene(pack);
  assert.equal(releases, 4);
  assert.equal(board.sceneRes.size, 0);
});

test('scene loader requests enabled surface maps once and tolerates a missing data map', async () => {
  const fetch = globalThis.fetch;
  resetBoardPack();
  const source = info(), calls = [];
  const doc = { version: 1, binBytes: 116, lightmaps: 0, materials: { M: { ...source, map: 'A' } },
    chunks: [{ material: 'M', verts: 3, tris: 1, offset: 0, index32: false }] };
  globalThis.fetch = async () => ({ ok: true, json: async () => doc, arrayBuffer: async () => new ArrayBuffer(116) });
  const store = { local: async () => ({}), localUrl: (group, name) => {
    if (group === 'scene/tex' && name !== 'A') return null;
    return '/' + group + '/' + name;
  }, image: async url => { calls.push(url); if (url === '/scene/material/M') throw new Error('missing'); return { width: 4 }; } };
  try {
    const pack = await loadScenePack(store, 'surface');
    assert.ok(pack?.chunks.length);
    assert.ok(pack.images.tex.A && pack.images.tex.E && pack.images.data.N);
    assert.equal(pack.images.data.M, undefined);
    assert.deepEqual(calls.sort(), ['/scene/tex/A', '/scene/material/E', '/scene/material/N', '/scene/material/M'].sort());
  } finally { globalThis.fetch = fetch; resetBoardPack(); }
});

test('all enabled surface references of every shipped scene resolve to verified lossless material art', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url)));
  const art = manifest.boardArt, maps = art.groups[SCENE_MATERIAL_GROUP];
  const found = new Set();
  for (const id of art.stages) {
    const scene = JSON.parse(readFileSync(new URL('../../public' + art.groups['scene/' + id].scene.path, import.meta.url)));
    for (const material of Object.values(scene.materials)) for (const [role, name] of Object.entries(sceneSurface(material).names)) {
      const entry = maps[name];
      assert.ok(entry, id + ': ' + name);
      assert.ok(entry.path.endsWith('.png'));
      assert.equal(entry.colorSpace, role === 'emission' ? 'srgb' : 'linear');
      if (role === 'normal') assert.equal(entry.normalEncoding, 'rgb');
      found.add(name);
    }
  }
  assert.equal(found.size, Object.keys(maps).length, 'no unused surface-map downloads');
});
