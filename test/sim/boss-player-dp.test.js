import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import { snapHud } from '../../public/js/ui/gameLogic/format.js';

for (const kind of ['boss', 'hidden']) {
  test(`${kind}: two owners recover and spend DP independently through real redeployment and snapshots`, () => {
    const guard = chessRec({ id: 'dp_guard', stats: { cost: 20, respawnTime: 1 }, skill: null });
    const h = makeBattle({ kind, content: 'none', defs: { chess: { dp_guard: guard } }, players: [
      { playerId: 'left', side: 'L', units: [{ uid: 1, chessId: 'dp_guard', row: 10, col: 5 }] },
      { playerId: 'right', side: 'R', colOffset: 8, units: [{ uid: 1, chessId: 'dp_guard', row: 10, col: 5 }] },
    ] });
    h.step();
    const b = h.b, left = b.getPlayer('left'), right = b.getPlayer('right');
    const l = left.units[0], r = right.units[0];
    const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ~= ${expected}`);
    const beforeRight = right.dp;
    b.addDp('left', 30);
    approx(right.dp, beforeRight);
    approx(left.dp - right.dp, 30);
    b.dealDamage(null, l, { amount: 1e9, type: 'true' });
    b.dealDamage(null, r, { amount: 1e9, type: 'true' });
    h.run(1.2);
    assert.equal(l.alive, true, 'left can pay to auto-redeploy');
    assert.equal(r.alive, false, 'right cannot borrow left DP');
    approx(left.dp - right.dp, 10, 'only left paid 20');
    let snap = b.snapshot();
    assert.equal(snapHud(snap, 'right').dp, Math.floor(right.dp));
    assert.notEqual(snap.dps.left, snap.dps.right);
    const beforeLeft = left.dp, rightBeforeGain = right.dp;
    b.addDp('right', 30);
    approx(left.dp, beforeLeft);
    h.step();
    assert.equal(r.alive, true, 'right deploys only after its own DP gain');
    approx(right.dp, rightBeforeGain + 10 + b.dt);
    b.retreat(r);
    right.dp = 0;
    const leftBeforeRetry = left.dp;
    assert.equal(b.redeploy(r, { free: false }), false);
    approx(left.dp, leftBeforeRetry);
    b.addDp('right', 25);
    assert.equal(b.redeploy(r, { free: false }), true);
    approx(right.dp, 5);
    approx(left.dp, leftBeforeRetry);
    b.addDp('left', -3); // the same owner-routed deduction used by DP-consuming kits
    approx(right.dp, 5);
    b.addDp('right', 999);
    approx(right.dp, 99);
    assert.ok(left.dp < 99);
    snap = b.snapshot();
    assert.equal(snapHud(snap, 'left').dp, Math.floor(left.dp));
    assert.equal(snapHud(snap, 'right').dp, 99);
    assert.equal(b.errors.length, 0);
  });
}
