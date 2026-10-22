# 当前稳定 AI 本地应用与发布记录（2026-10-22）

状态：用户已授权选择当前有证据支持的 AI、应用本地并上传 `KLBSTL/weishu`。草案先行，实施与发布副本验证已完成；本地服务已启动，最终提交和远端核验保存在 `ark/publishing/ai-best-20261022-validation.json`。

## 选择依据

沿用 `stable-growth-boss-20261021` 的成长、经济、站位和 Boss 决策，真实布局试打最多三个候选。默认宏观规划 `off`、战术 `legacy`、固定打法 `off`。`off` 仅关闭额外实验控制器，正常购物、升本、叠层和布阵继续执行。

最新冻结确认（双 AI 终极模拟，19801–19850）中，稳定策略和新固定打法均为 3/50 通关、8/50 到达 Boss；新打法平均通过回合和剩余生命更低，不能凭最新版本或更多叠层认定更强。三 AI 19901–19908 为 0/8→1/8，样本不足以推翻双人主场景的选择。更早的试验及负例保留，不选择错误解释随机筛池规则但偶然胜场较多的版本。证据见本地 `docs/ai-playbook-engines-results-20261022.md` 及其冻结产物；本次发布记录提供可独立阅读的摘要，不要求源码分发附带历史实验大文件。

## 发布范围

先核对 GitHub 当前 main，与本地默认策略及其运行依赖逐项比较。发布已验证稳定路径的必要修正、确定性与默认配置保护测试及文档；实验功能保持显式选择，未证明更优的功能不升级为默认。不得把本地数百个未提交文件整体上传，不上传素材、依赖副本、训练权重、样本、缓存或机器设置。

本次不改变游戏收入、敌人、难度、盟约和干员数据；已有 AI 补助保留 R3–5 +1、R6–8 +2、R9 起 +4 的非累加档位。随机筛池只剔除全部标签被筛掉的棋子，不能据此断言留下的多标签棋子无法激活其核心；固定模式停用仍按真实规则检查。

## 本地应用和验证

显式固定稳定默认值，核对本地和发布版本的默认 AI 行为。读取本地 3000 端口状态，有活动对局时不得直接中断；空闲或无服务时启动更新后的游戏并查询健康接口。

使用独立发布目录和 Git 索引，从目标 main 快进提交。原工作目录 HEAD、分支、索引及无关改动保持。先跑相关默认／分队／成长／确定性测试，再检查文档、静态导入／类型和服务 smoke；对有意改变的 matches golden 逐场审计，不覆盖其他家族。现有冻结对照用于版本选择，不伪装成本轮新增独立样本。推送后核对远端提交和本地健康，记录实际命令与限制。

## 实施范围

基于目标 main `f08e0788797ccf340b8612b7d29b2c7b8f4ae6c3` 建立独立发布副本。集中固定 `botPolicy.js` 的五个默认值，由 `Match.js` 读取；同步当前 `bot.js`、它必需的 `botPlaybooks.js` 及特征语义兼容标识 `botTeamModel.js`。`botTeamRollout.js` 是隔离状态签名等回归测试使用的离线辅助模块，生产 AI 不导入它。未上传终局学习器、模型或历史大样本。

正常路径保留同一核心的库存和激活门槛配对检查。可选 risk／roster／combined 战术及三套固定打法代码继续关闭；额外成员候选使用独立随机流，避免即使未采用也污染正式布局。开启打法时仍受真实资金、库存、合法操作、有限循环、必要恢复／阻挡／对空和分阶段升本约束；这些约束是实验启发式，不是通关保证。固定打法不能与 beam／team 同时开启。两阶段 recipe 选择没有达到采用门槛，默认仍为 legacy。

补充默认、筛池语义、候选随机数隔离、部署与评估一致性、站位／朝向、升本、打法和交易分支检查；同步 README、AI 设计、META 和版本历史。没有改变游戏数据、其他玩法或发行版本号。本地原工作目录显示 0.2.2，源码发行沿用 0.2.3；已逐文件核对 AI 及其战斗／共享规则和数据一致，版本显示差异不影响本次 AI 对照。

## 本轮实际验收

| 验证 | 结果 |
|---|---|
| 默认／分队／成长／Boss／布局／打法／确定性等相关测试 | 103 项通过 |
| 新增站位与经济专项、发行版本契约 | 21 项通过（15 项 AI、6 项发行契约） |
| 文档一致性与路径 | 31 项通过 |
| lint、imports、typecheck | 通过；lint 为 0 errors、139 warnings，保留原提示 |
| 发布副本 HTTP smoke | 通过，包含 `/healthz`、首页和浏览器 vendor 请求 |
| matches golden | 18/18 匹配，零场景改动；其他 golden 文件原样保留 |
| 本地运行 | 3000 端口原先空闲；后台启动原游戏目录，`/healthz` 返回 `ok: true` |
| 原工作目录 | HEAD、master 分支、Git 索引及 401 份运行／数据哈希保持 |

未运行全量 CI、全部 golden 家族或浏览器实战套件，不宣称这些全部通过。

发布副本未指定任何实验策略参数，使用真实默认配置重放此前确认开局：

| 重放 | 通关 | 到达 Boss | 运行错误 | 与原稳定记录对照 |
|---|---:|---:|---:|---|
| 双 AI 终极，19801–19850 | 3/50 | 8/50 | 0 | 每局 15 个语义字段全部相同 |
| 三 AI 终极，19901–19908 | 0/8 | 0/8 | 0 | 每局 15 个语义字段全部相同 |

对照字段包括种子、地图、Boss、胜负、通过回合、剩余生命、隐秘状态、实际层数收益和 Boss 战记录。时间开销受机器负载影响，不比较计时字段。这是发布副本的复现验证，不能作为新增独立胜率样本或宣称性能提升。

## 复现与保护记录

从独立发布副本执行，完整日志与测试文件清单在 `ark/publishing/`：

```text
node --test --test-concurrency=1 test/match/bot.test.js test/match/bot-smarter.test.js test/match/bot-bond-strategy.test.js test/match/bot-layer-growth.test.js test/match/bot-boss-output.test.js test/match/bot-tactical.test.js test/match/bot-playbooks.test.js test/match/bot-playbook-engines.test.js test/match/bot-deployment-alignment.test.js test/match/bot-stable-default.test.js test/match/bot-band-feasibility.test.js
node --test test/match/bot-positioning-economy.test.js test/version.test.js
node --test test/docs-consistency.test.js test/docs-paths.test.js
node tools/ci.mjs --only lint,imports,typecheck
node tools/ci.mjs --only smoke
node tools/golden.mjs --family matches --jobs 2
node tools/botbench.mjs --configs coop2:ABYSS --seed 19801 --seeds 50 --jobs 3 --json ../ai-best-20261022-release-duo.json
node tools/botbench.mjs --configs coop3:ABYSS --seed 19901 --seeds 8 --jobs 2 --json ../ai-best-20261022-release-trio.json
```

`prepare-ai-best-20261022.mjs` 和 `audit-ai-best-20261022.mjs` 记录精确文件与哈希、比较原稳定原始记录并验证保护项。发布仅显式列出的源码、测试和文档；本地依赖链接、素材清单、日志和测试产物不入提交。没有重打完整素材 Release。
