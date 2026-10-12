import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appearanceId, readAppearance, setAppearance } from '../../public/js/appearance.js';
import { spineEntry } from '../../public/js/assets.js';

const storage = (initial = '{}', fail = false) => ({ value: initial,
  getItem() { return this.value; }, setItem(key, value) { if (fail) throw new Error('Storage unavailable'); this.value = value; } });
const id = 'char_274_astesi';

test('appearance: normal/elite share persisted skin and motion, other operators stay independent', () => {
  const store = storage();
  assert.equal(appearanceId(id + '_2'), id);
  assert.equal(appearanceId('token_10035_wisdel_wward'), null);
  assert.deepEqual(readAppearance(id, store), { skin: null, animate: true });
  setAppearance(id, { skin: id + '_epoque_23', animate: false }, store);
  assert.deepEqual(readAppearance(id + '_2', store), { skin: id + '_epoque_23', animate: false });
  assert.deepEqual(readAppearance('char_155_tiger', store), { skin: null, animate: true });
  assert.deepEqual(readAppearance(id, storage(store.value)), { skin: id + '_epoque_23', animate: false }, 'fresh storage instance reloads saved preferences');
  setAppearance(id, { animate: true }, store);
  assert.equal(readAppearance(id, store).skin, id + '_epoque_23');
  setAppearance(id, { skin: '' }, store);
  assert.deepEqual(readAppearance(id, store), { skin: null, animate: true });
});

test('appearance: damaged or unavailable storage falls back and retains current-session selections', () => {
  for (const value of ['{broken', '[]', 'null']) assert.deepEqual(readAppearance(id, storage(value)), { skin: null, animate: true });
  const store = storage('{}', true);
  assert.deepEqual(setAppearance(id, { skin: 'test', animate: false }, store), { skin: 'test', animate: false });
  assert.equal(setAppearance('not-an-operator', { skin: 'test' }, store), undefined);
});

test('appearance: selected front/back resolve independently, unknown or malformed skins use defaults', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));
  const rec = manifest.chars[id], skin = rec.skins[0];
  assert.equal(spineEntry(manifest, id), rec.spine.front);
  assert.equal(spineEntry(manifest, id + '_2', { skin: skin.skinId }), skin.spine.front);
  assert.equal(spineEntry(manifest, id, { skin: skin.skinId, back: true }), skin.spine.back);
  assert.equal(spineEntry(manifest, id, { skin: 'missing', back: true }), rec.spine.back);
  const modified = structuredClone(manifest);
  modified.chars[id].skins[0].spine.front = {};
  assert.equal(spineEntry(modified, id, { skin: skin.skinId }), modified.chars[id].spine.front);
  assert.equal(spineEntry(manifest, 'token_10035_wisdel_wward_game_9', { skin: skin.skinId }), spineEntry(manifest, 'token_10035_wisdel_wward_game_9'));
});
