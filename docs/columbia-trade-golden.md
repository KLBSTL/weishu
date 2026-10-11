# 哥伦比亚买卖特质调整：固定战斗结果审计

2026-10-11。比较基准为本次已完成地图扩展后的290个固定样例；该地图扩展是在原286个样例不变的基础上新增4个 `relay-*` 样例。

通过 `node tools/golden.mjs --update` 重算全部290个样例。买卖即时叠层、谬因资金门槛调整和移除哥伦比亚轰击灼燃均为维护者明确要求。

只有以下5个完整对局样例发生变化：

- `solo-NORMAL-1`
- `solo-NORMAL-2`
- `solo-HARD-2`
- `solo-ABYSS-2`
- `coop3-ABYSS-5`

这些对局包含整备经济与队伍成长，星极/山不再在休整结束时按旧统计加层，改为监听成功买卖；谬因的资金换层效率降低。
其余285个样例保持不变，覆盖全部 roster、bonds、fields、standins、diy 家族及其余完整对局。
其中六人爆炸与持续伤害仍有专门的内容测试，明确断言不产生灼燃损伤；不以固定样例“未变化”代替机制验收。

既有 `coop2-NORMAL-70-diy` 摘要未变化，相关覆盖测试仍要求推进之王必定上场，而该种子的现有队伍只上场原型自选。
地图修改前的已发布提交 `e1913c0` 也有相同摘要；该旧测试问题不属于本次玩法变更。

## 验证记录

- `node --test test/content/garrisons_meta.test.js test/content/columbia.test.js test/content/relay-stage.test.js test/docs-consistency.test.js test/docs-paths.test.js`：138通过，0失败。
- 设置本机 `CHROME_PATH`、`SP_E2E=1` 后，`node --test test/ui/relay-stage.e2e.test.js`：2通过，覆盖桌面/手机横屏选图、普通战和首领战开局。已查看截图确认布局。
- `node tools/golden.mjs --update`：重算290个样例；变动如上。完整回归中的固定结果及零引擎错误检查通过。
- `MATCH_SEEDS=2 node tools/ci.mjs --keep-going`（PowerShell用环境变量赋值）：5809通过、2失败、21跳过，共5832项；数据重建、打包清单、服务器检查、lint、导入边界及类型检查通过。两项失败为上述既有自选覆盖断言，以及并发负载下的首领战性能阈值。
- 待并发测试结束，`node --test --test-concurrency=1 --test-name-pattern="performance: heavy 2-player" test/sim/robustness.test.js`：单独复测通过，1800 ticks、峰值134敌人，三次均值349.3/252.8/260.9微秒每tick，最佳252.8微秒，阈值500微秒。不据此宣称性能提升。
- `node tools/i18n.mjs check --all --strict`：4种语言各1182条界面文字，0缺失、0错误。数据英语覆盖重新构建。

整套回归仍不能标记为全绿：旧自选覆盖断言尚未修复；并发性能阈值失败与单独复测通过均保留记录。
