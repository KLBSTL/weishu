import { parentPort } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { preferenceClaim } from './knowledge.js';

export function searchTokens(value) {
  const tokens = String(value || '').normalize('NFKC').toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9_]+/gu) || [];
  return [...new Set(tokens.flatMap(t => /\p{Script=Han}/u.test(t) ? [...t].flatMap((_, i, a) => i + 1 < a.length ? [a.slice(i, i + 2).join('')] : a.length === 1 ? [t] : []) : [t]))];
}
const hash = x => createHash('sha256').update(x).digest('hex');
const json = x => JSON.stringify(x);
function schema(db) {
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
    PRAGMA user_version=2;`);
}
function storeMemory(db, event, kind, text, suffix = '') {
  if (db.prepare('SELECT 1 FROM forgotten WHERE source_id=?').get(event.id)) return;
  const id = event.id + ':' + kind + suffix;
  if (db.prepare('SELECT 1 FROM memories WHERE id=?').get(id)) return;
  const preference = kind === 'user_statement' ? preferenceClaim(text) : null;
  if (preference) db.prepare("UPDATE memories SET status='superseded' WHERE character_id=? AND room_id=? AND kind='user_statement' AND json_extract(value,'$.preferenceSlot')=?").run(event.characterId, event.roomId, preference.slot);
  const meta = { sourceId: event.id, sourceKind: event.sourceKind || event.type, speakerName: event.speakerName, cardId: event.cardId, preferenceSlot: preference?.slot, preferenceValue: preference?.value };
  const row = db.prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, event.characterId, event.actorId, event.roomId, event.id, kind, 'active', text, event.at, json(meta));
  db.prepare('INSERT INTO memory_fts(rowid,tokens) VALUES (?,?)').run(row.lastInsertRowid, searchTokens(text).join(' '));
}
function eventRow(db, event) {
  if (event.type === 'assistant' && event.deliveryState === 'displayed') {
    const delivery = db.prepare('SELECT * FROM deliveries WHERE id=?').get(event.id);
    if (delivery && (delivery.character_id !== event.characterId || delivery.status === 'cancelled' || delivery.expires < Date.now())) throw Object.assign(new Error('待播内容已失效'), { status: 409 });
    if (delivery) { const prepared = JSON.parse(delivery.value); event.taskId ||= prepared.taskId; }
    db.prepare("UPDATE deliveries SET status='displayed' WHERE id=?").run(event.id);
  }
  db.prepare('INSERT OR REPLACE INTO events VALUES (?,?,?,?,?,?)').run(event.id, event.characterId, event.actorId, event.roomId, event.at, json(event));
  if (event.type === 'assistant' && event.deliveryState === 'generated') db.prepare('INSERT OR IGNORE INTO deliveries VALUES (?,?,?,?,?)').run(event.id, event.characterId, 'ready', event.at + 180000, json(event));
  if (event.deleted || ['generated', 'cancelled'].includes(event.deliveryState)) return;
  if (event.type === 'user' || event.type === 'assistant') storeMemory(db, event, event.type === 'user' ? 'user_statement' : 'dialogue', event.text || '');
  if (event.type === 'assistant' && event.deliveryState === 'displayed') {
    for (const [i, proposal] of (event.extensionProposals || []).entries()) if (proposal.text) storeMemory(db, event, 'extension', proposal.text, ':' + i);
    if (event.topicId) db.prepare('INSERT OR IGNORE INTO progress VALUES (?,?,?,?,?)').run(event.characterId, event.topicId, event.angleId || String(event.segmentIndex || 0), event.id, json(event));
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
  const args = [characterId, roomId], words = searchTokens(query).slice(0, 24);
  let rows;
  if (words.length) {
    const match = words.map(w => '"' + w.replaceAll('"', '""') + '"').join(' OR ');
    rows = db.prepare(`SELECT m.*,bm25(memory_fts) AS rank FROM memory_fts JOIN memories m ON m.rowid=memory_fts.rowid
      WHERE memory_fts MATCH ? AND m.character_id=? AND m.room_id=? AND m.status='active' ORDER BY rank,m.at DESC LIMIT ?`).all(match, ...args, limit);
  } else rows = db.prepare("SELECT * FROM memories WHERE character_id=? AND room_id=? AND status='active' ORDER BY at DESC,rowid DESC LIMIT ?").all(...args, limit);
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
      db.prepare('INSERT OR IGNORE INTO forgotten VALUES (?)').run(row.source_id);
      for (const source of db.prepare('SELECT text FROM memories WHERE source_id=?').all(row.source_id)) db.prepare('INSERT OR IGNORE INTO forgotten_text VALUES (?,?,?)').run(row.character_id, hash(json(String(source.text).normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, ''))), row.source_id);
      db.prepare('UPDATE memories SET status=? WHERE source_id=?').run(payload.text ? 'superseded' : 'forgotten', row.source_id);
      if (payload.removeMessage) {
        db.prepare('DELETE FROM memory_fts WHERE rowid IN (SELECT rowid FROM memories WHERE source_id=?)').run(row.source_id);
        db.prepare('DELETE FROM memories WHERE source_id=?').run(row.source_id);
        db.prepare('DELETE FROM events WHERE id=?').run(row.source_id);
      }
      if (payload.text) storeMemory(db, { id: 'correction-' + payload.correctionId, actorId: row.actor_id, characterId: row.character_id, roomId: row.room_id, at: Date.now() }, 'correction', payload.text);
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
      for (const table of ['forgotten_text', 'memories', 'events', 'progress', 'deliveries']) {
        db.prepare(`DELETE FROM ${table} WHERE character_id=?`).run(payload.characterId);
      }
      (data.historyEpochs ||= {})[payload.characterId] = payload.epoch;
      data.memoryRevision = (data.memoryRevision || 0) + 1; data.eventRevision = (data.eventRevision || 0) + 1;
      db.prepare('UPDATE config SET value=? WHERE id=1').run(json(data));
      db.exec('COMMIT'); result = view(db, directory);
    } else if (operation === 'stage') {
      db.exec('BEGIN IMMEDIATE');
      for (const packet of payload.packets) db.prepare('INSERT OR IGNORE INTO deliveries VALUES (?,?,?,?,?)').run(packet.id, payload.characterId, 'ready', Date.now() + 180000, json(packet));
      db.prepare("DELETE FROM deliveries WHERE expires<? AND status!='displayed'").run(Date.now() - 3600000);
      db.exec('COMMIT'); result = true;
    } else if (operation === 'job') {
      db.prepare('INSERT OR REPLACE INTO jobs VALUES (?,?)').run(payload.taskId, json(payload));
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
    else throw new Error('Unknown store operation');
    db.close(); db = null; parentPort.postMessage({ id, result });
  } catch (error) {
    try { if (db?.isTransaction) db.exec('ROLLBACK'); db?.close(); } catch { /* original error */ }
    parentPort.postMessage({ id, error: { message: error.message, status: error.status, code: error.code } });
  }
});
