# 当前稳定 AI 发布与本地应用草案（2026-10-21）

状态：版本选择、实现、本地应用及全部发布验收已完成；本稿为本次 GitHub 发布记录，最初草案先于本轮修改和发布。

## 选择依据（已核验）

“最好”按完整通关、团队存活、Boss 输出、已知退化和运行成本综合判断，不跨种子直接比较胜局百分比。
现有资料没有证明任何学习版已稳定优于当前启发式：

- 布局／分队／升本及盟约循环启发式已完成多轮真实终极模拟与回归，Boss 评估保留必要医疗与阻挡。
- 校准 beam 在 30 对同种子中最终胜利 2→1；未支持替换默认。
- 团队 V2 在 20 对中 1→2，但局部验证退化、部分道中提前失败。
- 团队 V3 在 20 对中最终胜利 2→4，但隐秘通关 1→0，并存在严重减员及明显成本问题。
- 最新终局学习器在 8 个训练状态里原始建议有两次严重减员，受约束版全部停止；未达到可用条件。

因此选择当前稳定启发式与三候选真实试打作为本次正式版本。`botPlanner: off` 仅关闭额外实验搜索／模型，
不是关闭 AI；成长规划、特色分队、朝向、医疗、经济、升本及 Boss 试打仍实际运行。
这是一项基于现有证据的发布取舍，不宣称统计上证明全局最优或稳定提高通关率。

## 拟发布与本地应用

- 明确版本化稳定默认配置：启发式、三候选试打；保留显式实验参数以继续研究，不默认加载模型。
- 发布当前经验证的核心 AI 及其运行依赖、相关回归和必要说明。原始实验数据、大运行副本、失败模型与终局离线训练器留在本地。
- 同步本地默认配置并检查本地服务的运行方式；保留现有游戏素材和用户数据。若需要重启，先核对活跃对局，避免无依据中断游戏。
- 使用 GitHub 当前 main 的独立发布目录和索引，保留管弦倒地修复、其他已发布内容和原工作分支／索引。
- 不为本次发布额外增加 AI 资金，不改干员、盟约、敌人或难度规则；不创建新 Release。

### 必要兼容修复（已核验）

线上仍缺少前期 AI 实验已验证的铳法盾簧反伤修复：反伤未标记为反击且带来源，可能和友方反射反复递归。
发布同时补入这个已经验证的修复，使线上引擎与 AI 对照所用规则一致：只由物理普通攻击触发，返还无来源附加伤害，保留归属，成功伤害后附加侵蚀。
此项单独列出验收及隐秘铳两个 golden 变化，不把消除模拟错误冒称 AI 智力提升。管弦倒地修复保持原样。

## 验收计划与边界

核对发布内容与本地稳定策略的一致性；相关 AI／文档／静态／冒烟测试，18 个 matches golden。
若不同于发布前线上策略，运行同游戏规则、同种子三 AI 终极模拟对照并如实保留失败；已知胜局／反例作为开发回归，不当未见样本。
有意变动的 golden 逐项记录原因，不覆盖无关既有差异。发布后校验远端 commit 与本地实际默认配置。

## 本轮实际结果

在 GitHub main `5fd7d768e0965c9313f78e89dc6989a5cc24e161` 的独立目录，使用相同当前数据、引擎和 17101–17120 新种子，
运行三 AI 终极模拟各 20 局。基线只恢复该提交的 AI／策略文件；两边均采用已修复的反伤引擎，避免把修复模拟错误算成策略收益。
旧版和稳定版错误均为零，地图与 Boss 逐种子一致；后续决策会改变随机消费，不保证商店相同。

| 指标 | 上传前 AI | 本次稳定 AI |
| --- | ---: | ---: |
| 最终攻势胜利 | 0/20 | 1/20 |
| 到达 Boss | 2/20 | 6/20 |
| 平均通过回合 | 9.90 | 10.45 |
| 平均剩余 LP | 0.65 | 3.75 |
| 隐秘通关 | 0/20 | 0/20 |

配对为一次负转胜、无胜转负，其余皆负；仍有部分种子提前淘汰，保留全部结果。
样本小、区间宽，不能据此宣称稳定提高胜率。医疗位置和层数数据只作诊断，不当死亡因果或 DPS。
额外复现已见回归种子 15805：稳定版最终与隐秘均通关，零错误；这一局不加入新样本统计。

相关 AI／管弦／反伤检查 122 项通过，包括默认新游戏实际部署与模型未加载检查。
其中一次性能守卫在并行评测中测得 312 ms CPU、超过原 300 ms 门槛；评测结束后独立复跑通过，未改阈值。
文档 31 项、静态 lint／imports／typecheck 和服务器冒烟通过；项目已有允许提示保持。

本地已在 `http://localhost:3000` 启动游戏服务器；启动前该端口没有服务，没有中断已有对局。
新对局使用 `stable-growth-boss-20261021`、正常 AI 与最多三候选试打，未加载实验模型。
本次只更新 main 源码，原 v0.2.3 完整包未重新打包，不创建 Release；Git 历史、原分支／索引和实验材料保留。

## Golden 审计

18 个 matches 场景全部因选人、成长、经济或布局决策变化而更新，新的全部场景与本地现有稳定 AI 基准一致：

`solo-FUNNY-1`、`solo-FUNNY-2`、`solo-NORMAL-1`、`solo-NORMAL-2`、`solo-HARD-1`、`solo-HARD-2`、
`solo-ABYSS-1`、`solo-ABYSS-2`、`coop2-NORMAL-3`、`coop2-HARD-4`、`coop3-ABYSS-5`、`coop4-FUNNY-6`、
`coop4-ABYSS-7`、`coop2-NORMAL-8-serverrun`、`solo-HARD-9-boosted`、`coop2-ABYSS-10-boosted`、
`coop2-NORMAL-14-standins`、`coop2-NORMAL-70-diy`。

仅 `hidden-boss_9-pair`、`hidden-boss_9-solo` 两个 fields 场景因铳法盾簧物理普攻／无来源反击修正而更新。
fields 其余记录和其他 golden 家族保持上传前内容，不覆盖本地已知的无关旧差异。
更新后再次执行检查：18 个 matches 和上述 2 个 fields 场景全部匹配。

## 精确命令与材料

```text
node tools/ai-compare.mjs --baseline 5fd7d768e0965c9313f78e89dc6989a5cc24e161 --baseline-planner off --planner off --seed 17101 --seeds 20 --jobs 2 --output <全新输出目录>
node tools/botbench.mjs --configs coop3:ABYSS --seed 15805 --seeds 1 --jobs 1 --rehearsal 3 --planner off --quiet --json <全新结果文件>
node --test test/match/bot-stable-default.test.js test/match/bot-boss-output.test.js test/match/bot-bond-strategy.test.js test/match/bot-layer-growth.test.js
node --test test/match/bot.test.js test/match/bot-smarter.test.js test/match/bot-boss-economy.test.js test/content/catastrophe-bosses.test.js
node --test --test-name-pattern="cost guard" test/match/bot-smarter.test.js
node --test --test-name-pattern="簧|spring|反伤" test/content/enemies_bosses.test.js
node tools/golden.mjs --family matches --jobs 2
node tools/golden.mjs --family fields --only hidden-boss_9-pair,hidden-boss_9-solo --jobs 2
node --test test/docs-consistency.test.js test/docs-paths.test.js
node tools/ci.mjs --only lint,imports,typecheck
node tools/ci.mjs --only smoke
```

完整逐局记录和比较来源位于本地 `ark/testing/ai-stable-20261021/paired-new-20/`；发布独立索引、日志、
保护校验和提交记录位于 `ark/publishing/`。只发布本稿及必要核心文件，不将实验大目录或失败模型上传。
