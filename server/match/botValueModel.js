// Explicit, versioned local PREP ranking models. A score is not a calibrated whole-game win probability.
import { createHash } from 'node:crypto';

export const PREP_FEATURES = Object.freeze(['strength','damage','growth','economy','level','survival','core','merges']);
export const PREP_DEFAULT_WEIGHTS = Object.freeze([1, 8, .5, .5, 4, 4, 1, 1.5]);
export const PREP_MODEL_VERSION = 2;
const hashes = new WeakMap();
export function prepRuleHash(gd) {
  const data = gd.raw;
  // Include every data table (boss/wave/tuning rules too), and the selected difficulty, not just operator tables.
  if (!hashes.has(data)) hashes.set(data, createHash('sha256').update(JSON.stringify(
    Object.keys(data).sort().map(k => [k,data[k]])
  )).digest('hex'));
  return createHash('sha256').update(`${PREP_MODEL_VERSION}|${gd.modeId}|${hashes.get(data)}`).digest('hex');
}
export function validatePrepModel(model, gd) {
  if (!model || model.version !== PREP_MODEL_VERSION || model.kind !== 'linear-prep-value') return 'MODEL_SCHEMA';
  if (JSON.stringify(model.features) !== JSON.stringify(PREP_FEATURES)) return 'MODEL_FEATURES';
  if (!Array.isArray(model.weights) || model.weights.length !== PREP_FEATURES.length || model.weights.some(x => !Number.isFinite(x) || x < 0 || x > 100)) return 'MODEL_WEIGHTS';
  if (model.rules !== prepRuleHash(gd)) return 'MODEL_RULES';
  return null;
}
export function prepValue(features, weights = PREP_DEFAULT_WEIGHTS) {
  return PREP_FEATURES.reduce((sum, key, i) => sum + Math.max(-1000, Math.min(1000, Number(features[key]) || 0)) * weights[i], 0);
}
