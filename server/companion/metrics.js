const percentile = (values, p) => values.length ? values[Math.max(0, Math.ceil(values.length * p) - 1)] : null;
/** Merge attempt snapshots by identity; a later fast retry cannot erase the first wait. */
export function mergeJobSnapshot(previous = {}, incoming) {
  const union = (key, limit) => [...new Map([...(previous[key] || []), ...(incoming[key] || [])].map(row => [row.id, row])).values()].slice(-limit);
  const row = { ...previous, ...incoming, telemetryVersion: 2 };
  row.scopes = union('scopes', 64); row.httpAttempts = union('httpAttempts', 64); row.events = union('events', 128);
  row.startedAt = Math.min(previous.startedAt ?? Infinity, incoming.startedAt ?? Infinity);
  if (!Number.isFinite(row.startedAt)) delete row.startedAt;
  row.elapsedMs = Math.max(previous.elapsedMs || 0, incoming.elapsedMs || 0);
  row.queueMs = Math.max(previous.queueMs || 0, incoming.queueMs || 0);
  row.attempts = Math.max(previous.attempts || 0, incoming.attempts || 0, row.httpAttempts.length);
  row.outputTokens = row.httpAttempts.length && row.httpAttempts.every(a => Number.isFinite(a.outputTokens))
    ? row.httpAttempts.reduce((n, a) => n + a.outputTokens, 0) : null;
  return row;
}
/** Only measured samples participate; absent provider usage is never reconstructed from characters. */
export function summarizeJobs(jobs) {
  const groups = new Map();
  for (const row of jobs) { const key = row.source || 'unknown'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  return [...groups].map(([source, rows]) => {
    const measured = key => rows.flatMap(r => Number.isFinite(r[key]) && r[key] >= 0 ? [r[key]] : []).sort((a, b) => a - b);
    const preparation = rows.flatMap(r => Number.isFinite(r.elapsedMs) ? [r.elapsedMs + (r.telemetryVersion === 2 ? 0 : r.contextMs || 0)] : []).sort((a, b) => a - b);
    return { source, count: rows.length, measured: preparation.length, p50Ms: percentile(preparation, .5), p95Ms: percentile(preparation, .95),
      displayP50Ms: percentile(measured('displayMs'), .5), displayP95Ms: percentile(measured('displayMs'), .95),
      cancelled: rows.filter(r => r.status === 'cancelled').length, timedOut: rows.filter(r => r.status === 'timeout').length,
      failed: rows.filter(r => r.status === 'failed').length, attempts: measured('attempts').reduce((n, v) => n + v, 0),
      usageMissing: rows.filter(r => r.outputTokens == null && r.attempts > 0).length };
  });
}
