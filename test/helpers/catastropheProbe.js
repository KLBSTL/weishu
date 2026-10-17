// Closure-free so the same actions can be replayed verbatim in Chromium and Node.
export function catastropheProbe(b, kind) {
  const ids = { helm: 'enemy_9013_acstmk_2', armour: 'enemy_10027_vtsk',
    pipe: 'enemy_9021_acduml_2', string: 'enemy_9022_acdumm', echo: 'enemy_9023_acdums' };
  const step = n => { for (let i = 0; i < n; i++) b.step(); };
  const spawn = (id, tag = null) => b.spawnEnemy(id, { pos: [3, 10], tag, mods: { speedMul: 0 } });
  const quiet = e => { e.profile.noAttack = true; for (const a of e.mem.ab.list) { if (a.fire) a.left = 1e6; if (a.tick) a.tick = () => {}; } };
  b.step();
  if (kind === 'path') {
    let walls = 0, wetFrames = 0;
    for (let i = 0; i < 2500 && !b.finished; i++) {
      b.step();
      for (const e of b.enemies) if (e.alive && e.motion === 'WALK') {
        if (!b.grid.walkable(Math.round(e.y), Math.round(e.x))) walls++;
        if (e.findBuff('terrain:deepsea')) wetFrames++;
      }
    }
    return { mechanics: { walls, wetFrames }, snapshot: b.snapshot(), events: b.drainEvents(), errors: b.errors };
  }
  let mechanics;
  if (kind === 'steel') {
    const helm = spawn(ids.helm, 'boss'); quiet(helm);
    b.kill(spawn(ids.armour));
    const st = helm.mem.catastropheSteel; st.sp = 150;
    step(34);
    const shield = helm.findBuff('catastrophe:steelShield').shield;
    const cast1 = [st.sp, st.snapshot, st.casts, st.charging, shield];
    b.removeBuff(helm, 'catastrophe:steelShield');
    for (let i = 0; i < 70; i++) b.dealDamage(null, helm, { type: 'true', amount: 1 });
    step(181);
    mechanics = { cast1, sp: st.sp, snapshot: st.snapshot, casts: st.casts,
      armours: b.enemies.filter(e => e.defId === ids.armour && e.alive).length };
  } else {
    const pipe = spawn(ids.pipe, 'boss'), string = spawn(ids.string); quiet(pipe); quiet(string);
    const echo = spawn(ids.echo); quiet(echo);
    const st = pipe.mem.catastropheConcord; st.sp = 30;
    const u = b.allyUnits[0];
    b.addBuff(u, { key: 'parity:noAttack', flags: { disarm: true } });
    step(13); u.elem.apoptosis = 999;
    b.dealDamage(pipe, u, { type: 'element', element: 'apoptosis', amount: 1 });
    const expelledImmediately = !u.alive && u.removed;
    b.loseHp(pipe, pipe.hp - pipe.s.maxHp * .49, { noHitLimit: true });
    b.kill(echo); const queued = st.freeQueued; step(1);
    const free = st.free; st.sp = 13; step(303);
    mechanics = { expelledImmediately, queued, free, sp: st.sp, cost: st.cost, casts: st.casts, charging: st.charging };
  }
  return { mechanics, snapshot: b.snapshot(), events: b.drainEvents(), errors: b.errors };
}
