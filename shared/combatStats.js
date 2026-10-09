// Optional extension counters. Kept separate from HP damage/healing and bounded on the wire.
export const EXTENSION_STATS = Object.freeze(['shieldGranted', 'shieldAbsorbed', 'barrierSeconds', 'fieldSeconds', 'layersGranted']);
export function extensionStats(stats) {
  return Object.fromEntries(EXTENSION_STATS.filter((k) => Number.isFinite(stats?.[k]) && stats[k] > 0)
    .map((k) => [k, Math.round(Math.min(1e13, stats[k]) * 1000) / 1000]));
}
