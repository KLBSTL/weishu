# 桌宠 0.2.0

在桌面上用角色卡聊天、阅读世界书，并通过顶部吊坠打开六页管理面板。支持本机 DeepSeek Harness 和自行配置的兼容 API。当前版本在 Windows 上以源码方式分发。

## 首次运行与升级

安装 PowerShell 7 和 Node.js 22.16 或更高版本。在 PowerShell 7 中执行：

```powershell
git clone --branch desktop-v0.2.0 --depth 1 https://github.com/KLBSTL/weishu.git
Set-Location weishu
npm ci --ignore-scripts --no-audit --no-fund
./启动桌宠.ps1 -Check
./启动桌宠.ps1
```

首次启动需联网安装锁定的 dsh-pet 0.4.1 和 Electron。打开「设置 → API连接」后选择连接方式。本机 DSH 官方账号模式使用已安装且已登录的 DeepSeek Harness。「人物 → 角色卡 → 导入」可选择自己的 PNG 或 JSON，也可直接导入随附的[能天使 PNG](../desktop-pet/cards/exusiai-lungmen-1.0.1/能天使-下班后的龙门.png)。

已有 `dev` 工作副本可以执行 `git pull --ff-only origin dev`，再运行 `./启动桌宠.ps1 -Restart`。已运行的实例如使用自定义 `-DataHome` 或 `-Port`，重启和停止时传入相同参数。默认人物、历史和连接保存在 `desktop-pet/state`。要在另一份检出目录使用原资料，请先正常停止桌宠，再用 `-DataHome` 指向原资料目录。升级能天使时，先勾选「更新当前人物，保留记忆」再导入新版。

## 本版变化

- 「设置 → 外观与主题」提供冰晶、羊皮手札、复古书桌、摊开书册和虹轨放送。新面板默认使用摊开书册，已有的主题选择会保留。
- 虹轨放送铺满窗口，角色主图按画框取景，点击即可查看整张原图。应用新卡后，左侧人物与右侧卡库同步。卡库的六个图标保留操作名称与焦点提示，导出范围仍可选择。世界书编辑按右栏实际宽度换列。
- 摘录按当前人物可见的资料生成。阅读区过滤作者备注、其他人物专属内容和带条件的条目。虹轨收听使用作者单独填写的公开摘录，缺少摘录时可播放卡内开场。手动点播优先换话题，静音时仍可发送文字。
- 便携启动器会为 Electron 同时安装主题目录模块和渲染所需脚本。能天使公开卡升至 1.0.1，包含 12 组中文对话示例、16 条世界书与 4 个提示块。[使用与来源](../desktop-pet/cards/exusiai-lungmen-1.0.1/使用与来源.md)

## 后续开发计划

| 优先级 | 工作 | 完成条件 |
| --- | --- | --- |
| 1 | 真实桌面上的多屏、缩放与中文输入 | 连续使用 40–60 分钟，跨不同 DPI 屏幕拖动吊坠、切换前台、开合面板、输入中文并重启。记录可以复现的焦点、点击或位置偏移，再补定向回归。 |
| 2 | 长文输出、话题重复与行动连续性 | 用已获许可的公开卡复测 16 条被动、8 条主动和 6 问。分别统计完整等待、已展示内容、同一事件重讲、拿取或归还物品前后的矛盾，再决定缓存及状态模型的改动。 |
| 3 | 独立安装器与可恢复升级 | 在干净 Windows 环境验证首次安装、升级失败后回退，以及保留角色、连接和历史卸载重装。 |

## 验证方式

2026-11-18 发布副本完成 180 项桌宠回归，全部通过、零跳过。公开角色包另有 5 项实际页面导入检查通过，ZIP 内 7 个文件逐一核对 SHA-256。布局覆盖 1200、860 和 390 像素宽度的世界书编辑区；隐藏 Electron 验证了吊坠开合、原生输入和面板点击。

发布副本的宿主测试使用临时资料目录和本地模拟接口。配置 `CHROME_PATH`、`DSH_PET_ELECTRON_PATH` 和可用的 `SP_DSH_EXECUTABLE` 后，可执行：

```powershell
$env:SP_E2E = '1'
$env:SP_PWSH_EXECUTABLE = (Get-Process -Id $PID).Path
node --test --test-concurrency=1 test/companion*.test.js test/desktop*.test.js test/ui/*.test.js
node tools/check-public-card.mjs
```

缺少可选运行时时，测试汇总会标出跳过的用例。上个版本的安装说明与模型采样见 [0.1.0 阶段记录](desktop-stage-0.1.0.md)。
