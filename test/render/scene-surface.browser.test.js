// Actual pixel effects, not just shader strings/uniforms. Opt-in like board3d.browser.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const CHROME = process.env.CHROME_PATH;

test('scene surface pixels: RGB normals, metal R/smoothness A, emission gating, UVs and degenerate frames', {
  skip: !(process.env.RENDER_E2E === '1' && CHROME && existsSync(CHROME)), timeout: 60000,
}, async () => {
  const { startServer } = await import('../../server/index.js');
  const P = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  let browser;
  try {
    browser = await P.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--enable-gpu', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage(), errors = [];
    // healthz is the neutral same-origin harness, without index.html's explicit icon link.
    await page.setRequestInterception(true);
    page.on('request', r => r.url().endsWith('/favicon.ico') ? r.respond({ status: 204 }) : r.continue());
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${srv.port}/healthz`);
    const pixels = await page.evaluate(async () => {
      const T = await import('/vendor/three.module.js');
      const { sceneMaterial, focusUniforms } = await import('/js/render/board3d/materials.js');
      const renderer = new T.WebGLRenderer({ antialias: false, alpha: true });
      renderer.setSize(64, 64); renderer.setClearColor(0, 0); renderer.outputColorSpace = T.SRGBColorSpace;
      const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0);
      const geo = new T.PlaneGeometry(2, 2);
      geo.setAttribute('aLm', new T.BufferAttribute(new Float32Array(8), 2));
      const mesh = new T.Mesh(geo); scene.add(mesh);
      const focus = focusUniforms(T); focus.uFocusDim.value = 1;
      const allocated = [];
      const texture = (rgba, width = 1) => {
        const tex = new T.DataTexture(new Uint8Array(rgba), width, 1, T.RGBAFormat);
        tex.needsUpdate = true; allocated.push(tex); return tex;
      };
      const record = (keywords = [], extra = {}) => ({ shader: 'Torappu/Scene/StandardRealtimeShadow', keywords,
        textures: { _BumpMap: { texture: 'N' }, _MetallicGlossMap: { texture: 'M' }, _EmissionMap: { texture: 'E' } },
        colors: { _Color: [0.5, 0.4, 0.3, 1] }, floats: { _Glossiness: 0.3, _SpecularHighlights: 0 }, ...extra });
      const draw = (info, maps = {}, light = { dir: [-0.7, 0, 0.7], color: [1, 1, 1], intensity: 1 }) => {
        const material = sceneMaterial(T, { info, ...maps, light }, focus);
        mesh.material = material; renderer.render(scene, camera);
        const pixel = new Uint8Array(4);
        renderer.getContext().readPixels(32, 32, 1, 1, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixel);
        material.dispose(); return [...pixel];
      };
      try {
        const tilted = texture([230, 128, 204, 255]);
        const base = draw(record());
        const normal = draw(record(['_NORMALMAP']), { normalMap: tilted });
        const zeroNormal = draw(record(['_NORMALMAP'], { floats: { _BumpScale: 0, _SpecularHighlights: 0 } }), { normalMap: tilted });
        const spec = record(['_METALLICGLOSSMAP'], { floats: { _SpecularHighlights: 1 } });
        const headOn = { dir: [0, 0, 1], color: [1, 1, 1], intensity: 1 };
        const matte = draw(spec, { metallicMap: texture([0, 0, 0, 32]) }, headOn);
        const smooth = draw(spec, { metallicMap: texture([0, 0, 0, 225]) }, headOn);
        const unusedGB = draw(spec, { metallicMap: texture([0, 255, 220, 32]) }, headOn);
        const metal = draw(spec, { metallicMap: texture([255, 0, 0, 32]) }, headOn);
        const black = { _Color: [0, 0, 0, 1], _EmissionColor: [0, 0.5, 0, 1] };
        const white = texture([255, 255, 255, 255]);
        const noLight = { dir: [0, 0, 1], color: [1, 1, 1], intensity: 0 };
        const emission = draw(record(['_EMISSION'], { colors: black }), { emissionMap: white }, noLight);
        const disabled = draw(record([], { colors: black }), { emissionMap: white }, noLight);
        const missingNormal = draw(record(['_NORMALMAP']));
        const strip = texture([255, 0, 0, 255, 0, 0, 255, 255], 2); strip.colorSpace = T.SRGBColorSpace;
        const atUV = u => draw(record([], { shader: 'Torappu/Scene/Unlit Texture', colors: { _Color: [1, 1, 1, 1] },
          textures: { _MainTex: { scale: [0, 0], offset: [u, 0.5] } } }), { map: strip }, noLight);
        const uvRed = atUV(0.1), uvBlue = atUV(0.9);
        geo.getAttribute('uv').array.fill(0); geo.getAttribute('uv').needsUpdate = true;
        const degenerate = draw(record(['_NORMALMAP']), { normalMap: tilted });
        return { base, normal, zeroNormal, matte, smooth, unusedGB, metal, emission, disabled, missingNormal, uvRed, uvBlue, degenerate };
      } finally { allocated.forEach(t => t.dispose()); geo.dispose(); renderer.dispose(); }
    });
    mkdirSync('test/e2e/out', { recursive: true });
    writeFileSync('test/e2e/out/scene-surface-pixels.json', JSON.stringify(pixels, null, 2));
    const delta = (a, b) => a.slice(0, 3).reduce((sum, x, i) => sum + Math.abs(x - b[i]), 0);
    assert.ok(delta(pixels.base, pixels.normal) > 20, 'normal map changes actual lighting');
    assert.ok(delta(pixels.base, pixels.zeroNormal) <= 3, 'BumpScale=0 restores geometric normal');
    assert.ok(delta(pixels.matte, pixels.metal) > 10, 'metallic R changes surface response');
    assert.ok(delta(pixels.matte, pixels.smooth) > 10, 'smoothness A changes highlight width/strength');
    assert.ok(delta(pixels.matte, pixels.unusedGB) <= 1, 'unused G/B channels do not affect metal/smoothness');
    assert.ok(pixels.emission[1] > 100 && pixels.emission[0] < 2 && pixels.emission[2] < 2);
    assert.ok(pixels.disabled.slice(0, 3).every(x => x < 2), 'assigned emission stays dark without the keyword');
    assert.ok(delta(pixels.base, pixels.missingNormal) <= 1);
    assert.ok(delta(pixels.base, pixels.degenerate) <= 1, 'degenerate UVs use geometric normal');
    assert.ok(pixels.uvRed[0] > 250 && pixels.uvRed[2] < 2 && pixels.uvBlue[2] > 250 && pixels.uvBlue[0] < 2);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await srv.close(); }
});
