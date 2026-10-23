# 单一大盟约干员软禁边界修订

状态：用户已明确确认“是，单一大盟约被软ban也移除”。此前默认保留无小盟约者；本次以最新要求覆盖该边界，其他软禁规则保留。实现与必要验证已完成。

## 证据与修正范围

- 已核验乌尔比安普通/精锐仅有自然标签 `egirShip`。原 `bannedByBonds` 要求同时有大/小盟约，因此阿戈尔被软禁时仍保留。
- 绝境、终极、天灾各300种子中，阿戈尔软禁92次、乌尔比安均未被排除；阿戈尔硬禁33次、全部排除。
- 修改为：自然标签仅有一个、且是大盟约时，命中软禁也移出卡池。硬禁、模式固定停用照旧；多标签干员仍要求全部自然大、小盟约都被过滤。无大盟约者不因小盟约筛选单独移除。
- 正式池与自选库存共用判定，不改抽取数量、默认1/3/5、随机种子与候选范围。同步弹窗提示、配置生成规则和中英日韩/繁中UI文本。

## 必要验收与发布

补充真实乌尔比安及共享判定回归，覆盖软禁、硬禁、未禁、无效小盟约组合和多标签保留。运行禁用/卡池/自选相关测试及文本检查；重建受影响的18场matches golden，并选择3场代表场景独立比较，其他五组战斗文件不动。独立发布副本快进GitHub，图片、依赖、缓存不上传；原工作目录分支和索引保留。

## 整局基准逐场审计

基线为本次修订前已发布的 `a2c40a35`。只改变单一大盟约软禁后的池成员和后续整局轨迹，未改变种子或地图/敌方阵营/首领选择。未新增AI策略或额外收益。

| 场景 | 改变字段 | 原因 |
| --- | --- | --- |
| solo-FUNNY-1 | rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| solo-FUNNY-2 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| solo-NORMAL-1 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| solo-NORMAL-2 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| solo-HARD-1 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| solo-HARD-2 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| solo-ABYSS-1 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| solo-ABYSS-2 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop2-NORMAL-3 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop2-HARD-4 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop3-ABYSS-5 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop4-FUNNY-6 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop4-ABYSS-7 | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop2-NORMAL-8-serverrun | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| solo-HARD-9-boosted | rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop2-ABYSS-10-boosted | end, rng, rounds, players | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop2-NORMAL-14-standins | end, rng, rounds, players, standIns | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |
| coop2-NORMAL-70-diy | end, rng, rounds, players, diy | 纯大盟约软禁改变招募池及后续购买/合成/战斗 |

18场重建，18场改变，0场不变；内容错误数均为0。此为有意规则修订，不是AI胜率改善结论。

## 已完成的必要验证

- `node tools/build-data.mjs --offline`：成功，规则说明随生成器更新。
- `node --test --test-concurrency=2 test/match/ban-configuration.test.js test/match/pool.test.js test/match/diy-shop.test.js test/match/bot-band-feasibility.test.js test/docs-consistency.test.js test/docs-paths.test.js`：本地与独立发布副本均61/61通过，0失败。
- 改动文件ESLint、`node node_modules/typescript/bin/tsc --noEmit --checkJs -p jsconfig.json`、`node tools/i18n.mjs check --all --strict`通过；四个语言包均1225/1225。
- `node tools/golden.mjs --family matches --update --jobs 3`：18场重建成功。
- 独立发布副本 `node tools/golden.mjs --family matches --only solo-HARD-1,solo-ABYSS-1,coop2-NORMAL-70-diy --jobs 3`：3场一致。
- `git diff --check`通过；未重复完整CI、大批AI胜率测试或全量浏览器流程。
