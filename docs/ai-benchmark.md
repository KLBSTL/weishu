# 三AI终极模拟基准

场景：`coop3:ABYSS`，三名真正AI联防，无真人托管，默认3候选试打；种子1001—1050，每版50局，共100局。

```text
node tools/ai-compare.mjs --output outputs/ai-compare --seeds 50 --seed 1001 --jobs 4
```

基线默认取weishu提交021eca7b4fe7f2df659ba5e1d34c4f3bb788555e的bot.js、player/round.js、match/prep.js、audit.js。脚本使用隔离副本，仅替换这四个文件，其余运行时及游戏数据共用当前版本，不改原工作区。该版本未包含本轮AI增强或收入补助。`--baseline <commit>`可指定已核验的其他基线；首次运行需本地Git存在该提交。脚本不联网取得基线。

输出manifest.json（源码/数据哈希及配置）、两版原始JSON/日志、summary.json（配对结果）及report.md（通关、Boss/隐秘到达、回合、LP、95%区间）。每对核验地图与Boss相同，出现运行错误时停止统计，不把错误作为普通失败。保留隔离基线源代码供复核。

通关按正式Match的victory统计；Boss通过按roundsPassed≥bossRound；隐秘到达与隐秘通关区分。相同初始种子不保证策略分歧后的商店随机序列一致。并行仅用于结果采样，性能评估改为`--jobs 1`相邻执行。

本次实际结果：原版0/50、新版1/50通关；到Boss3/50→5/50，运行错误0，样本尚未证明稳定改善。详见[第二版实施记录](columbia-docx-v2-update.md)和[配对结果与哈希](ai-benchmark-results.json)。本场景用于之后AI修改复用；未单独拆分补助、分队偏好和策略增强的贡献。
