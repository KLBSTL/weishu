const p95 = values => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] : null;
export function refillThreshold(samples = [], cooldownMs = 0) {
  const total = p95(samples.map(s => s.totalMs).filter(Number.isFinite));
  const service = p95(samples.map(s => s.serviceMs).filter(Number.isFinite));
  return Math.max(samples.length >= 5 ? total || 90000 : Math.max(90000, total || 0), Math.max(0, cooldownMs) + (service || 45000)) + 15000;
}
/** Use due times and absolute expiry, matching the ACK-to-next-display scheduler. */
export function bufferCoverage(buffers, now, intervalMs) {
  let due = now, last = now, segments = 0;
  for (const ready of buffers.filter(Boolean)) {
    due = Math.max(due, ready.notBefore || now);
    for (const _part of ready.batch?.segments.slice(ready.index) || []) {
      if (due >= ready.expires) break;
      segments++; last = due + intervalMs; due = last;
    }
  }
  return { coverageMs: Math.max(0, last - now), segments };
}
