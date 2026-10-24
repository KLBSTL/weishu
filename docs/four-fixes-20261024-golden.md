# 本轮逐场基准变更审计

基线：GitHub main `261c85e0`；所有既有场景的种子与夹具保留。本次重建298场只为有意机制修正，不作为AI胜率改善结论。

| 类别 | 场景 | 改变字段 | 原因 |
|---|---|---|---|
| roster | roster-014 | time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 访问团计时成长及召唤组出怪数量修正 |
| roster | roster-019 | killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 访问团计时成长及召唤组出怪数量修正 |
| roster | roster-049 | time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 访问团计时成长及召唤组出怪数量修正 |
| roster | roster-052 | players, units, enemies, snaps | 访问团计时成长及召唤组出怪数量修正 |
| bonds | bond-arcaneShip-high | units, hooks, events, snaps | 访问团计时成长及召唤组出怪数量修正 |
| bonds | bond-miraShip-high | time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps | 访问团计时成长及召唤组出怪数量修正 |
| matches | solo-FUNNY-1 | rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | solo-FUNNY-2 | rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | solo-NORMAL-1 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | solo-NORMAL-2 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | solo-HARD-1 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | solo-HARD-2 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | solo-ABYSS-1 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | solo-ABYSS-2 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop2-NORMAL-3 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop2-HARD-4 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop3-ABYSS-5 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop4-FUNNY-6 | rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop4-ABYSS-7 | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop2-NORMAL-8-serverrun | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | solo-HARD-9-boosted | rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop2-ABYSS-10-boosted | end, rng, rounds, players | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop2-NORMAL-14-standins | end, rng, rounds, players, standIns | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| matches | coop2-NORMAL-70-diy | end, rng, rounds, players, diy | 纯小盟约禁用改变招募/阵容；召唤预算修正和R14胜利直接进入隐秘改变后续轨迹 |
| standins | standin-05 | time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps | 访问团计时成长及召唤组出怪数量修正 |
| diy | diy-037 | players, units, enemies, snaps | 访问团计时成长及召唤组出怪数量修正 |
| diy | diy-053 | units, hooks, events, fx, snaps | 访问团计时成长及召唤组出怪数量修正 |
| diy | diy-054 | killed, players, units, enemies, hooks, events, snaps | 访问团计时成长及召唤组出怪数量修正 |
| diy | diy-101 | players, units, enemies, snaps | 访问团计时成长及召唤组出怪数量修正 |
| diy | diy-112 | players, units, enemies, snaps | 访问团计时成长及召唤组出怪数量修正 |
| diy | diy-124 | total, players, units, enemies, hooks, events, fx, snaps | 访问团计时成长及召唤组出怪数量修正 |

重建与对比：
- roster: 55场，4场改变，51场不变。
- bonds: 50场，2场改变，48场不变。
- fields: 25场，0场改变，25场不变。
- matches: 18场，18场改变，0场不变。
- standins: 11场，1场改变，10场不变。
- diy: 139场，6场改变，133场不变。
