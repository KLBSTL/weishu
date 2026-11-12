import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { companionLibrary, CompanionLibrary } from '../server/companion/library.js';
import { libraryRoute } from '../server/companion/routes.js';
import { storyKey } from '../server/desktop/idle-stories.js';

async function fixture(run) {
  const home = await mkdtemp(join(tmpdir(), 'companion-reset-')), directory = join(home, 'dsh-pet'), previous = process.env.DSH_HOME;
  await mkdir(directory); process.env.DSH_HOME = home;
  const library = companionLibrary(directory);
  const call = (action, values = {}) => libraryRoute(new URL('http://127.0.0.1/stronghold/library'), 'stronghold/library', 'POST', JSON.stringify({ action, pet: 'main', ...values }));
  try { await library.importCard({ name: '小雨', description: '我在书店工作，喜欢雨天。' }); await run(library, call, directory); }
  finally { await library.close(); if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; await rm(home, { recursive: true, force: true }); }
}

test('preview and missing/replayed confirmations cannot delete; clear removes only the current character across restart', async () => fixture(async (lib, call, dir) => {
  const actor = lib.actor(), characterId = actor.characterId, card = lib.card();
  const original = lib.snapshot().assets.find(a => a.id === actor.assetId).card;
  await lib.event(actor.id, 'direct:main', { id: 'old-user', type: 'user', text: '我喜欢蓝色围巾。' });
  await lib.update(undefined, data => { data.rooms.push({ id: 'shared-room', members: [actor.id] }); });
  await lib.event(actor.id, 'shared-room', { id: 'old-group', type: 'user', text: '这也是同一人物的记忆。' });
  await lib.stage('main', [{ id: 'pending', text: '尚未展示的回复。' }]);
  const epoch = lib.contextEpoch(actor.id);
  await lib.stage('main', [{ id: 'heard-idle', text: '我以前整理过书架。' }]);
  await lib.event(actor.id, 'direct:main', { id: 'heard-idle', type: 'assistant', sourceKind: 'idle', text: '我以前整理过书架。', deliveryState: 'displayed', topicId: 'books', angleId: 'event', topicFinal: true });
  assert.equal((await lib.progress('main')).length, 1);
  await lib.event(actor.id, 'direct:main', { id: 'draft', type: 'assistant', sourceKind: 'chat', text: '未播回复。', deliveryState: 'generated', expectedRevision: lib.snapshot().revision, expectedContextEpoch: epoch });
  await lib.importCard({ name: '小夏', description: '我喜欢修理收音机。' });
  await lib.event(actor.id, 'direct:main', { id: 'other-user', type: 'user', text: '另一个人的独立记忆。' });
  await lib.importCard(original);
  const snapshot = lib.snapshot(), other = snapshot.events.find(e => e.id === 'other-user').characterId;
  await writeFile(join(dir, 'companion-library.json'), JSON.stringify(snapshot));
  await writeFile(join(dir, 'stronghold-idle-memory.json'), JSON.stringify({ version: 2, activeKey: 'character:' + characterId,
    cards: { ['character:' + characterId]: { recent: ['私密旧话'] }, [storyKey(card)]: { recent: ['旧迁移话'] }, other: { recent: ['保留'] } } }));
  await writeFile(join(dir, 'stronghold-idle-start.json'), JSON.stringify({ version: 1, entries: { old: { rows: [{ text: '旧待播话' }] } } }));
  const preview = await call('clear-history-preview'); assert.equal(preview.status, 200); assert.equal(preview.obj.name, '小雨');
  assert.ok((await lib.recall('main', '围巾')).length);
  assert.equal((await call('clear-history')).status, 400);
  assert.equal((await call('clear-history', { confirmation: preview.obj.confirmation })).status, 200);
  assert.equal((await call('clear-history', { confirmation: preview.obj.confirmation })).status, 400);
  assert.equal((await lib.recall('main')).length, 0);
  assert.equal(lib.snapshot().events.filter(e => e.characterId === characterId).length, 0);
  assert.ok(lib.snapshot().events.some(e => e.characterId === other));
  assert.notEqual(lib.contextEpoch(actor.id), epoch);
  assert.equal((await lib.acknowledgeChat('main', 'draft')).ok, false);
  await assert.rejects(lib.event(actor.id, 'direct:main', { id: 'late', type: 'assistant', text: '迟到回复', expectedContextEpoch: epoch }), /变化/);
  const db = new DatabaseSync(join(dir, 'companion.sqlite'), { readOnly: true });
  try {
    for (const table of ['events', 'memories', 'progress', 'deliveries']) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE character_id=?`).get(characterId).n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM memory_fts').get().n, db.prepare('SELECT count(*) AS n FROM memories').get().n);
  } finally { db.close(); }
  const stories = JSON.parse(await readFile(join(dir, 'stronghold-idle-memory.json'), 'utf8'));
  assert.deepEqual(Object.keys(stories.cards), ['other']);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'stronghold-idle-start.json'), 'utf8')).entries, {});
  assert.ok(!JSON.parse(await readFile(join(dir, 'companion-library.json'), 'utf8')).events.some(e => e.characterId === characterId));
  const restarted = new CompanionLibrary(dir);
  try { await restarted.ready(); assert.equal((await restarted.recall('main')).length, 0); assert.equal(restarted.snapshot().assets.length, 2); assert.equal(restarted.card().name, '小雨'); }
  finally { await restarted.close(); }
}));

test('changed or expired confirmation cannot clear new conversation or another character', async () => fixture(async (lib, call) => {
  const before = await call('clear-history-preview');
  await lib.event('main', 'direct:main', { type: 'user', text: '确认期间新说的话。' });
  assert.equal((await call('clear-history', { confirmation: before.obj.confirmation })).status, 409);
  assert.equal(lib.visibleHistory('main').length, 1);
  const stale = await call('clear-history-preview');
  await lib.importCard({ name: '小夏', description: '我喜欢看星星。' });
  assert.equal((await call('clear-history', { confirmation: stale.obj.confirmation })).status, 400);
  const expired = await call('clear-history-preview'), now = Date.now;
  try { Date.now = () => now() + 61000; assert.equal((await call('clear-history', { confirmation: expired.obj.confirmation })).status, 400); }
  finally { Date.now = now; }
}));
