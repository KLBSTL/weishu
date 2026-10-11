# 回合经济更新：草案、实现与验证

2026-10-11；用户已授权本次实现、修复与发布。工作区草案先于代码修改写入 ark/docs/Stronghold-Protocol_回合经济特质与储蓄罐修复草案.md。本文件随仓库发布，保留确认口径和验收证据。

## 用户已确认的规则

- 星极：休整结束，每消耗2资金使已激活哥伦比亚和奥术各+1，普通每种盟约最多7层；精锐各+2，无额外回合上限。
- 山：休整结束，每消耗2资金使已激活投资人+1、哥伦比亚+2，精锐分别+2、+4，无额外回合上限。
- 星极和山读取 round.spent，成功支付累计、免费和失败不计，卖出及奖励不倒扣，下个正式回合清零。须在场、盟约分别激活、副本分别执行，可以被塞雷娅复制。
- 谬因：休整开始，每持有1资金使已激活哥伦比亚和精准各+1，精锐各+2，不扣款；白面鸮使用被复制特质的品质和当时持有资金。不再随机获得资金或装备。
- 以上是暂停后恢复时的最终指令，替代所有早先方案。无额外回合上限仍受通用999总层数上限约束。
- 装备保留自动合成、溢出与原版消耗规则。

## 储蓄罐的证据与修复范围

用户确认遇到单个普通储蓄罐发8资金。当前干净数据为普通1～6、精锐2～12，旧公式为 min + rng.int(max-min+1)；上游 master 的 builtinMeta.js 相同。在当前干净数据中尚未复现普通8资金，因此没有把自动合成认定为用户问题的根因。

本次加固从具体物品品质的 equip_destory_gain_random_coin blackboard 读取收益，避免扁平 params 覆盖，并在发钱前约束普通1～6、精锐2～12。加入可复现的过期／污染收益元数据输入，验证普通不会发8或更高；覆盖单次销毁、重复装备指令、手牌与临时区，以及真实获得两件普通后自动合成精锐的ID与界面品质。合法精锐收益8仍保留。物品说明补充两种品质的范围和自动合成规则。

上游对照：[builtinMeta.js](https://github.com/sganggs/Stronghold-Protocol/blob/master/server/match/builtinMeta.js)，本次读取 blob `4d1bd783e308c136f4ce6b33b1c5dc08de7dbf74`。本地原装备依据见 [装备调研](research/04-items.md)。原始用户现场的确切触发条件仍未确定；不把防御性加固当作已复现根因。

## 实现范围

生成入口 tools/columbia-data.mjs 和 tools/build-data.mjs；执行 server/sim/content/bonds/columbia.js、server/match/builtinMeta.js；测试 test/content/garrisons_meta.test.js、test/content/items.test.js；同步 [哥伦比亚规则](design/columbia.md)、[META](META.md) 与 [版本记录](history/0.2.2.md)。data/*.json 通过生成器再生，不手改。机制验证不等同于长期强度平衡验收。

## 验证与 golden

按用户要求只执行必要定向测试和受影响 matches golden 的更新，不跑全仓、浏览器和全量资源测试。以下命令在仓库根目录运行：

```text
node tools/build-data.mjs --offline --quiet
node --test --test-concurrency=1 --test-reporter=spec "--test-name-pattern=Columbia spending|Astesia normal|spending traits count|Aphris:|骑士储蓄罐" test/content/garrisons_meta.test.js test/content/items.test.js
node --test --test-concurrency=1 --test-reporter=spec test/docs-consistency.test.js test/docs-paths.test.js
node node_modules/eslint/bin/eslint.js server/sim/content/bonds/columbia.js server/match/builtinMeta.js tools/columbia-data.mjs tools/build-data.mjs test/content/garrisons_meta.test.js test/content/items.test.js
node tools/golden.mjs --family matches --update --jobs 2
```

离线生成成功；玩法/装备8项全部通过，文档31项全部通过；改动文件 lint 0错误、3个已有警告。18个 matches 场景重新计算成功。其余 golden 家族没有重跑；未宣称全仓测试全绿。日志保存在工作区 ark/testing/economy-final-*.log。

相对已发布父提交 `968de54cad03c9480fbdd437ef470216dc77c33c`，以下5个场景有意变更，另外13个不变：

- `solo-NORMAL-1`：结束状态、回合和玩家摘要变化，来自哥伦比亚消费叠层及谬因持有资金成长改变后续对局。
- `solo-NORMAL-2`：回合和玩家摘要变化，同上。
- `solo-HARD-2`：回合和玩家摘要变化，同上。
- `solo-ABYSS-2`：回合和玩家摘要变化，同上。
- `coop3-ABYSS-5`：随机流、回合和玩家摘要变化，来自成长改变后的奖励、采购和战斗路径。

保留此前已知的 golden-diy 部署推进之王断言限制，本次未运行或修改该断言。

## 发布

发布目标为 [KLBSTL/weishu](https://github.com/KLBSTL/weishu) 的 main，使用独立索引、以 `968de54` 为父提交快进推送；保留源 master、原索引及既有未提交修改。发布清单只包含本次14个经济实现、生成数据、测试和说明文件；素材及生产依赖直接保留父提交内容，不进行全量下载或扫描。具体推送结果与提交SHA记入工作区 ark/publishing/ 发布记录。
