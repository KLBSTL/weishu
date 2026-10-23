# 卫戍协议：盟约 · Stronghold Protocol: Alliance

2026-10-23 开局盟约禁用更新：默认硬禁1个大盟约、软禁3个大盟约、小盟约禁用5个。等待室的“盟约禁用”按钮打开数量配置；多人的设置由房主同步。详见 [规则与验证](docs/ban-configuration-20261023.md)。

默认 AI 已采用盟约成长、特色分队、安全站位和 Boss 输出规划，并用最多三个候选进行真实战斗试打。采用最新双 AI 终极模拟对照中保留的稳定配置，额外战术、固定打法和学习模型默认关闭，详见 [当前 AI 选择与验证](docs/ai-best-publication-20261022.md)。

2026-10-22 盟约与特质更新：调整萨卡兹、哥伦比亚、炎、拉特兰及指定干员，录武官下放四本，恢复九名阿戈尔正式棋子；克莱门莎保持无特质的阿戈尔自选干员。详见 [本批修改记录](docs/balance-update-20261022.md)。

当前源码更新随 main 提供，原 v0.2.3 完整包尚未重新打包；可使用 main 代码配合该完整包的素材。

![version](https://img.shields.io/badge/version-0.2.3-32c9aa)

《明日方舟》「卫戍协议：盟约」的非官方同人网页游戏，支持独立模拟和 1–4 人合作，可加入 AI 队友。本分支基于 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 的 0.2.2，维护独立扩展；当前版本 **0.2.3（weishu）**。

更新记录：[CHANGELOG.md](CHANGELOG.md)。

## 声明

- 本项目与 Hypergryph、Yostar 及其关联方没有关联，未获其授权或认可。
- 自编代码使用 **GPL-3.0-or-later**。游戏角色、美术、Spine 模型、音乐、音效、文本、数据及字体等保留原权利人权利，不因附带本项目而获得 GPL 授权。
- 包含或使用游戏素材的整合包与服务仅供学习交流及个人非商业娱乐；不得售卖、收费分发、收费开服或通过广告、会员、打赏等方式盈利。GPL 对自编代码的许可不因此改变。
- **源码仓库不再附带游戏素材、字体、浏览器库或 npm 依赖；完整 Release 附带当前素材和生产依赖。** 请勿将游戏素材用于本项目之外或单独再分发。
- 权利人可通过[本仓库 Issue](https://github.com/KLBSTL/weishu/issues) 联系删除相关内容。项目按现状提供，无任何担保。

完整条款见 [NOTICE.md](NOTICE.md)、[LICENSE](LICENSE) 和 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。代码、第三方软件与游戏素材的授权范围分别说明。

## 当前内容

- 招募、升级调度、晋升精锐、配发装备与站位；自动战斗、地形装置、联防及首领作战。
- 险境、绝境、终极、天灾四种难度；天灾专属敌人、隐秘首领机制和第 12 回合高级首领悬赏。
- 萨卡兹、哥伦比亚扩展盟约、干员、装备与分队，包括斐尔迪南分队；恢复维多利亚干员，加入指定场外可选干员。
- 局外盟约图鉴；干员详情内逐个选择皮肤和动作。正式棋子与已明确加入的场外角色素材随完整包提供。
- 官方棋盘场景、碰撞偏移与视觉表现，以及自定义「中继试验场·双廊」。
- 汇总截至 2026-10-19 已发布的规则，包含三类敌人平衡调整与透明装备图标；本次整理不改玩法数值。

## 下载游玩（推荐）

1. 安装 **Node.js 22 或更新版本**（建议 22 / 24）。
2. 从 [最新 Release](https://github.com/KLBSTL/weishu/releases/latest) 下载 `Stronghold-Protocol-v0.2.3.zip`，解压到新目录。GitHub 自动生成的 **Source code** 压缩包只含源码，不含素材和依赖。
3. Windows 双击 `scripts/start-windows.bat`；macOS / Linux 执行 `bash scripts/start.sh`。也可在游戏目录执行：

   ```bash
   node server/index.js
   ```

4. 打开 `http://localhost:3000`。局域网队友访问主机 IP 的 3000 端口。

完整包已附生产依赖和当前素材，无需执行 `npm install` 或从外部素材站补齐；Node.js 运行时需自行安装。下载页提供 SHA-256 校验文件。升级前关闭旧服务器，保留旧安装作为备份，解压新版到新目录启动；不要直接覆盖来源不同的上游整合包。

部署与端口配置见 [部署指南](docs/DEPLOY.md)，操作见 [游玩说明](docs/PLAYING.md)。GitHub 页面本身不是在线游戏服务器。

常用操作：点选和拖放按地上的方格；已配发的装备锁定在干员身上；机变选卡需要确认。漏怪时顶栏的目标生命值实时减少，正式结算在回合结束。暂停（独立模拟）可在战斗中使用。同盟断线重连窗口为 10 分钟，独立模拟为 24 小时；需使用原浏览器，服务器重启会结束对局。

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `PORT` | `3000` | HTTP 与 WebSocket 端口 |
| `HOST` | `::` | 默认双栈监听；仅本机游玩可设为 `127.0.0.1` |

命令行修改示例：PowerShell 执行 `$env:PORT=3001; node server/index.js`；macOS / Linux 执行 `PORT=3001 node server/index.js`。

## 从源码运行

```bash
git clone --depth 1 https://github.com/KLBSTL/weishu.git
cd weishu
npm ci
```

将**同版本完整 Release** 中的 `public/assets/` 和 `public/fonts/` 复制到对应目录，再执行 `npm start`。`npm ci` 自动生成 `public/vendor/`。

`npm run setup` 可从公开镜像准备基础素材，但本分支的用户提供装备图标、扩展皮肤和已整理棋盘不保证全部可由镜像重建。要完整复现本版，请使用同版本 Release 的素材，不要混用其他版本的素材清单。

完整包的表情和「玩法说明」的教程图也已附带。客户端本地覆盖可补充特定召唤物和源石虫模型，可选本地覆盖素材需与当前版本一致；具体回退表现与提取方法见部署指南第 6 节。

最新源码已精简；旧提交仍保留过去的文件，完整克隆历史仍会下载旧素材。仅获取最新版可使用上面的浅克隆命令。

## 开发与维护

```bash
npm ci
node --test
npm run lint
npm run typecheck
```

保留核心源码、数据生成工具、回归测试、当前规则和技术文档。历史草案与重复验收记录已从最新树移除，可从[整理前快照](https://github.com/KLBSTL/weishu/tree/f10164cadb1e31295f15f9b257d6f9a5a2f577e3/docs)查阅。

- [扩展与分发说明](https://github.com/KLBSTL/weishu/blob/v0.2.3/docs/LOCAL-EXPANSION.md)
- [架构](https://github.com/KLBSTL/weishu/blob/v0.2.3/docs/ARCHITECTURE.md) · [规则索引](https://github.com/KLBSTL/weishu/blob/v0.2.3/docs/DESIGN.md) · [贡献指南](https://github.com/KLBSTL/weishu/blob/v0.2.3/CONTRIBUTING.md)
- [本次整理草案与验收](https://github.com/KLBSTL/weishu/blob/v0.2.3/docs/core-release-20261019.md)

## 致谢与素材来源

感谢上游 **sganggs/Stronghold-Protocol** 及贡献者，保留代码版权、英文翻译致谢和 Spine Runtimes 附加许可。本分支并非上游 0.3.x 的同步版本。

游戏及数据归 Hypergryph、Yostar 和相应权利人所有。原项目使用的公开数据和资源来源包括 Kengxxiao/ArknightsGameData、yuanyan3060/ArknightsGameResource、fexli/ArknightsResource、isHarryh/Ark-Models、ArknightsAssets 及 PRTS；公开镜像不代表授予素材再许可。维护者提供的扩展装备和分队图片也不默认为 GPL 素材。

第三方库、Spine、字体、数据来源及翻译署名详见[第三方声明](THIRD-PARTY-NOTICES.md)。分发时请同时保留所有许可证与版权声明。

Unofficial, non-commercial fan remake of the Arknights mode *Stronghold Protocol: Alliance*. This is the weishu fork. Its own code is GPL-3.0-or-later; game art, data, fonts and third-party software retain their respective rights. The source tree excludes downloaded assets and installed dependencies; the full Release includes the current game assets and production dependencies. Install Node.js 22+ separately. Not affiliated with or endorsed by Hypergryph or Yostar.
