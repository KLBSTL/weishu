# 哥伦比亚数值调整 — 黄金场景审计

基线：fa3c798。仅将每层攻击加成0.9%改为0.7%、轰炸300%改为200%、共享冷却改为 max(1, 10 - floor(L / 100)) 秒。触发、半径、持续伤害和灼燃规则不变。

## roster

变化 0；保持 47。


## bonds

变化 2；保持 48。

原因：哥伦比亚攻击加成、轰炸倍率或触发间隔改变战斗结算；完整对局还会因此改变后续收益和阵容。

- bond-columbiaShip-low：units, snaps
- bond-columbiaShip-high：units, hooks, events, fx, snaps

## fields

变化 0；保持 22。


## matches

变化 3；保持 15。

原因：哥伦比亚攻击加成、轰炸倍率或触发间隔改变战斗结算；完整对局还会因此改变后续收益和阵容。

- solo-FUNNY-1：end, rounds, players
- coop2-HARD-4：players
- coop3-ABYSS-5：rounds, players

## standins

变化 0；保持 11。


## diy

变化 0；保持 138。
