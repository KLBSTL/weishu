/** Opening recruitment filters; neither selection mode disables Alliance effects. */
export const DEFAULT_BAN_CONFIG = Object.freeze({ hardCore: 1, softCore: 3, addon: 5 });

const COUNT_KEYS = ['hardCore', 'softCore', 'addon'];
const LIST_KEYS = ['hardCoreIds', 'softCoreIds', 'addonIds'];
const isBondId = id => typeof id === 'string' && id.length > 0 && id.length <= 128;

export function banCandidates(bonds, inactive = []) {
  const off = new Set(inactive);
  const list = Object.values(bonds || {}).filter(b => b && Number(b.weight) > 0 && !off.has(b.bondId));
  return { core: list.filter(b => b.isCore).map(b => b.bondId), addon: list.filter(b => !b.isCore).map(b => b.bondId) };
}

/** Permissive normalization for stored preferences / a changed difficulty; wire input must pass validBanConfig. */
export function normalizeBanConfig(value, limits = { core: 64, addon: 64 }, candidates = null) {
  if (value?.mode === 'manual') {
    const ids = (key, allowed, max, exclude = []) => [...new Set((Array.isArray(value[key]) ? value[key] : [])
      .filter(id => isBondId(id) && (!allowed || allowed.includes(id)) && !exclude.includes(id)))].sort().slice(0, max);
    const hardCoreIds = ids('hardCoreIds', candidates?.core, limits.core);
    const softCoreIds = ids('softCoreIds', candidates?.core, Math.max(0, limits.core - hardCoreIds.length), hardCoreIds);
    const addonIds = ids('addonIds', candidates?.addon, limits.addon);
    return { hardCore: hardCoreIds.length, softCore: softCoreIds.length, addon: addonIds.length,
      mode: 'manual', hardCoreIds, softCoreIds, addonIds };
  }
  const n = key => Number.isInteger(value?.[key]) && value[key] >= 0 ? value[key] : DEFAULT_BAN_CONFIG[key];
  const hardCore = Math.min(n('hardCore'), limits.core);
  return { hardCore, softCore: Math.min(n('softCore'), Math.max(0, limits.core - hardCore)), addon: Math.min(n('addon'), limits.addon) };
}

/** Structural protocol validation, plus independent mode-specific membership/capacity checks when supplied. */
export function validBanConfig(value, limits = null, candidates = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !COUNT_KEYS.every(k => Number.isInteger(value[k]) && value[k] >= 0 && value[k] <= 64)) return false;
  if (limits && (value.hardCore + value.softCore > limits.core || value.addon > limits.addon)) return false;
  if (value.mode !== 'manual') return value.mode === undefined && LIST_KEYS.every(k => value[k] === undefined);
  if (!LIST_KEYS.every((k, i) => Array.isArray(value[k]) && value[k].length === value[COUNT_KEYS[i]]
    && Array.from(value[k]).every(isBondId) && new Set(value[k]).size === value[k].length)) return false;
  if (value.hardCoreIds.some(id => value.softCoreIds.includes(id))) return false;
  return !candidates || (value.hardCoreIds.every(id => candidates.core.includes(id))
    && value.softCoreIds.every(id => candidates.core.includes(id))
    && value.addonIds.every(id => candidates.addon.includes(id)));
}

/** A room/public/match snapshot owns its manual lists; never expose caller-owned arrays. @param {any} value */
export function cloneBanConfig(value = DEFAULT_BAN_CONFIG) {
  const counts = { hardCore: value.hardCore, softCore: value.softCore, addon: value.addon };
  return value.mode === 'manual' ? { ...counts, mode: 'manual',
    hardCoreIds: value.hardCoreIds.slice(), softCoreIds: value.softCoreIds.slice(), addonIds: value.addonIds.slice() } : counts;
}

/** Reordering the same manual selection does not require teammates to prepare again. */
export function sameBanConfig(a, b) {
  if (!a || !b || a.mode !== b.mode || !COUNT_KEYS.every(k => a[k] === b[k])) return false;
  if (a.mode !== 'manual') return true;
  return LIST_KEYS.every(k => {
    if (!Array.isArray(a[k]) || !Array.isArray(b[k]) || a[k].length !== b[k].length) return false;
    const left = a[k].slice().sort(), right = b[k].slice().sort();
    return left.every((id, i) => id === right[i]);
  });
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
