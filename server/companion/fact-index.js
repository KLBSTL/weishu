import { fingerprint } from './materials.js';

export const FACT_INDEX_VERSION = 1;
const digest = value => fingerprint(value).slice(0, 24);
// Keep negation, sentence boundaries and word order. Similarity is not proof
// that two permissions, people or biographies describe the same fact.
export const factText = (text, name = '') => String(text).replaceAll('{{char}}', name)
  .normalize('NFKC').split('\n').map(line => line.trim().replace(/^[-*]\s+/u, '')).join('').replace(/\s+/gu, '');

export function indexFacts(rows, speaker) {
  const groups = new Map(), sources = [], excluded = [];
  for (const row of rows) {
    const role = row.sourceRole || 'facts';
    sources.push({ id: row.factId, role, ...row.sourceRef });
    if (role !== 'facts') { excluded.push({ id: row.factId, role }); continue; }
    const canonicalText = factText(row.text, speaker?.name);
    const canonicalId = digest(['fact-v1', row.subjectIds, row.ownership, row.visibility, row.timeState, row.status, row.scopeKey, canonicalText]);
    const source = { id: row.factId, key: row.sourceKey, ref: row.sourceRef, legacyEventId: row.eventId };
    const existing = groups.get(canonicalId);
    if (existing) {
      existing.sourceRecords.push(source); existing.sourceRefs.push(row.sourceRef);
      if (!existing.sourceIds.includes(row.factId)) existing.sourceIds.push(row.factId);
      if (!existing.eventAliases.includes(row.eventId)) existing.eventAliases.push(row.eventId);
    } else groups.set(canonicalId, { ...row, canonicalId, canonicalText,
      eventId: digest(['thread-v1', canonicalId]), eventAliases: [row.eventId], sourceIds: [row.factId],
      sourceRefs: [row.sourceRef], sourceRecords: [source] });
  }
  const facts = [...groups.values()], owners = new Map();
  for (const fact of facts) for (const alias of fact.eventAliases) (owners.get(alias) || owners.set(alias, new Set()).get(alias)).add(fact.eventId);
  // Old versions could give different gated books the same text-based event ID.
  // Ambiguous aliases must not silently transfer coverage between these books.
  for (const fact of facts) fact.eventAliases = fact.eventAliases.filter(alias => owners.get(alias).size === 1);
  return { facts, index: { version: FACT_INDEX_VERSION, sources, excluded,
    merges: facts.filter(f => f.sourceRefs.length > 1).map(f => ({ factId: f.factId, canonicalId: f.canonicalId, sourceIds: f.sourceIds, sources: f.sourceRefs, reason: 'same-text-and-scope' })) } };
}

/** Add canonical progress without deleting old IDs, raw messages or manual memory. */
export function reconcileFactProgress(ledger, rows) {
  ledger.used ||= {}; ledger.progress ||= {};
  const topics = new Map();
  for (const row of rows) {
    const target = row.topic || row.eventId, aliases = row.topicAliases || row.eventAliases || [];
    for (const alias of aliases) topics.set(alias, target);
    for (const point of row.factPoints || []) {
      const previous = (point.aliases || []).map(alias => ledger.coverage?.[alias]).find(Boolean);
      if (previous) { ledger.coverage ||= {}; ledger.coverage[point.id] ||= previous; }
    }
    const progress = [target, ...aliases].map(id => ledger.progress[id]).filter(Boolean);
    if ([target, ...aliases].some(id => ledger.used[id])) ledger.used[target] = true;
    if (!progress.length) continue;
    const ids = [], heard = [];
    for (const part of progress) for (const [i, id] of (part.ids || []).entries()) if (!ids.includes(id)) { ids.push(id); heard.push(part.heard?.[i] || ''); }
    const completed = !!ledger.used[target] || progress.some(p => p.completed);
    ledger.progress[target] = { ...progress[0], ids, heard, completed, status: completed ? 'completed' : 'paused',
      informationPoints: [...new Map(progress.flatMap(p => p.informationPoints || []).map(p => [p.id || JSON.stringify(p), p])).values()].slice(-24) };
    if (completed) ledger.used[target] = true;
  }
  if (ledger.recent) ledger.recent = ledger.recent.map(row => topics.has(row.topic) ? { ...row, topic: topics.get(row.topic) } : row);
  return ledger;
}
