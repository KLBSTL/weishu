# 管弦和鸣强制倒地修复（2026-10-21）

## 已确认要求与证据

用户要求将管、弦技能造成的强制退场修正为强制倒地，仅做必要测试后上传 GitHub。
已核验：`server/sim/content/catastrophe.js` 的合奏爆发处理使用 `permanent: true`，
使干员 `removed=true`、再部署时间无穷，无法留下倒地模型或自动再部署。
引擎 `battle/deploy.js` 已支持非永久倒地、原地占位及按费用自动再部署。

## 拟改行为与范围

- 天灾隐秘核心合奏开始时及期间，凋亡爆发的干员立即强制倒地，生命归零。
- 使用引擎倒地流程，保留倒地位置、正常再部署倒计时和费用；计时结束且费用足够后自动起身。
- 保留原设计的致命伤、击杀、死亡监听抑制，避免不死或复活能力抵消强制倒地。
- 装置豁免、战术点与流形自身恢复机制不变；普通难度、合奏技力和伤害数值不变。
- 同步技能文本、翻译、生成数据和规则文档。无未定口径，不纳入暂停中的 AI 改动。

## 必要验收与实施结果

定向回归覆盖已有爆发、期间新增爆发、倒地位置/占位、计时与费用自动再部署、
再次倒地以及召唤物恢复；检查相关文档、翻译及修改文件语法。
发布基于 GitHub 当前 main 的独立提交，保留本地分支、索引和其他未提交内容。

已实施：移除永久退场标记，使用 `reason: killed` 的正常倒地状态及客户端倒地表现，
继续抑制致命伤、击杀和死亡监听；同步四种翻译和技能说明。
生成数据经离线构建更新，只有管、弦的天灾技能说明发生变化，数值和其他敌人未变。

在 GitHub main `c8c40ba36f51ec5e429a8bb73c870e5916ecbffb` 的独立目录完成必要验证：

- `node --test test/content/catastrophe-bosses.test.js test/docs-consistency.test.js test/docs-paths.test.js`：68 项通过，0 失败（首领 37 项、文档 31 项）。
- 新回归实际运行倒地、原地占位、等待再部署倒计时、费用不足等待、支付费用自动再部署、再次倒地，并确认复活监听无法拦截。
- `node tools/golden.mjs --family fields --only hidden-boss_10-pair,hidden-boss_10-solo --jobs 2`：两个现有隐秘管弦场景均匹配；无 golden 更新。
- `node tools/build-data.mjs --offline --quiet`、`node tools/i18n.mjs check --all --strict`：通过，四种语言无缺失或错误。
- `node node_modules/eslint/bin/eslint.js server/sim/content/catastrophe.js test/content/catastrophe-bosses.test.js tools/catastrophe-data.mjs`、`git diff --check`：通过。

按用户要求未运行全量测试或 AI 性能实验。本次发布仅含倒地修复、对应测试和说明。
