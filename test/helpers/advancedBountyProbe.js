// Replayed verbatim in Node and Chromium; checks real content dispatch and all timers without a platform-specific clock.
export function advancedBountyProbe(b, key) {
  b.step();
  const ally = b.allyUnits[0];
  b.addBuff(ally, { key: 'probe:wall', mods: { hpMul: 1e6 }, flags: { disarm: true } }); ally.hp = ally.s.maxHp;
  const e = b.spawnEnemy(key, { pos: [ally.tileR, ally.tileC + 1], ownerPlayerId: 'p1',
    mods: { speedMul: 0, bountyLpr: 1 }, bounty: { coins: 9, ownerPlayerId: 'p1' } });
  for (let i = 0; i < 2400 && !b.finished; i++) {
    if (i === 30) b.dealDamage(ally, e, { amount: e.s.maxHp * 0.6, type: 'true' });
    if (i === 90 && key === 'enemy_2055_smlead') b.applyStatus(e, 'fear', { duration: 20, source: ally });
    if (i === 300) b.kill(e, ally);
    b.step();
  }
  return { snapshot: b.snapshot(), events: b.drainEvents(), result: b.result(), errors: b.errors };
}
