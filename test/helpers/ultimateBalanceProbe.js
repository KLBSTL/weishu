export function ultimateBalanceProbe(b){
  b.step();
  const mods={atkMul:2,hpMul:3,speedMul:0,ultimateType:'FIREPOWER',ultimateRound:6};
  const mortar=b.spawnEnemy('enemy_1024_mortar',{pos:[12,9],mods});
  const ghost=b.spawnEnemy('enemy_1008_ghost',{pos:[12,9],mods:{...mods,ultimateType:'BREAKTHROUGH'}});
  const ball=b.spawnEnemy('enemy_1177_dufrbl',{pos:[12,9],mods});
  const ratios={atk:mortar.s.atk/(mortar.def.atk*2),hp:ghost.s.maxHp/(ghost.def.maxHp*3),ballAtk:ball.s.atk};
  b.leak(ball);
  return {ratios,leaks:b.result().perPlayer.p1.leaked,events:b.drainEvents(),errors:b.errors};
}
