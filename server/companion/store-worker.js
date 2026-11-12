import { parentPort } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { memoryClaims } from './memory-claims.js';
import { extendedSchema, persistenceOperation, commitLore, commitStory, forgetStory } from './persistence.js';
import { stagedExpiresAt } from './batch-policy.js';
import { mergeJobSnapshot } from './metrics.js';

export function searchTokens(value) {
  const tokens = String(value || '').normalize('NFKC').toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9_]+/gu) || [];
  return [...new Set(tokens.flatMap(t => /\p{Script=Han}/u.test(t) ? [...t].flatMap((_, i, a) => i + 1 < a.length ? [a.slice(i, i + 2).join('')] : a.length === 1 ? [t] : []) : [t]))];
}
const hash = x => createHash('sha256').update(x).digest('hex');
const json = x => JSON.stringify(x);
function schema(db) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version === 5) return;
  if (version > 5) throw new Error('资料库来自更新版本，请使用对应版本程序。');
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, character_id TEXT, actor_id TEXT, room_id TEXT, at INTEGER, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_scope ON events(character_id,room_id,at);
    CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY, character_id TEXT, actor_id TEXT, room_id TEXT, source_id TEXT, kind TEXT, status TEXT, text TEXT, at INTEGER, value TEXT);
    CREATE INDEX IF NOT EXISTS memory_scope ON memories(character_id,room_id,status);
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(tokens);
    CREATE TABLE IF NOT EXISTS forgotten(source_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS forgotten_text(character_id TEXT,hash TEXT,source_id TEXT,PRIMARY KEY(character_id,hash,source_id));
    CREATE TABLE IF NOT EXISTS progress(character_id TEXT, topic_id TEXT, angle_id TEXT, delivery_id TEXT UNIQUE, value TEXT, PRIMARY KEY(character_id,delivery_id));
    CREATE TABLE IF NOT EXISTS facts(character_id TEXT, fact_id TEXT, value TEXT, PRIMARY KEY(character_id,fact_id));
    CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY,character_id TEXT,status TEXT,expires INTEGER,value TEXT);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE IF NOT EXISTS compiler_notes(character_id TEXT,revision TEXT,value TEXT,PRIMARY KEY(character_id,revision));
    `);
  extendedSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const events = db.prepare("SELECT value FROM events WHERE json_extract(value,'$.type')='user' ORDER BY at,rowid").all();
    const protectedSources = new Set(db.prepare("SELECT DISTINCT m.source_id FROM memories m JOIN memory_changes c ON c.memory_id=m.id WHERE json_extract(c.value,'$.action') IN ('confirmed','dismissed','corrected','forgotten','deleted')").all().map(r => r.source_id));
    for (const { value } of events) {
      const event = JSON.parse(value);
      if (protectedSources.has(event.id)) {
        for (const row of db.prepare("SELECT id,text,value FROM memories WHERE source_id=? AND status='active'").all(event.id)) {
          const meta = JSON.parse(row.value), proposed = memoryClaims(event.text || '');
          if (meta.claim && meta.claim.parserVersion !== 2 && (proposed.length !== 1 || proposed.some(c => c.value !== meta.claim.value || c.polarity !== meta.claim.polarity))) {
            const id = row.id + ':parser-v2-review';
            db.prepare('INSERT OR IGNORE INTO memory_changes VALUES (?,?,?,?,?)').run(id, event.characterId, row.id, Date.now(), json({ id, memoryId: row.id, action: 'review',
              text: '这条手动确认的记忆已保留，请核对：' + row.text, before: meta.claim, proposed, at: Date.now() }));
          }
        }
        continue;
      }
      if (event.deleted || db.prepare('SELECT 1 FROM forgotten WHERE source_id=?').get(event.id)) continue;
      if (db.prepare("SELECT 1 FROM memories WHERE source_id=? AND json_extract(value,'$.claim.parserVersion')=2").get(event.id)) continue;
      db.prepare("UPDATE memories SET status='reindexed' WHERE source_id=? AND kind='user_statement'").run(event.id);
      storeMemory(db, event, 'user_statement', event.text || '');
    }
    db.exec("UPDATE deliveries SET status='cancelled' WHERE status='ready' AND coalesce(json_extract(value,'$.plan.promptRevision'),json_extract(value,'$.expectedPromptRevision')) IS NULL; PRAGMA user_version=5; COMMIT");
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
function storeMemory(db, event, kind, text, suffix = '', suppliedClaim) {
  if (db.prepare('SELECT 1 FROM forgotten WHERE source_id=?').get(event.id)) return;
  if (kind === 'user_statement' && suppliedClaim === undefined) {
    const claims = memoryClaims(text);
    if (!claims.length) return storeMemory(db, event, 'dialogue', text, suffix);
    for (const [i, claim] of claims.entries()) storeMemory(db, event, kind, claim.text, ':claim-v2:' + i, claim);
    return;
  }
  const id = event.id + ':' + kind + suffix;
  if (db.prepare('SELECT 1 FROM memories WHERE id=?').get(id)) return;
  const claim = suppliedClaim || null;
  const preference = claim;
  const previous = preference && db.prepare("SELECT id,value FROM memories WHERE character_id=? AND room_id=? AND status='active' AND json_extract(value,'$.preferenceSlot')=? ORDER BY at DESC LIMIT 1").get(event.characterId, event.roomId, preference.slot);
  const old = previous && JSON.parse(previous.value);
  const conflict = previous && (old.preferenceValue !== preference.value || old.claim?.polarity !== claim?.polarity);
  const pending = !!claim?.ambiguous || conflict && !claim?.explicit && !claim?.additive && claim?.operation !== 'retract';
  if (preference && !pending && !claim?.additive) {
    const extra = claim.operation === 'retract' ? " AND json_extract(value,'$.preferenceValue')=?" : '';
    db.prepare("UPDATE memories SET status='superseded' WHERE character_id=? AND room_id=? AND kind IN ('user_statement','correction') AND status='active' AND json_extract(value,'$.preferenceSlot')=?" + extra)
      .run(event.characterId, event.roomId, preference.slot, ...(extra ? [claim.value] : []));
  }
  const meta = { sourceId: event.id, sourceKind: event.sourceKind || event.type, speakerName: event.speakerName, cardId: event.cardId, preferenceSlot: preference?.slot, preferenceValue: preference?.value, claim };
  const storedKind = claim?.operation === 'retract' ? 'withdrawal' : kind;
  const row = db.prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, event.characterId, event.actorId, event.roomId, event.id, storedKind, pending ? 'pending' : 'active', text, event.at, json(meta));
  if (claim || pending) { const changeId = id + ':created'; db.prepare('INSERT OR IGNORE INTO memory_changes VALUES (?,?,?,?,?)').run(changeId, event.characterId, id, event.at,
    json({ id: changeId, memoryId: id, action: pending ? 'pending' : conflict ? 'replaced' : 'remembered', previousId: previous?.id, text, at: event.at })); }
  db.prepare('INSERT INTO memory_fts(rowid,tokens) VALUES (?,?)').run(row.lastInsertRowid, searchTokens(text).join(' '));
}
function eventRow(db, event) {
  if (event.type === 'assistant' && event.deliveryState === 'displayed') {
    const old = db.prepare('SELECT value FROM events WHERE id=?').get(event.id);
    const displayed = old && JSON.parse(old.value);
    event.displayedAt = displayed?.deliveryState === 'displayed' ? displayed.displayedAt || displayed.at : Date.now();
    event.displayOrder = displayed?.displayOrder || db.prepare(`SELECT coalesce(max(json_extract(value,'$.displayOrder')),0)+1 AS n
      FROM events WHERE character_id=? AND room_id=?`).get(event.characterId, event.roomId).n;
    const delivery = db.prepare('SELECT * FROM deliveries WHERE id=?').get(event.id);
    if (delivery && (delivery.character_id !== event.characterId || delivery.status === 'cancelled' || delivery.expires < Date.now())) throw Object.assign(new Error('待播内容已失效'), { status: 409 });
    if (delivery) {
      const prepared = JSON.parse(delivery.value); event.taskId ||= prepared.taskId || prepared.plan?.id;
      if (event.consumedIds?.length > 1) {
        const parts = prepared.batch?.segments.slice(prepared.index, prepared.index + event.consumedIds.length);
        if (!parts || parts.length !== event.consumedIds.length || parts.some((p, i) => p.id !== event.consumedIds[i])
          || parts.map(p => p.text).join('') !== event.text) throw new Error('组合展示与待播原文不一致');
        for (const part of parts) {
          const other = db.prepare('SELECT * FROM deliveries WHERE id=?').get(part.id);
          if (!other || other.character_id !== event.characterId || other.status !== 'ready' || other.expires < Date.now()) throw new Error('组合待播内容已失效');
          db.prepare("UPDATE deliveries SET status='displayed' WHERE id=?").run(part.id);
        }
      }
      commitLore(db, event, prepared);
    }
    else commitLore(db, event);
    db.prepare("UPDATE deliveries SET status='displayed' WHERE id=?").run(event.id);
  }
  db.prepare('INSERT OR REPLACE INTO events VALUES (?,?,?,?,?,?)').run(event.id, event.characterId, event.actorId, event.roomId, event.at, json(event));
  if (event.type === 'assistant' && event.deliveryState === 'generated') db.prepare('INSERT OR IGNORE INTO deliveries VALUES (?,?,?,?,?)').run(event.id, event.characterId, 'ready', event.at + 180000, json(event));
  if (event.deleted || ['generated', 'cancelled'].includes(event.deliveryState)) return;
  if (event.type === 'user' || event.type === 'assistant') storeMemory(db, event, event.type === 'user' ? 'user_statement' : 'dialogue', event.text || '');
  if (event.type === 'assistant' && event.deliveryState === 'displayed') {
    for (const [i, proposal] of (event.extensionProposals || []).entries()) if (proposal.text) storeMemory(db, event, 'extension', proposal.text, ':' + i);
    if (event.topicId) db.prepare('INSERT OR IGNORE INTO progress VALUES (?,?,?,?,?)').run(event.characterId, event.topicId, event.angleId || String(event.segmentIndex || 0), event.id, json(event));
    commitStory(db, event);
  }
}
function assetFiles(data, dir) {
  mkdirSync(join(dir, 'companion-assets'), { recursive: true });
  for (const asset of data.assets) if (asset.originalBytes) {
    const bytes = Buffer.from(asset.originalBytes, 'base64'), name = hash(bytes) + '.' + (asset.sourceFormat === 'png' ? 'png' : 'json');
    try { writeFileSync(join(dir, 'companion-assets', name), bytes, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || hash(readFileSync(join(dir, 'companion-assets', name))) !== hash(bytes)) throw error; }
    asset.originalPath = name; delete asset.originalBytes;
  }
}
function view(db, dir) {
  const data = JSON.parse(db.prepare('SELECT value FROM config WHERE id=1').get().value);
  data.events = db.prepare('SELECT value FROM events ORDER BY at DESC,rowid DESC LIMIT 2000').all().reverse().map(r => JSON.parse(r.value));
  data.forgottenSources = db.prepare('SELECT source_id FROM forgotten').all().map(row => row.source_id);
  data.forgottenTextHashesByCharacter = {};
  for (const row of db.prepare('SELECT DISTINCT character_id,text,source_id FROM memories WHERE source_id IN (SELECT source_id FROM forgotten)').all()) {
    db.prepare('INSERT OR IGNORE INTO forgotten_text VALUES (?,?,?)').run(row.character_id, hash(json(String(row.text).normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, ''))), row.source_id);
  }
  for (const row of db.prepare('SELECT DISTINCT character_id,hash FROM forgotten_text').all()) {
    (data.forgottenTextHashesByCharacter[row.character_id] ||= []).push(row.hash);
  }
  const file = join(dir, 'companion-view.json'), temporary = file + '.' + process.pid + '.tmp';
  writeFileSync(temporary, json(data)); renameSync(temporary, file); return data;
}
function memoryRows(db, characterId, roomId, query = '', limit = 12) {
  let expanded = query;
  for (const row of db.prepare('SELECT value FROM entity_catalog WHERE character_id=? LIMIT 512').all(characterId)) {
    const entity = JSON.parse(row.value); if (entity.aliases?.some(alias => query.includes(alias))) expanded += ' ' + entity.name;
  }
  const args = [characterId, roomId], words = searchTokens(expanded).slice(0, 24);
  let rows;
  if (words.length) {
    const match = words.map(w => '"' + w.replaceAll('"', '""') + '"').join(' OR ');
    rows = db.prepare(`SELECT m.*,bm25(memory_fts) AS rank FROM memory_fts JOIN memories m ON m.rowid=memory_fts.rowid
      WHERE memory_fts MATCH ? AND m.character_id=? AND m.room_id=? AND m.status='active' ORDER BY rank,m.at DESC LIMIT ?`).all(match, ...args, limit);
  } else rows = db.prepare("SELECT * FROM memories WHERE character_id=? AND room_id=? AND status='active' ORDER BY at DESC,rowid DESC LIMIT ?").all(...args, limit);
  const facts = db.prepare("SELECT * FROM memories WHERE character_id=? AND room_id=? AND status='active' AND kind IN ('user_statement','correction') ORDER BY at DESC,rowid DESC LIMIT ?").all(...args, Math.min(12, limit))
    .filter(r => !query || /记得|记住|名字|叫什么|偏好|喜欢什么/u.test(query) || words.some(w => r.text.includes(w)));
  rows = [...new Map([...facts, ...rows].map(r => [r.id, r])).values()].slice(0, limit);
  return rows.map(r => ({ id: r.id, kind: r.kind, text: r.text, status: r.status, at: r.at, ...JSON.parse(r.value) }));
}
parentPort.on('message', ({ id, directory, operation, payload }) => {
  let db;
  try {
    mkdirSync(directory, { recursive: true });
    db = new DatabaseSync(join(directory, 'companion.sqlite'), { timeout: 3000 }); schema(db);
    let result;
    if (operation === 'init') {
      if (!db.prepare('SELECT 1 FROM config').get()) {
        const data = payload; assetFiles(data, directory); db.exec('BEGIN IMMEDIATE');
        const events = data.events || []; delete data.events;
        db.prepare('INSERT INTO config VALUES (1,?)').run(json(data));
        for (const event of events) eventRow(db, event);
        db.exec('COMMIT');
      }
      result = view(db, directory);
    } else if (operation === 'commit') {
      const data = payload.data; assetFiles(data, directory); delete data.events;
      db.exec('BEGIN IMMEDIATE');
      const old = JSON.parse(db.prepare('SELECT value FROM config WHERE id=1').get().value);
      if (old.revision !== payload.revision || (old.eventRevision || 0) !== payload.eventRevision || (old.memoryRevision || 0) !== payload.memoryRevision) throw Object.assign(new Error('资料已更新，请重新载入后再保存。'), { status: 409 });
      db.prepare('UPDATE config SET value=? WHERE id=1').run(json(data));
      for (const event of payload.events) eventRow(db, event);
      db.exec('COMMIT'); result = view(db, directory);
    } else if (operation === 'recall') result = memoryRows(db, payload.characterId, payload.roomId, payload.query, payload.limit);
    else if (operation === 'memory-edit') {
      db.exec('BEGIN IMMEDIATE');
      const row = db.prepare('SELECT rowid,* FROM memories WHERE id=? AND character_id=?').get(payload.id, payload.characterId);
      if (!row) throw Object.assign(new Error('记忆不存在或不属于当前人物'), { status: 404 });
      if (row.status !== 'active') throw Object.assign(new Error('记忆已更新，请刷新后再操作'), { status: 409 });
      const meta = JSON.parse(row.value), independent = !!meta.claim && !payload.removeMessage;
      if (!independent) { db.prepare('INSERT OR IGNORE INTO forgotten VALUES (?)').run(row.source_id); forgetStory(db, row.character_id, row.source_id); }
      const sources = independent ? [row] : db.prepare('SELECT text FROM memories WHERE source_id=?').all(row.source_id);
      for (const source of sources) db.prepare('INSERT OR IGNORE INTO forgotten_text VALUES (?,?,?)').run(row.character_id, hash(json(String(source.text).normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, ''))), independent ? row.id : row.source_id);
      db.prepare('UPDATE memories SET status=? WHERE ' + (independent ? 'id' : 'source_id') + '=?').run(payload.text ? 'superseded' : 'forgotten', independent ? row.id : row.source_id);
      if (payload.removeMessage) {
        db.prepare('DELETE FROM memory_fts WHERE rowid IN (SELECT rowid FROM memories WHERE source_id=?)').run(row.source_id);
        db.prepare('DELETE FROM memories WHERE source_id=?').run(row.source_id);
        db.prepare('DELETE FROM events WHERE id=?').run(row.source_id);
      }
      if (payload.text) {
        const claim = independent ? { ...meta.claim, ...(memoryClaims(payload.text)[0] || { value: payload.text }), text: payload.text, explicit: true, ambiguous: false, operation: 'assert' } : null;
        storeMemory(db, { id: 'correction-' + payload.correctionId, actorId: row.actor_id, characterId: row.character_id, roomId: row.room_id, at: Date.now() }, 'correction', payload.text, '', claim);
      }
      db.prepare('INSERT INTO memory_changes VALUES (?,?,?,?,?)').run(payload.correctionId, row.character_id, row.id, Date.now(), json({ id: payload.correctionId, memoryId: row.id,
        action: payload.text ? 'corrected' : payload.removeMessage ? 'deleted' : 'forgotten', before: row.text, text: payload.text, at: Date.now() }));
      const data = JSON.parse(db.prepare('SELECT value FROM config WHERE id=1').get().value);
      data.memoryRevision = (data.memoryRevision || 0) + 1; db.prepare('UPDATE config SET value=? WHERE id=1').run(json(data));
      db.prepare("UPDATE deliveries SET status='cancelled' WHERE character_id=? AND status='ready'").run(payload.characterId);
      db.exec('COMMIT'); result = view(db, directory);
    } else if (operation === 'clear-history') {
      db.exec('BEGIN IMMEDIATE');
      const data = JSON.parse(db.prepare('SELECT value FROM config WHERE id=1').get().value);
      const actor = data.actors.find(a => a.id === payload.actorId);
      if (actor?.characterId !== payload.characterId || data.revision !== payload.revision
        || (data.memoryRevision || 0) !== payload.memoryRevision || (data.eventRevision || 0) !== payload.eventRevision) {
        throw Object.assign(new Error('人物或对话已变化，请重新确认清空。'), { status: 409 });
      }
      db.prepare('DELETE FROM memory_fts WHERE rowid IN (SELECT rowid FROM memories WHERE character_id=?)').run(payload.characterId);
      db.prepare('DELETE FROM forgotten WHERE source_id IN (SELECT id FROM events WHERE character_id=? UNION SELECT source_id FROM memories WHERE character_id=?)').run(payload.characterId, payload.characterId);
      for (const table of ['forgotten_text', 'memories', 'events', 'progress', 'deliveries', 'memory_changes', 'lore_state', 'generation_plans', 'story_ledger']) {
        db.prepare(`DELETE FROM ${table} WHERE character_id=?`).run(payload.characterId);
      }
      (data.historyEpochs ||= {})[payload.characterId] = payload.epoch;
      data.memoryRevision = (data.memoryRevision || 0) + 1; data.eventRevision = (data.eventRevision || 0) + 1;
      db.prepare('UPDATE config SET value=? WHERE id=1').run(json(data));
      db.exec('COMMIT'); result = view(db, directory);
    } else if (operation === 'stage') {
      db.exec('BEGIN IMMEDIATE');
      for (const packet of payload.packets) {
        const now = Date.now(), expires = stagedExpiresAt(now, packet.expires);
        db.prepare('INSERT OR IGNORE INTO deliveries VALUES (?,?,?,?,?)').run(packet.id, payload.characterId, 'ready', expires, json({ ...packet, expires }));
        if (payload.revalidate === true) db.prepare("UPDATE deliveries SET value=json_set(?,'$.expires',min(expires,?)),expires=min(expires,?) WHERE id=? AND character_id=? AND status='ready'")
          .run(json({ ...packet, expires }), expires, expires, packet.id, payload.characterId);
      }
      db.prepare("DELETE FROM deliveries WHERE expires<? AND status!='displayed'").run(Date.now() - 3600000);
      db.exec('COMMIT'); result = true;
    } else if (operation === 'job') {
      const previous = db.prepare('SELECT value FROM jobs WHERE id=?').get(payload.taskId);
      db.prepare('INSERT OR REPLACE INTO jobs VALUES (?,?)').run(payload.taskId, json(mergeJobSnapshot(previous ? JSON.parse(previous.value) : {}, payload)));
      db.exec('DELETE FROM jobs WHERE rowid NOT IN (SELECT rowid FROM jobs ORDER BY rowid DESC LIMIT 1000)'); result = true;
    } else if (operation === 'jobs') result = db.prepare('SELECT value FROM jobs ORDER BY rowid DESC LIMIT 100').all().map(r => JSON.parse(r.value));
    else if (operation === 'facts') {
      db.exec('BEGIN IMMEDIATE'); db.prepare('DELETE FROM facts WHERE character_id=?').run(payload.characterId);
      for (const fact of payload.facts) db.prepare('INSERT INTO facts VALUES (?,?,?)').run(payload.characterId, fact.factId, json(fact));
      db.exec('COMMIT'); result = true;
    } else if (operation === 'progress') result = db.prepare('SELECT value FROM progress WHERE character_id=? AND delivery_id NOT IN (SELECT source_id FROM forgotten) ORDER BY rowid').all(payload.characterId).map(r => JSON.parse(r.value));
    else if (operation === 'compiler-notes') {
      if (payload.notes) db.prepare('INSERT OR REPLACE INTO compiler_notes VALUES (?,?,?)').run(payload.characterId, payload.revision, json(payload.notes));
      const row = db.prepare('SELECT value FROM compiler_notes WHERE character_id=? AND revision=?').get(payload.characterId, payload.revision); result = row ? JSON.parse(row.value) : [];
    } else if (operation === 'export') {
      result = JSON.parse(db.prepare('SELECT value FROM config WHERE id=1').get().value);
      result.events = db.prepare('SELECT value FROM events ORDER BY at,rowid').all().map(row => JSON.parse(row.value));
      result.memoryArchive = db.prepare('SELECT * FROM memories').all();
      for (const asset of result.assets) if (asset.originalPath && /^[a-f0-9]{64}\.(?:png|json)$/u.test(asset.originalPath)) asset.originalBytes = readFileSync(join(directory, 'companion-assets', asset.originalPath)).toString('base64');
    } else if (operation === 'recent-history') {
      result={messages:db.prepare(`SELECT value FROM events WHERE character_id=? AND room_id=?
        AND (json_extract(value,'$.type')='user' OR (json_extract(value,'$.type')='assistant' AND json_extract(value,'$.deliveryState')='displayed'))
        AND coalesce(json_extract(value,'$.deleted'),0)=0 ORDER BY rowid DESC LIMIT 15`).all(payload.characterId,payload.roomId).map(r=>JSON.parse(r.value))};
    } else if (operation === 'history-page') {
      const rows = db.prepare(`SELECT rowid AS cursor,value FROM events WHERE character_id=? AND room_id=? AND (? IS NULL OR rowid<?)
        AND (json_extract(value,'$.type')='user' OR (json_extract(value,'$.type')='assistant' AND json_extract(value,'$.deliveryState')='displayed'))
        AND coalesce(json_extract(value,'$.deleted'),0)=0 ORDER BY rowid DESC LIMIT 41`).all(payload.characterId, payload.roomId, payload.cursor, payload.cursor);
      result = { messages: rows.slice(0, 40).reverse().map(r => JSON.parse(r.value)), cursor: rows.length > 40 ? rows[39].cursor : null };
    } else if (operation === 'history') result = db.prepare('SELECT value FROM events WHERE character_id=? AND room_id=? ORDER BY at DESC,rowid DESC LIMIT ?').all(payload.characterId, payload.roomId, payload.limit || 80).reverse().map(r => JSON.parse(r.value));
    else {
      result = persistenceOperation(db, operation, payload);
      if (result === undefined) throw new Error('Unknown store operation');
      if (operation === 'memory-decide') view(db, directory);
    }
    db.close(); db = null; parentPort.postMessage({ id, result });
  } catch (error) {
    try { if (db?.isTransaction) db.exec('ROLLBACK'); db?.close(); } catch { /* original error */ }
    parentPort.postMessage({ id, error: { message: error.message, status: error.status, code: error.code } });
  }
});
