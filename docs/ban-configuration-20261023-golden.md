# 开局禁用配置：整局基准审计（2026-10-23）

基线为本次开工时本地已发布玩法版本的18场matches。只重建该组，不修改战斗场景生成器或种子。硬禁1、软禁3、小盟约5与软禁保留无小盟约者，改变各场实际卡池；因此购买、合成、分队选择、后续波次战斗和随机消耗随之改变。检索分队以实际池是否存在成员判断，不将软禁误当全局停用。

| 场景 | 改变字段 | 种子/地图/敌方阵营/首领 | 原因 |
| --- | --- | --- | --- |
| solo-FUNNY-1 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| solo-FUNNY-2 | rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| solo-NORMAL-1 | rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| solo-NORMAL-2 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| solo-HARD-1 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| solo-HARD-2 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| solo-ABYSS-1 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| solo-ABYSS-2 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop2-NORMAL-3 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop2-HARD-4 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop3-ABYSS-5 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop4-FUNNY-6 | rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop4-ABYSS-7 | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop2-NORMAL-8-serverrun | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| solo-HARD-9-boosted | rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop2-ABYSS-10-boosted | end, rng, rounds, players | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop2-NORMAL-14-standins | end, rng, rounds, players, standIns | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |
| coop2-NORMAL-70-diy | end, rng, rounds, players, diy | setup变化键：无；种子不变 | 新禁用池与分队可用性影响整局 |

合计18场，改变18场，内容错误全部为0。每场的完整输入/结果仍保留于golden文件。基准变化是有意的玩法更新，不代表AI胜率提升。
