import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapHud } from '../../public/js/ui/gameLogic/format.js';
import { screenStrip } from '../../public/js/ui/watchBonds.js';

for (const kind of ['boss', 'hidden', 'unite']) {
  test(`${kind}: personal DP follows each player's panorama, camera half and spectator target`, () => {
    const players = [{ playerId: 'left', name: 'Left' }, { playerId: 'right', name: 'Right' }, { playerId: 'watcher', name: 'Watcher' }];
    const field = { fieldId: 'b1', kind, players: ['left', 'right'], sides: { left: 'L', right: 'R' } };
    const pub = { players, fields: [field] };
    const snap = { killed: 3, total: 8, dp: 9, dps: { left: 9, right: 42 }, boss: { hp: 500, max: 1000 } };
    const hud = snapHud(snap); // the screen's throttled frame buffer must retain both balances
    const shown = (myId, layer, who = null) => {
      const strip = screenStrip({ pub, myId, combat: true, battleFieldId: 'b1', field,
        layers: [{ key: 'L' }, { key: 'ALL' }, { key: 'R' }], layer,
        watchingOther: !!who, watching: who ? 'b1' : null, who: who ? { fieldId: 'b1', playerId: who } : null });
      return snapHud(hud, strip.ownerId);
    };
    assert.equal(shown('left', 'ALL').dp, 9);
    assert.equal(shown('right', 'ALL').dp, 42, 'right player never sees the first player’s legacy dp');
    for (const viewer of ['left', 'right', 'watcher']) {
      assert.equal(shown(viewer, 'L').dp, 9);
      assert.equal(shown(viewer, 'R').dp, 42);
    }
    assert.equal(shown('watcher', 'ALL', 'right').dp, 42);
    assert.equal(shown('watcher', 'ALL').dp, 9);
    assert.deepEqual(shown('right', 'ALL').boss, snap.boss);
    assert.equal(shown('right', 'ALL').resolved, 3);
  });
}

test('personal DP preserves zero, handles missing players without leaking another balance, and supports solo/legacy frames', () => {
  const snap = { dp: 10, dps: { left: 0, right: 99, invalid: NaN } };
  assert.equal(snapHud(snap, 'left').dp, 0);
  assert.equal(snapHud(snap, 'right').dp, 99);
  assert.equal(snapHud(snap, 'missing').dp, null);
  assert.equal(snapHud(snap, 'invalid').dp, null);
  assert.equal(snapHud({ dp: 23 }, 'solo').dp, 23);
  assert.equal(snapHud({ dp: 11, dps: null }, 'legacy').dp, 11);
  assert.equal(snapHud(null, 'right'), null);
});
