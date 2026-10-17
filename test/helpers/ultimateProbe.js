// Closure-free: replayed unchanged in Node and Chromium.
export function ultimateProbe(b) {
  b.step();
  for(const e of b.enemies)b.kill(e,null);
  const unit=b.allyUnits[0];
  if(!unit)throw new Error('Missing DIY operator');
  const enemy=b.spawnEnemy('enemy_1133_harchn_2',{pos:[unit.tileR,unit.tileC+1],mods:{speedMul:0}});
  b.addBuff(enemy,{key:'parity:tank',mods:{hpMul:10000},flags:{disarm:true}});enemy.hp=enemy.s.maxHp;
  const skills=[];b.on('skillStart',c=>skills.push(c.skill.id));
  for(let i=0;i<1500&&!b.finished;i++){
    if(i===300)b.dealDamage(unit,enemy,{type:'element',element:'erosion',amount:1000});
    b.step();
  }
  return {unit:unit.def.charId,skills,children:b.enemies.filter(e=>e.defId==='enemy_1138_tumor').length,
    snapshot:b.snapshot(),events:b.drainEvents(),errors:b.errors};
}
