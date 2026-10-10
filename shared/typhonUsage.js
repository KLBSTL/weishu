// Per-piece formal-round budgets. Board UIDs survive redeploys and promotion.
/** @param {unknown} value @param {{has(uid: number): boolean} | null} [allowed] */
export function typhonUsage(value, allowed = null) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, n] of Object.entries(value).slice(0, 64)) {
    const uid = Number(key);
    if (!Number.isSafeInteger(uid) || uid < 0 || String(uid) !== key || (allowed && !allowed.has(uid))) continue;
    if (Number.isInteger(n) && n > 0) out[key] = Math.min(56, n);
  }
  return out;
}
