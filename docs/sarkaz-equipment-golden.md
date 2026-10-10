# 萨卡兹装备与盟约最终修订 — 黄金场景审计

基线为本次装备/分队修订前保存的已发布版本；此表列出全部有意变更场景和字段。详细规则见 [哥伦比亚](design/columbia.md) 与 [萨卡兹](design/sarkaz.md)。

## roster

萨卡兹攻击层数系数、伊芙利特属性与阵营、两件新装备，以及哥伦比亚攻击触发和附着式持续伤害改变战斗。

保持 1；新增 0；移除 0；变化 46。

- roster-002：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-003：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-004：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-005：rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-006：rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-007：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-008：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-009：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-010：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-011：time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-012：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-013：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-014：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-015：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-016：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-017：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-018：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-019：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-020：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-021：rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-022：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-023：time, ticks, reason, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-024：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-025：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-026：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-027：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-028：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-029：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-030：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-031：time, ticks, reason, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-032：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-033：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-034：rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-035：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-036：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-037：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-038：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-039：rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-040：rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-041：rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-042：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-043：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-044：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-045：time, ticks, rngDraws, players, units, hooks, events, fx, snaps
- roster-046：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- roster-047：enemies, snaps

## bonds

哥伦比亚成员取样与轰击触发/刷新伤害改变；萨卡兹层数加攻0.7%，装备参与测试分配。

保持 23；新增 0；移除 0；变化 27。

- bond-columbiaShip-high：time, ticks, players, units, hooks, events, fx, snaps
- bond-egirShip-high：units, enemies, hooks, events, fx, snaps
- bond-emptyShip-high：time, ticks, players, units, enemies, hooks, events, fx, snaps
- bond-indomShip-high：rngDraws, players, units, enemies, hooks, events, fx, snaps
- bond-investShip-low：units, snaps
- bond-investShip-high：time, ticks, players, units, enemies, hooks, events, fx, snaps
- bond-kazimierzShip-high：time, ticks, players, units, enemies, hooks, events, fx, snaps
- bond-kjeragShip-high：units, hooks, events, snaps
- bond-lateranoShip-high：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- bond-maniShip-high：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- bond-miraShip-high：units, snaps
- bond-preciShip-low：units, snaps
- bond-preciShip-high：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- bond-raidShip-high：time, ticks, players, units, enemies, hooks, events, fx, snaps
- bond-sargonShip-high：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- bond-sarkazShip-low：units, hooks, events, snaps
- bond-sarkazShip-high：players, units, hooks, events, fx, snaps
- bond-siracusaShip-high：rngDraws, players, units, hooks, events, fx, snaps
- bond-skillfulShip-high：time, ticks, rngDraws, units, enemies, hooks, events, fx, snaps
- bond-soloShip-low：units, snaps
- bond-soloShip-high：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- bond-steadShip-high：players, units, hooks, events, fx, snaps
- bond-suntShip-high：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- bond-swiftShip-high：units, hooks, events, snaps
- bond-victoriaShip-high：players, units, enemies, hooks, events, fx, snaps
- bond-visiShip-high：units, hooks, events, snaps
- bond-yanShip-high：rngDraws, units, events, snaps

## fields

同一阵容的攻击加成、轰击持续伤害及装备改变战斗输出和通过时间。

保持 0；新增 0；移除 0；变化 22。

- boss-boss_1-pair：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_1-solo：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_2-pair：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_2-solo：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_3-pair：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_3-solo：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_4-pair：killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_4-solo：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_5-pair：killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_5-solo：killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_6-pair：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_6-solo：killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_7-pair：time, ticks, reason, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- boss-boss_7-solo：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_8-pair：killed, bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_8-solo：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_9-pair：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_9-solo：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_10-pair：bossHpLeft, rngDraws, players, units, enemies, hooks, events, fx, snaps
- hidden-boss_10-solo：bossHpLeft, players, units, enemies, hooks, events, fx, snaps
- unite-1：rngDraws, players, units, enemies, hooks, events, fx, snaps
- unite-2：rngDraws, players, units, enemies, hooks, events, fx, snaps

## matches

红豆购买价1、泥岩获得资金、首次刷新萨卡兹推荐、激活后叠层及两件新装备改变经济与后续阵容。

保持 1；新增 0；移除 0；变化 17。

- solo-FUNNY-1：end, rng, rounds, players
- solo-NORMAL-1：end, rng, rounds, players
- solo-NORMAL-2：end, rng, rounds, players
- solo-HARD-1：end, rng, rounds, players
- solo-HARD-2：end, rng, rounds, players
- solo-ABYSS-1：end, rng, rounds, players
- solo-ABYSS-2：rounds, players
- coop2-NORMAL-3：end, rng, rounds, players
- coop2-HARD-4：rng, rounds, players
- coop3-ABYSS-5：end, rng, rounds, players
- coop4-FUNNY-6：rng, rounds, players
- coop4-ABYSS-7：end, rng, rounds, players
- coop2-NORMAL-8-serverrun：end, rng, rounds, players
- solo-HARD-9-boosted：rng, rounds, players
- coop2-ABYSS-10-boosted：end, rng, rounds, players
- coop2-NORMAL-14-standins：end, rng, rounds, players, standIns
- coop2-NORMAL-70-diy：end, rng, rounds, players, diy

## standins

泥岩获取特质、盟约攻击力和装备配置影响补位场景；沿用既有技能。

保持 3；新增 0；移除 0；变化 8。

- standin-03：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- standin-04：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- standin-05：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- standin-06：killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- standin-07：time, ticks, rngDraws, players, units, enemies, hooks, events, snaps
- standin-08：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps
- standin-09：time, ticks, rngDraws, players, units, enemies, hooks, events, fx, snaps
- standin-10：time, ticks, killed, rngDraws, players, units, enemies, hooks, events, fx, snaps

## diy

检查自选兼容：技能本体未修改；若变化，来源为共有盟约/装备或场景抽样。

保持 138；新增 0；移除 0；变化 0。
