import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';

for (const [key, atk] of [['enemy_1143_merrpg', 500], ['enemy_1143_merrpg_2', 750]]) {
  for (const [atkMul, def] of [[1, 0], [2, 100]]) {
    test(`${key}: grenade and splash 200%, then melee 100% (ATK x${atkMul}, DEF ${def})`, () => {
      const wall = chessRec({ id: 'wall', stats: { maxHp: 1e8, atk: 0, def, res: 0, blockCnt: 10 }, skill: null });
      const h = makeBattle({
        content: 'generic', extraContent: [enemiesMod], defs: { chess: { wall } },
        kits: { wall: () => ({ trait: { noAttack: true } }) },
        units: [{ chessId: 'wall', uid: 1, row: 10, col: 6 }, { chessId: 'wall', uid: 2, row: 11, col: 6 }],
        autoFinish: false, timeLimit: 30, captureNoisy: true, hooks: ['damaged'],
      }).step();
      const e = h.spawn(key, { pos: [10, 6.5], routeIndex: 0, mods: { atkMul } });
      const speed = e.s.moveSpeed;
      const hits = target => h.hooksOf('damaged').filter(c => c.source === e && c.target === target);
      assert.ok(h.runUntil(() => hits(h.unit(1)).length >= 3, 15), 'one grenade followed by two melee hits');

      assert.deepEqual(hits(h.unit(1)).map(c => c.amount), [atk * atkMul * 2 - def, atk * atkMul - def, atk * atkMul - def]);
      assert.deepEqual(hits(h.unit(2)).map(c => c.amount), [atk * atkMul * 2 - def], 'only the grenade splashes');
      assert.ok(h.hooksOf('damaged').every(c => c.type === 'phys'));
      assert.ok(Math.abs(e.s.moveSpeed - speed * 3) < 1e-9, 'the existing +200% movement speed remains');
      assert.deepEqual(h.b.errors, []);
      checkInvariants(h.b);
    });
  }
}
