import { createHash, randomUUID } from 'node:crypto';
import { reconcileFactProgress } from './fact-index.js';
const json = JSON.stringify;
const digest = value => createHash('sha256').update(json(value)).digest('hex').slice(0, 24);

export function extendedSchema(db) {
  try { db.exec(`BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS entity_catalog(character_id TEXT,id TEXT,value TEXT,PRIMARY KEY(character_id,id));
    CREATE TABLE IF NOT EXISTS source_map(character_id TEXT,source_key TEXT,source_hash TEXT,event_id TEXT,value TEXT,PRIMARY KEY(character_id,source_key));
    CREATE TABLE IF NOT EXISTS research_pieces(character_id TEXT,piece_key TEXT,value TEXT,PRIMARY KEY(character_id,piece_key));
    CREATE TABLE IF NOT EXISTS lore_state(character_id TEXT,room_id TEXT,entry_id TEXT,value TEXT,PRIMARY KEY(character_id,room_id,entry_id));
    CREATE TABLE IF NOT EXISTS generation_plans(id TEXT PRIMARY KEY,character_id TEXT,value TEXT);
    CREATE TABLE IF NOT EXISTS memory_changes(id TEXT PRIMARY KEY,character_id TEXT,memory_id TEXT,at INTEGER,value TEXT);
    CREATE TABLE IF NOT EXISTS editor_drafts(character_id TEXT,kind TEXT,value TEXT,PRIMARY KEY(character_id,kind));
    CREATE TABLE IF NOT EXISTS story_ledger(character_id TEXT PRIMARY KEY,value TEXT);
    PRAGMA user_version=4; COMMIT;`); }
  catch (error) { try { db.exec('ROLLBACK'); } catch { /* No transaction began. */ } throw error; }
}
export function commitLore(db, event, prepared) {
  const proposal = event.loreProposal || prepared?.loreProposal;
  for (const [id, value] of Object.entries(proposal || {})) {
    const taskId = event.taskId || prepared?.taskId || prepared?.plan?.id;
    const previous = db.prepare('SELECT value FROM lore_state WHERE character_id=? AND room_id=? AND entry_id=?').get(event.characterId, event.roomId, id);
    if (taskId && previous && JSON.parse(previous.value).taskId === taskId) continue;
    const cursor = db.prepare(`SELECT count(*) AS n FROM events WHERE character_id=? AND room_id=? AND coalesce(json_extract(value,'$.deleted'),0)=0
      AND (json_extract(value,'$.type')='user' OR json_extract(value,'$.deliveryState')='displayed')`).get(event.characterId, event.roomId).n + 1;
    const effect = value.continuing ? { ...value, taskId } : { ...value, taskId, stickyUntil: cursor + (value.sticky || 0), cooldownUntil: cursor + (value.sticky || 0) + (value.cooldown || 0) };
    db.prepare('INSERT OR REPLACE INTO lore_state VALUES (?,?,?,?)').run(event.characterId, event.roomId, id, json(effect));
  }
}
export function commitStory(db, event) {
  const saved = db.prepare('SELECT value FROM story_ledger WHERE character_id=?').get(event.characterId);
  const ledger = saved ? JSON.parse(saved.value) : { used: {}, progress: {}, recent: [] };
  ledger.heard ||= {};
  const room = event.roomId || 'direct:' + event.actorId;
  (ledger.heard[room] ||= {})[digest(String(event.text || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, ''))] = { id: event.id, source: event.sourceKind, at: event.at };
  if (!event.topicId) {
    if (!ledger.recent.some(r => r.segmentId === event.id)) ledger.recent = [...ledger.recent, { text: event.text, segmentId: event.id, source: event.sourceKind, summary: event.text.slice(0, 100) }].slice(-48);
    db.prepare('INSERT OR REPLACE INTO story_ledger VALUES (?,?)').run(event.characterId, json(ledger)); return;
  }
  const progress = (ledger.progress ||= {})[event.topicId] ||= { ids: [], heard: [], completed: false };
  if (progress.ids.includes(event.id)) return;
  progress.ids.push(...new Set([event.id, ...(event.consumedIds || [])])); progress.heard.push(event.text); progress.completed ||= !!event.topicFinal;
  progress.status = progress.completed ? 'completed' : 'paused';
  ledger.coverage ||= {};
  for (const point of event.informationPoints || []) if (point.id) ledger.coverage[point.id] = { deliveryId: event.id, sourceIds: point.sourceIds || [] };
  progress.informationPoints = [...(progress.informationPoints || []), ...(event.informationPoints || [{ text: event.text, sourceIds: event.factIds || [] }])].slice(-24);
  if (event.topicFinal) (ledger.used ||= {})[event.topicId] = true;
  ledger.recent = [...(ledger.recent || []), { text: event.text, topic: event.topicId, segmentId: event.id, summary: event.text.slice(0, 100) }].slice(-48);
  db.prepare('INSERT OR REPLACE INTO story_ledger VALUES (?,?)').run(event.characterId, json(ledger));
}
export function forgetStory(db, characterId, sourceId) {
  const saved = db.prepare('SELECT value FROM story_ledger WHERE character_id=?').get(characterId);
  const event = db.prepare('SELECT value FROM events WHERE id=? AND character_id=?').get(sourceId, characterId);
  if (!saved || !event) return;
  const row = JSON.parse(event.value), ledger = JSON.parse(saved.value), ids = new Set([sourceId, ...(row.consumedIds || [])]);
  ledger.recent = (ledger.recent || []).filter(r => !ids.has(r.segmentId));
  for (const room of Object.values(ledger.heard || {})) for (const [key, value] of Object.entries(room)) if (ids.has(value.id)) delete room[key];
  for (const [key, point] of Object.entries(ledger.coverage || {})) if (ids.has(point.deliveryId)) delete ledger.coverage[key];
  for (const [topic, progress] of Object.entries(ledger.progress || {})) {
    if (!progress.ids.some(id => ids.has(id))) continue;
    progress.ids = progress.ids.filter(id => !ids.has(id)); progress.heard = progress.heard.filter(text => text !== row.text);
    progress.informationPoints = []; progress.completed = false; progress.status = 'paused';
    if (ledger.used) delete ledger.used[topic];
    if (!progress.ids.length) delete ledger.progress[topic];
  }
  db.prepare('DELETE FROM progress WHERE character_id=? AND delivery_id=?').run(characterId, sourceId);
  db.prepare('UPDATE story_ledger SET value=? WHERE character_id=?').run(json(ledger), characterId);
}
export function persistenceOperation(db, operation, payload) {
  const character = payload.characterId;
  if (operation === 'invalidate-prompts') {
    const rows = db.prepare("SELECT id,value,character_id FROM deliveries WHERE status='ready'").all();
    for (const row of rows) if ((payload.all || row.character_id === character) && (!payload.roomId || JSON.parse(row.value).plan?.roomId === payload.roomId)) db.prepare("UPDATE deliveries SET status='cancelled' WHERE id=?").run(row.id);
    return { ok: true };
  }
  if (operation === 'compile-facts') {
    db.exec('BEGIN IMMEDIATE');
    const old = db.prepare('SELECT * FROM source_map WHERE character_id=?').all(character);
    const facts = payload.facts.map(fact => {
      const aliases = new Set(fact.eventAliases || []);
      for (const source of fact.sourceRecords || [{ key: fact.sourceKey, ref: fact.sourceRef, id: fact.factId }]) {
        const key = source.key || digest([source.ref.path, fact.subjectIds, fact.text]);
        const previous = old.find(o => o.source_hash === source.ref.sourceHash && JSON.parse(o.value).path === source.ref.path);
        if (previous) aliases.add(previous.event_id);
        db.prepare('INSERT OR REPLACE INTO source_map VALUES (?,?,?,?,?)').run(character, key, source.ref.sourceHash, fact.eventId,
          json({ path: source.ref.path, factId: fact.factId, sourceId: source.id, canonicalId: fact.canonicalId }));
      }
      return { ...fact, eventAliases: [...aliases].filter(id => id !== fact.eventId) };
    });
    const owners = new Map();
    for (const fact of facts) for (const alias of fact.eventAliases) (owners.get(alias) || owners.set(alias, new Set()).get(alias)).add(fact.eventId);
    for (const fact of facts) fact.eventAliases = fact.eventAliases.filter(alias => owners.get(alias).size === 1);
    db.prepare('DELETE FROM facts WHERE character_id=?').run(character);
    for (const fact of facts) db.prepare('INSERT INTO facts VALUES (?,?,?)').run(character, fact.factId, json(fact));
    db.prepare('DELETE FROM entity_catalog WHERE character_id=?').run(character);
    for (const entity of payload.entities || []) db.prepare('INSERT OR REPLACE INTO entity_catalog VALUES (?,?,?)').run(character, entity.id, json(entity));
    const saved = db.prepare('SELECT value FROM story_ledger WHERE character_id=?').get(character);
    if (saved) db.prepare('UPDATE story_ledger SET value=? WHERE character_id=?').run(json(reconcileFactProgress(JSON.parse(saved.value), facts)), character);
    db.exec('COMMIT'); return { facts };
  }
  if (operation === 'research-pieces') {
    if (payload.pieces) {
      db.exec('BEGIN IMMEDIATE');
      for (const piece of payload.pieces) db.prepare('INSERT OR REPLACE INTO research_pieces VALUES (?,?,?)').run(character, piece.key, json(piece));
      db.exec('COMMIT');
    }
    return db.prepare('SELECT value FROM research_pieces WHERE character_id=?').all(character).map(r => JSON.parse(r.value));
  }
  if (operation === 'lore-context') {
    const messages = db.prepare(`SELECT value FROM events WHERE character_id=? AND room_id=?
      AND coalesce(json_extract(value,'$.deleted'),0)=0 AND id NOT IN(SELECT source_id FROM forgotten)
      AND (json_extract(value,'$.type')='user' OR json_extract(value,'$.deliveryState')='displayed') ORDER BY at DESC,rowid DESC LIMIT ?`)
      .all(character, payload.roomId, Math.max(1, Math.min(1000, payload.limit || 1000))).reverse().map(r => JSON.parse(r.value));
    const count = db.prepare(`SELECT count(*) AS n FROM events WHERE character_id=? AND room_id=? AND coalesce(json_extract(value,'$.deleted'),0)=0
      AND id NOT IN(SELECT source_id FROM forgotten) AND (json_extract(value,'$.type')='user' OR json_extract(value,'$.deliveryState')='displayed')`).get(character, payload.roomId).n;
    const state = Object.fromEntries(db.prepare('SELECT entry_id,value FROM lore_state WHERE character_id=? AND room_id=?').all(character, payload.roomId).map(r => [r.entry_id, JSON.parse(r.value)]));
    return { messages, count, state };
  }
  if (operation === 'last-displayed') {
    const row = db.prepare(`SELECT value FROM events WHERE character_id=? AND room_id=?
      AND json_extract(value,'$.type')='assistant' AND json_extract(value,'$.deliveryState')='displayed'
      AND coalesce(json_extract(value,'$.deleted'),0)=0 AND id NOT IN(SELECT source_id FROM forgotten)
      AND (json_extract(value,'$.audience') IS NULL OR EXISTS(SELECT 1 FROM json_each(events.value,'$.audience') WHERE value=?))
      ORDER BY coalesce(json_extract(value,'$.displayOrder'),0) DESC,
      coalesce(json_extract(value,'$.displayedAt'),at) DESC,rowid DESC LIMIT 1`).get(character, payload.roomId, payload.actorId);
    return row ? JSON.parse(row.value) : null;
  }
  if (operation === 'pending-deliveries') return db.prepare("SELECT value FROM deliveries WHERE character_id=? AND status='ready' AND expires>? ORDER BY rowid").all(character, Date.now()).map(r => JSON.parse(r.value));
  if (operation === 'story-ledger') {
    const old = db.prepare('SELECT value FROM story_ledger WHERE character_id=?').get(character);
    if (old && JSON.parse(old.value).heard) return JSON.parse(old.value);
    const seed = payload.seed || { used: {}, progress: {}, recent: [] };
    const ledger = old ? { ...JSON.parse(old.value), heard: {} } : { used: seed.used || {}, progress: seed.progress || {}, recent: (seed.recent || []).slice(-48), heard: {} };
    for (const row of db.prepare("SELECT value FROM events WHERE character_id=? AND json_extract(value,'$.deliveryState')='displayed' AND coalesce(json_extract(value,'$.deleted'),0)=0").all(character)) {
      const e = JSON.parse(row.value); (ledger.heard[e.roomId] ||= {})[digest(String(e.text || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, ''))] = { id: e.id, at: e.at };
    }
    db.prepare('INSERT OR REPLACE INTO story_ledger VALUES (?,?)').run(character, json(ledger)); return ledger;
  }
  if (operation === 'generation-plan') {
    db.prepare('INSERT OR REPLACE INTO generation_plans VALUES (?,?,?)').run(payload.plan.id, character, json(payload.plan));
    db.prepare('DELETE FROM generation_plans WHERE rowid NOT IN(SELECT rowid FROM generation_plans ORDER BY rowid DESC LIMIT 1000)').run();
    const job = db.prepare('SELECT value FROM jobs WHERE id=?').get(payload.plan.id);
    if (job) {
      const value = { ...JSON.parse(job.value), phases: payload.plan.phases };
      if (Number.isFinite(payload.plan.validationMs)) value.validationMs = payload.plan.validationMs;
      if (value.phases.ready) value.status = 'ready';
      db.prepare('UPDATE jobs SET value=? WHERE id=?').run(json(value), payload.plan.id);
    }
    return true;
  }
  if (operation === 'display-metrics') {
    const row = db.prepare('SELECT value FROM events WHERE id=? AND character_id=?').get(payload.id, character);
    if (!row) return { ok: false };
    const event = JSON.parse(row.value); if (event.deliveryState !== 'displayed') return { ok: false };
    if (Number.isFinite(payload.renderedAt) && Math.abs(payload.renderedAt - Date.now()) <= 300000) event.renderedAt ||= payload.renderedAt;
    if (Number.isFinite(payload.displayMs) && payload.displayMs >= 0 && payload.displayMs < 300000) event.displayMs ??= payload.displayMs;
    db.prepare('UPDATE events SET value=? WHERE id=?').run(json(event), payload.id);
    const job = event.taskId && db.prepare('SELECT value FROM jobs WHERE id=?').get(event.taskId);
    if (job) db.prepare('UPDATE jobs SET value=? WHERE id=?').run(json({ ...JSON.parse(job.value), status: 'displayed', renderedAt: event.renderedAt, displayMs: event.displayMs, acknowledgedAt: Date.now() }), event.taskId);
    return { ok: true };
  }
  if (operation === 'editor-draft') {
    if (payload.value === null) db.prepare('DELETE FROM editor_drafts WHERE character_id=? AND kind=?').run(character, payload.kind);
    else if (payload.value !== undefined) db.prepare('INSERT OR REPLACE INTO editor_drafts VALUES (?,?,?)').run(character, payload.kind, json(payload.value));
    const row = db.prepare('SELECT value FROM editor_drafts WHERE character_id=? AND kind=?').get(character, payload.kind); return { draft: row ? JSON.parse(row.value) : null };
  }
  if (operation === 'memory-pending') return db.prepare("SELECT id,text,value FROM memories WHERE character_id=? AND status='pending' ORDER BY at DESC LIMIT 80").all(character).map(r => ({ ...r, meta: JSON.parse(r.value) }));
  if (operation === 'memory-changes') return db.prepare('SELECT value FROM memory_changes WHERE character_id=? ORDER BY at DESC LIMIT 80').all(character).map(r => JSON.parse(r.value));
  if (operation === 'memory-decide') {
    db.exec('BEGIN IMMEDIATE');
    const memory = db.prepare("SELECT * FROM memories WHERE id=? AND character_id=? AND status='pending'").get(payload.id, character);
    if (!memory) throw Object.assign(new Error('这条待确认记忆已变化。'), { status: 409 });
    const meta = JSON.parse(memory.value);
    if (payload.accept && meta.claim && !meta.claim.additive) {
      const extra = meta.claim.operation === 'retract' ? " AND json_extract(value,'$.preferenceValue')=?" : '';
      db.prepare("UPDATE memories SET status='superseded' WHERE character_id=? AND room_id=? AND status='active' AND json_extract(value,'$.preferenceSlot')=?" + extra)
        .run(character, memory.room_id, meta.preferenceSlot, ...(extra ? [meta.preferenceValue] : []));
    }
    db.prepare('UPDATE memories SET status=? WHERE id=?').run(payload.accept ? 'active' : 'forgotten', memory.id);
    const change = { id: randomUUID(), memoryId: memory.id, action: payload.accept ? 'confirmed' : 'dismissed', text: memory.text, at: Date.now() };
    db.prepare('INSERT INTO memory_changes VALUES (?,?,?,?,?)').run(change.id, character, memory.id, change.at, json(change));
    const data = JSON.parse(db.prepare('SELECT value FROM config WHERE id=1').get().value); data.memoryRevision = (data.memoryRevision || 0) + 1;
    db.prepare('UPDATE config SET value=? WHERE id=1').run(json(data));
    db.prepare("UPDATE deliveries SET status='cancelled' WHERE character_id=? AND status='ready'").run(character);
    db.exec('COMMIT'); return { ok: true };
  }
  return undefined;
}
