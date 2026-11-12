// Display cadence and provider output size are different budgets. Keep drafts
// long enough for the supported 10–60 second cadence, without keeping them forever.
export const MAX_BATCH_LIFETIME_MS = 900000;
export function batchExpiresAt(now, count) {
  const segments = Math.max(1, count);
  return now + Math.min(MAX_BATCH_LIFETIME_MS, (segments + 1) * 60000 + 120000);
}
export function stagedExpiresAt(now, expires) {
  return Number.isFinite(expires) ? Math.min(expires, now + MAX_BATCH_LIFETIME_MS) : now + 180000;
}
