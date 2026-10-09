# 检索分队 — 黄金场景审计

基线：`ark/testing/golden-before-recruitment-squads`，即本次实现前已确认的角色版本。当前287个场景，22个变化，265个逐字段一致。

## roster

新增分队加入按ID排序的分队轮换，部分固定阵容配到的分队改变；没有改动角色技能。

变化 6；保持 42。

- roster-041：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-042：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-043：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-044：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-046：players, units, enemies, snaps
- roster-048：players, units, enemies, snaps

## bonds

所有50个盟约场景保持。

变化 0；保持 50。


## fields

此组使用倒序分队轮换；新增两队使若干决战场景的分队配置改变。

变化 8；保持 14。

- boss-boss_2-solo：bossHpLeft, players, units, enemies, events, snaps
- boss-boss_5-pair：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_6-pair：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_8-pair：killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_8-solo：killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_9-pair：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_9-solo：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_10-pair：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps

## matches

机器人抽选列表从40扩为42；分队抽取、固定回合检索及其随机序列改变整场经济与阵容。

变化 6；保持 12。

- solo-FUNNY-2：end, rng, rounds, players
- coop2-NORMAL-3：end, rng, rounds, players
- coop4-FUNNY-6：end, rng, rounds, players
- coop4-ABYSS-7：end, rng, rounds, players
- coop2-NORMAL-14-standins：end, rng, rounds, players
- coop2-NORMAL-70-diy：end, rng, rounds, players, diy

## standins

补位场景使用倒序分队轮换，分队配置改变；补位本体规则未改。

变化 2；保持 9。

- standin-06：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- standin-08：time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps

## diy

所有138个自选场景保持。

变化 0；保持 138。
