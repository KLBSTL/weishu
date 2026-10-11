# 回合经济更新：草案、实现与验证

## 谬因资金消耗修订草案（2026-10-11，基线710f456）

用户确认：休整开始，每持有4资金消耗1资金，哥伦比亚与精准各+4层，精锐各+8层；两盟约必须同时激活，否则不扣款也不加层。草案先于实现写入，工作区完整草案为 ark/docs/Stronghold-Protocol_谬因资金消耗特质草案.md。

当前处理器按持有1资金给两个盟约分别+1/+2且不扣款。拟改为每次执行先检查同时激活，再读取当时资金F，一次计算floor(F/4)，经统一spendFunds消耗同等资金后各加4/8倍层数；精锐费用仍为1。不足4资金不支付，扣款后不递归重算；例如8资金扣2，普通各+8、精锐各+16。费用计入round.spent，与星极和山联动。白面鸮使用被复制品质并按执行顺序读取剩余资金；通用999总层数上限、25层身份牌奖励保留。无其他待决选择。

影响生成器、特质处理器、定向测试和规则/版本/META，生成数据只再生。待验证手牌条件、同时激活门槛、资金边界、普通/精锐费用和层数、复制顺序、消费联动与随机流；按最少测试要求只运行相关玩法测试、文档检查、改动JS lint和matches golden。之后以710f456为父提交，通过独立索引快进发布main；发布记录和日志保存在工作区ark/publishing、ark/testing。下文保留此前发布的历史记录。

本次实现与验证已完成：离线生成成功，3项必要玩法测试通过，31项文档检查通过，改动JS lint无错误或警告。18个matches golden重新计算完成，相对710f456仅以下2个场景有意变化，其余16个不变：

- `solo-NORMAL-2`：哥伦比亚未激活时，谬因不再单独增加精准；结束精准层数80→66，激活层数和伤害摘要随之改变，支付/随机流不变。
- `solo-HARD-2`：同一同时激活门槛使结束精准层数96→56，回合层数、伤害和击杀摘要随之改变，支付/随机流不变。

```text
node tools/build-data.mjs --offline --quiet
node --test --test-concurrency=1 --test-reporter=spec "--test-name-pattern=Aphris:" test/content/garrisons_meta.test.js
node --test --test-concurrency=1 --test-reporter=spec test/docs-consistency.test.js test/docs-paths.test.js
node node_modules/eslint/bin/eslint.js server/sim/content/bonds/columbia.js tools/columbia-data.mjs test/content/garrisons_meta.test.js
node tools/golden.mjs --family matches --update --jobs 2
```

日志为ark/testing/aphris-spend-{build,targeted,docs,lint,golden}.log；按用户要求未运行全仓、其他golden家族或浏览器测试。9个相关文件从710f456继承完整资源和依赖，通过独立发布索引上传；具体远端提交及主索引保留核验写入ark/publishing/SYNC-2026-10-11-APHRIS-SPEND-UPLOADED.md。

## 后续修订草案（2026-10-11，基线0485601）

用户确认：星极精锐每回合每种盟约上限14层；山哥伦比亚收益减半为普通+1／精锐+2，投资人仍+1／+2；赫默仅为已激活的哥伦比亚和远见各+2／+4，分别判断激活。其他已发布规则沿用。先建立草案，再修改生成参数和赫默 requireActive 标志；工作区草案为 ark/docs/Stronghold-Protocol_哥伦比亚特质上限与激活修订草案.md。下文保留0485601发布时的历史记录。

本次离线数据生成成功，5项必要玩法测试通过，31项文档测试通过，改动文件lint无错误或警告。18个matches golden重新计算完成；相对0485601，`solo-FUNNY-2`、`coop3-ABYSS-5` 随此次盟约激活门槛和成长规则改变而有意变化，其余16个不变。没有运行全仓、其他golden家族或浏览器测试。准确命令如下：

```text
node tools/build-data.mjs --offline --quiet
node --test --test-concurrency=1 --test-reporter=spec "--test-name-pattern=Columbia spending|Astesia caps|spending traits count|Silence:|Columbia new prep" test/content/garrisons_meta.test.js
node --test --test-concurrency=1 --test-reporter=spec test/docs-consistency.test.js test/docs-paths.test.js
node node_modules/eslint/bin/eslint.js server/sim/content/bonds/columbia.js tools/columbia-data.mjs test/content/garrisons_meta.test.js
node tools/golden.mjs --family matches --update --jobs 2
```

日志保存在工作区 ark/testing/economy-followup-*.log。本次仅发布9个相关文件，以0485601为父提交快进更新main；发布结果保存到 ark/publishing/SYNC-2026-10-11-ECONOMY-FOLLOWUP-UPLOADED.md。

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
