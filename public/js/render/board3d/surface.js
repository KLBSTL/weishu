// Material controls from the official scene records and GLES StandardRealtimeShadow programs (§15).
// The verified Android scene normals are RGB (ETC2_RGB / ASTC_6x6); color maps are sRGB, N/M data are linear.
export const SURFACE_SLOTS = Object.freeze({ normal: '_BumpMap', metallic: '_MetallicGlossMap', emission: '_EmissionMap' });
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
const unit = (v, fallback) => Math.max(0, Math.min(1, finite(v, fallback)));
const kw = (info, key) => Array.isArray(info?.keywords) && info.keywords.includes(key);

export function sceneSurface(info) {
  const f = info?.floats || {}, unlit = /(?:Unlit|Particles)/i.test(info?.shader || '');
  const uv = info?.textures?._MainTex || {};
  // The original GLES programs use the transformed MainTex UV for all three surface samplers.
  const transform = [...[0, 1].map(i => finite(uv.scale?.[i], 1)), ...[0, 1].map(i => finite(uv.offset?.[i], 0))];
  /** @type {Record<string, string>} */
  const names = {};
  for (const [role, slot] of Object.entries(SURFACE_SLOTS)) {
    const enabled = !unlit && kw(info, { normal: '_NORMALMAP', metallic: '_METALLICGLOSSMAP', emission: '_EMISSION' }[role]);
    const name = info?.textures?.[slot]?.texture;
    if (enabled && typeof name === 'string' && name) names[role] = name;
  }
  return { names, transform, unlit, normalScale: finite(f._BumpScale, 1), metallic: unit(f._Metallic, 0),
    smoothness: unit(f._Glossiness, 0.5), glossScale: unit(f._GlossMapScale, 1),
    albedoSmoothness: kw(info, '_SMOOTHNESS_TEXTURE_ALBEDO_CHANNEL_A'),
    emission: !unlit && kw(info, '_EMISSION'),
    specular: !unlit && !kw(info, '_SPECULARHIGHLIGHTS_OFF') && f._SpecularHighlights !== 0,
    reflections: !unlit && !kw(info, '_GLOSSYREFLECTIONS_OFF') && f._GlossyReflections !== 0 };
}
