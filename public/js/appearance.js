// Browser-only visual preferences. No server intents, simulation data or RNG depend on these values.
const KEY = 'sp:appearance:v1';
const caches = new WeakMap();
const fallback = {};
const storageDefault = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export function appearanceId(id) { return /^(char_\d+_[a-zA-Z0-9]+)/.exec(String(id || ''))?.[0] || null; }
function records(storage) {
  if (!storage) return fallback;
  if (!caches.has(storage)) {
    let value = {};
    try { const json = JSON.parse(storage.getItem(KEY) || '{}'); if (json && typeof json === 'object' && !Array.isArray(json)) value = json; } catch { /* default appearance */ }
    caches.set(storage, value);
  }
  return caches.get(storage);
}
export function readAppearance(id, storage = storageDefault()) {
  const value = records(storage)[appearanceId(id)] || {};
  return { skin: typeof value.skin === 'string' ? value.skin : null, animate: value.animate !== false };
}
export function setAppearance(id, patch, storage = storageDefault()) {
  const charId = appearanceId(id); if (!charId) return;
  const value = { ...readAppearance(charId, storage), ...patch };
  const map = records(storage); map[charId] = { skin: typeof value.skin === 'string' && value.skin ? value.skin : null, animate: value.animate !== false };
  try { storage?.setItem(KEY, JSON.stringify(map)); } catch { /* keep the in-memory preference */ }
  if (typeof globalThis.CustomEvent === 'function') globalThis.dispatchEvent?.(new CustomEvent('sp:appearance', { detail: { charId } }));
  return readAppearance(charId, storage);
}
globalThis.addEventListener?.('storage', event => {
  if (event.key === KEY) { const storage = storageDefault(); if (storage) caches.delete(storage); globalThis.dispatchEvent?.(new CustomEvent('sp:appearance')); }
});
