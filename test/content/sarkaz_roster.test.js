import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { skillSpecSource } from '../../server/sim/content/index.js';
import { SARKAZ_ROSTER } from '../../tools/sarkaz-data.mjs';

const ds = getDefaultSource();
test('Sarkaz roster: nine unique identities, shop tiers, normal/elite defaults and authored skills', () => {
  const members = Object.values(ds.raw.chess).filter((c) => c.visible && !c.isGolden && c.bonds.includes('sarkazShip'));
  assert.equal(members.length, 9);
  assert.equal(new Set(members.map((c) => c.charId)).size, 9);
  for (const [, charId, tier, , addon, skillIndex] of SARKAZ_ROSTER) {
    const c = members.find((c) => c.charId === charId);
    assert.equal(c.tier, tier);
    assert.deepEqual(c.bonds, ['sarkazShip', ...(addon ? [addon] : [])]);
    for (const id of [c.chessId, c.goldenId]) {
      const d = ds.getChess(id);
      assert.equal(d.loadout.skillIndex, skillIndex, id);
      for (const s of ds.rawChess(id).skills) assert.ok(['kit', 'skills'].includes(skillSpecSource(ds.getChess(id, { skillIndex: s.index }))), `${id} ${s.skillId}`);
    }
  }
});

for (const form of ['a', 'b']) {
  test(`Hibiscus S2 ${form}: two tethers, damage healing, no normal attacks, ends when targets disappear`, () => {
    const id = `chess_char_2_sarkaz_hbisc2_${form}`;
    const h = makeBattle({ defs: { chess: { helper: chessRec({ id: 'helper', skill: null, stats: { maxHp: 100000, atk: 0 } }) },
      enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, atk: 0, speed: 0, res: 0 }) } },
      units: [{ chessId: id, row: 10, col: 4 }, { chessId: 'helper', row: 10, col: 5 }], autoFinish: false });
    h.step();
    const u = h.unit(id), ally = h.unit('helper');
    ally.hp = 1000;
    const targets = [[10, 6], [11, 6], [9, 6]].map((pos) => h.spawn('dummy', { pos }));
    h.step(); // Spawned enemies enter the spatial index on the next simulation tick.
    const attacks = u.stats.attacks;
    assert.equal(u.skill.activate('test', { free: true }), true);
    h.run(2.1);
    assert.equal(u.stats.attacks, attacks);
    assert.equal(targets.filter((e) => e.hp < e.s.maxHp).length, 2);
    assert.ok(ally.hp > 1000 && u.stats.heal > 0, 'incantation healing from actual damage');
    for (const e of targets) h.b.kill(e, u);
    h.step(2);
    assert.equal(u.skill.active, false);
    assert.deepEqual(h.b.errors, []);
    checkInvariants(h.b);
  });

  test(`Meteorite S2 ${form}: area damage and DEF reduction with its own skill blackboard`, () => {
    const id = `chess_char_2_sarkaz_meteo_${form}`;
    const h = makeBattle({ defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, atk: 0, speed: 0, def: 1000 }) } },
      units: [{ chessId: id, row: 10, col: 4 }], autoFinish: false });
    h.step();
    const u = h.unit(id), e = h.spawn('dummy', { pos: [10, 6] });
    h.step();
    const before = e.hp;
    u.skill.activate('test', { free: true });
    assert.ok(e.hp < before);
    assert.equal(e.s.def, 1000 + u.def.skill.bb.def);
    assert.deepEqual(h.b.errors, []);
    checkInvariants(h.b);
  });
}
