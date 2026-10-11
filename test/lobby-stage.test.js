import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { validateC2S } from '../shared/protocol.js';
const ID = 'local_relay_lab';

test('stage protocol rejects malformed selection', () => {
  for (const stageId of [null, ID]) assert.equal(validateC2S({ t: 'room.setStage', stageId }), null);
  for (const stageId of [undefined, [], {}, 42]) assert.notEqual(validateC2S({ t: 'room.setStage', stageId }), null);
});

test('room map: host authority, readiness, reconnect, difficulty reset, match lock and solo', async () => {
  let started; class RecordingMatch extends StubMatch { constructor(opts) { super(opts); started = opts; } }
  const srv = await startServer({ host: '127.0.0.1', port: 0, MatchClass: RecordingMatch, log: { info() {}, warn() {}, error() {} } });
  const clients = [];
  const player = async (name, token) => { const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`); clients.push(c); c.welcome = await c.hello(name, token); return c; };
  const req = async (c, msg, type = 'ok') => { const r = await c.request(msg); assert.equal(r.t, type, JSON.stringify(r)); return r; };
  try {
    const host = await player('Host'), guest = await player('Guest');
    await req(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const room = await host.waitFor('room.state'); assert.equal(room.stageId, null);
    await req(guest, { t: 'room.join', code: room.code });
    assert.equal((await req(guest, { t: 'room.setStage', stageId: ID }, 'error')).code, 'NOT_HOST');
    await req(guest, { t: 'room.ready', ready: true });
    await req(host, { t: 'room.setStage', stageId: ID });
    const selected = await guest.waitFor('room.state', s => s.stageId === ID);
    assert.ok(selected.seats.filter(s => s && !s.isBot).every(s => !s.ready));
    assert.equal((await req(host, { t: 'room.setStage', stageId: 'unknown' }, 'error')).code, 'BAD_TARGET');
    await guest.terminate();
    const restored = await player('Guest', guest.welcome.token);
    assert.equal((await restored.waitFor('room.state')).stageId, ID);
    await req(host, { t: 'room.setStage', stageId: 'act1autochess_m02' });
    await req(host, { t: 'room.setDifficulty', difficulty: 'FUNNY' });
    await host.waitFor('room.state', s => s.difficulty === 'FUNNY' && s.stageId === null);
    await req(host, { t: 'room.setStage', stageId: ID });
    await req(restored, { t: 'room.ready', ready: true });
    await req(host, { t: 'room.start' }); assert.equal(started.stageId, ID);
    assert.equal((await req(host, { t: 'room.setStage', stageId: null }, 'error')).code, 'ROOM_STARTED');
    const solo = await player('Solo');
    await req(solo, { t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
    await req(solo, { t: 'room.setStage', stageId: ID });
    await req(solo, { t: 'room.start' }); assert.equal(started.stageId, ID);
  } finally { for (const c of clients) await c.terminate().catch(() => {}); await srv.close(); }
});
