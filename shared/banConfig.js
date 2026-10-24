/** Opening recruitment filters; random filters do not disable Alliance effects. */
export const DEFAULT_BAN_CONFIG = Object.freeze({ hardCore: 1, softCore: 3, addon: 5 });

export function banCandidates(bonds, inactive = []) {
  const off = new Set(inactive);
  const list = Object.values(bonds || {}).filter(b => b && Number(b.weight) > 0 && !off.has(b.bondId));
  return { core: list.filter(b => b.isCore).map(b => b.bondId), addon: list.filter(b => !b.isCore).map(b => b.bondId) };
}

export function normalizeBanConfig(value, limits = { core: 64, addon: 64 }) {
  const n = key => Number.isInteger(value?.[key]) && value[key] >= 0 ? value[key] : DEFAULT_BAN_CONFIG[key];
  const hardCore = Math.min(n('hardCore'), limits.core);
  return { hardCore, softCore: Math.min(n('softCore'), Math.max(0, limits.core - hardCore)), addon: Math.min(n('addon'), limits.addon) };
}

export function validBanConfig(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && ['hardCore', 'softCore', 'addon'].every(k => Number.isInteger(value[k]) && value[k] >= 0 && value[k] <= 64);
}

/** Natural identities only. Static mode exclusions retain their existing all-label rule. */
export function bannedByBonds(bonds, isCore, { hard = [], soft = [], addon = [], staticOff = [] } = {}) {
  if (!Array.isArray(bonds) || !bonds.length) return false;
  const fixed = new Set(staticOff), hardSet = new Set(hard);
  if (bonds.some(b => hardSet.has(b)) || bonds.every(b => fixed.has(b))) return true;
  const cores = bonds.filter(isCore), small = bonds.filter(b => !isCore(b));
  const off = new Set([...soft, ...addon, ...staticOff]);
  if (cores.length === 0) return small.every(b => off.has(b));
  if (cores.length === 1 && bonds.length === 1) return off.has(cores[0]);
  return cores.length > 0 && small.length > 0 && bonds.every(b => off.has(b));
}
