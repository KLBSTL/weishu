# 阿戈尔、萨尔贡与萨卡兹实施记录

日期：2026-10-26。状态：玩法实现及必要验证已完成，本记录随本次提交上传。

用户已授权本次落实玩法草案、完成必要测试并上传 GitHub；按钮艺术字、图标、主题设置及相关界面美化留到下一次更新。玩法的层数显示、图鉴、文案等必要同步属于本次。

完整确认依据见 [归档执行说明](specs/tri-alliance-20261025.md)，工作草案为 ark/docs/tri-alliance-and-art-ui-20261026.md。该说明中已确认的 A—M 边界完整适用，不缩减为几个数值调整。

范围：萨卡兹六人独立0—3层物法次数盾与攻击力附伤；萨尔贡三/六人双属性临时增益、普通六人开战回技快照及娜仁图亚兼容；阿戈尔基础攻击继承账本、独立六人档、七名干员特质/招募、套装反击与歌蕾蒂娅分队。其他玩法、AI与经济保持。

本地原分支与索引存在大量既有工作，保留其状态；只把本次明确修改的路径同步到最新发布副本，沿用快进推送。

验证计划：按执行说明A—M添加聚焦引擎/规则/数据/分队校验；检查客户端与服务端共用模拟、生成器可复现、文案与名单；运行相关现存测试、文档/导入/语言检查和有意玩法变更的黄金结果。仅依据实际输出记录通过、失败与未运行。


## 已实现

萨卡兹六人使用独立次数盾、开技后当前攻击范围和A×10%×H附伤；萨尔贡20/40层及开战SP快照；阿戈尔基础加算/逐目标账本、独立六人档、指定七名干员、同人装备套装与歌蕾蒂娅固定赠送分队已接入。正式124名、阿戈尔10名，分布18/19/21/25/19/22，分队44支。

新增不受死亡事件屏蔽影响的unitLeave生命周期事件，使非击倒强制移出即时撤销共享来源；击倒仍保留。海霓首个合格击倒事件使用单位内存标记和原上限双重约束，重绑不重获次数。治疗/恢复倍率仅在已合法通过原禁疗判断的恢复接收端应用一次。

默认技能复用现有克莱门莎S2/三技能脚本，不新增同名技能；乌尔比安旧ID保持、四本库存16，克莱门莎五本库存8并退出自选。歌蕾蒂娅分队在硬/软禁、真人/AI/默认/超时路径同样被限制，奖励走原取得/合成/满手流程。

## 当前验证结果

发布副本基于远端main 5fb7ae85，保留其0.2.3版本、版权/素材分发说明及历史文档归档链接；未覆盖原本地索引。当前结果：

- 相关19个测试文件：294通过、0失败、0跳过，包括本批10组A—M边界、既有盟约/装备/特质、招募/禁用、正式数据、潜能/技能、自选及回环联机、文档、语言覆盖和确定性数学检查。
- Chrome浏览器2项测试通过：萨卡兹真实战斗/统计卡，以及双玩家共享场的阿戈尔、萨尔贡真实数据回放；Node与浏览器结果摘要一致。已人工检查统计卡的0—3层独立显示。
- 全部298个黄金场景重建并再次比较一致；相对基线138变化、160不变，其中99个测试输入说明随新名单/本数/六人档变化。[逐场清单](tri-alliance-golden-20261026.md)明确区分阵容变化和同输入计算变化，不声称胜率提升。
- TypeScript检查通过；变更JS的ESLint为0错误、10条现存代码警告。四个界面语言包各1225条，100%覆盖，0缺失、0错误。离线重建逐字节一致性已在上述测试通过，git diff --check通过。
- 导入检查仍报告基线相同的3项server/sim/nodeData.js Node专用加载器提示（node:fs/path/url）；新模拟代码未新增Node导入。未为消除旧提示扩展修改范围。

沙箱直接启动Chrome/回环连接及系统临时目录重命名失败后，改用获准的本机测试、工作区专用TMP/TEMP重跑成功；这些初次环境失败不算代码通过。完整CI、长时间随机浸泡与AI胜率评测本次未运行。

关键命令（Node 22+，使用现有依赖）：

```powershell
node tools/build-data.mjs --offline
node tools/build-i18n.mjs --lang en --offline --quiet
# ja、ko、zh-TW同命令分别重建
node --test --test-reporter=tap test/content/tri-alliance.test.js test/content/sarkaz.test.js test/content/bonds_core.test.js test/content/garrisons_battle.test.js test/content/items.test.js test/match/recruitment.test.js test/match/columbia-income.test.js test/match/ban-configuration.test.js test/content/balance-update-20261022.test.js test/content/ultimate-enemies.test.js test/data.test.js test/diy.test.js test/full-potential.test.js test/lobby-diy.test.js test/content/kits_layout.test.js test/docs-consistency.test.js test/docs-paths.test.js test/i18n-data.test.js test/sim/detmath.test.js
$env:SIM_E2E='1'; $env:CHROME_PATH='<本机Chrome路径>'
node --test --test-reporter=tap test/sim/sarkaz.browser.test.js
node tools/golden.mjs --update
node tools/golden.mjs
node node_modules/typescript/bin/tsc --noEmit --checkJs -p jsconfig.json
node tools/i18n.mjs check --all --strict
git diff --check
```

本次未加入按钮美化、主题设置或概念图片，也不重打Release。B、D及八张候选图保存在ark/design-previews/20261026；Millsage后续按莹居中抱标志、其余四人分两侧各抱一字重做。
