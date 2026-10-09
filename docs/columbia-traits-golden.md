# 哥伦比亚特质与伊芙利特双标签 — 黄金差异记录

2026-10-09。基线为本次修订前保存的 `ark/testing/golden-before-columbia-traits`。这是用户指定的玩法更改。

山在原休整结束时点，按获得人数分别增加投资人1/2、哥伦比亚2/4；星源移除击杀增长，改在场休整开始使已激活哥伦比亚和奥术各+2/+4；伊芙利特新增哥伦比亚标签，其他数值和技能保留。双标签改变盟约抽样阵容、每局禁用以及后续购买/战斗结果。两个检索分队尚未实现，不参与本次黄金结果。

| 场景类别 | 总数 | 变化 | 保持 |
| --- | --- | --- | --- |
| roster | 48 | 4 | 44 |
| bonds | 50 | 5 | 45 |
| fields | 22 | 0 | 22 |
| matches | 18 | 14 | 4 |
| standins | 11 | 0 | 11 |
| diy | 138 | 0 | 138 |

共287场景，23场变化，未增删场景；138个自选场景与11个补位场景全部保持。

## 变化场景

### roster

- `roster-008`
- `roster-009`
- `roster-026`
- `roster-027`

### bonds

- `bond-columbiaShip-high`
- `bond-deputShip-low`
- `bond-lateranoShip-low`
- `bond-siracusaShip-low`
- `bond-swiftShip-low`

### matches

- `solo-FUNNY-1`
- `solo-HARD-1`
- `solo-HARD-2`
- `solo-ABYSS-1`
- `solo-ABYSS-2`
- `coop2-NORMAL-3`
- `coop2-HARD-4`
- `coop3-ABYSS-5`
- `coop4-FUNNY-6`
- `coop4-ABYSS-7`
- `coop2-NORMAL-8-serverrun`
- `solo-HARD-9-boosted`
- `coop2-ABYSS-10-boosted`
- `coop2-NORMAL-70-diy`

## 验证

- `node tools/build-data.mjs --offline` 重新生成正式数据；四种语言通过 `node tools/build-i18n.mjs --lang <code> --offline --quiet` 更新。
- 角色及特质专项137项通过，涵盖普通/精锐、未激活不增长、复制、星源不再击杀增长、伊芙利特双盟约追伤不递归。
- `node tools/golden.mjs --update` 重新生成287场景；`node tools/golden.mjs --jobs 2` 已逐场复核通过，见 `ark/columbia-traits-golden-verify.log`。扩展回归见 `ark/columbia-traits-regression-final.log`；第一次运行遇到沙盒本机端口EACCES后中止，最终运行使用获准的本机网络权限。
- `node tools/ci.mjs --only lint,imports,typecheck` 三项通过；`node tools/i18n.mjs check --all --strict` 四语各1163条，0缺失、0错误。
- 最新扩展回归：2950项通过、0失败、0跳过，约323秒，覆盖所有 `test/content`、`test/match`，以及数据、语言、文档、盟约UI；见 `ark/columbia-traits-regression-final.log`。不是全仓库所有测试的再次运行；浏览器专项仍以首次落地记录为历史证据，本次未重跑。

本次扩展回归的命令（在仓库目录，PowerShell 7；使用本机可用Node路径）：

```powershell
$traitTests = @(Get-ChildItem -LiteralPath 'test/content','test/match' -Filter '*.test.js' -File | ForEach-Object { $_.FullName }) + @('test/data.test.js','test/i18n-data.test.js','test/docs-consistency.test.js','test/docs-paths.test.js','test/ui/feedback1b-bonds.test.js','test/ui/match-info.test.js')
node --test --test-reporter=../testing/concise-reporter.mjs $traitTests
```
