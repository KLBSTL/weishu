# 精简源码仓库与最新版 Release 草案（2026-10-19）

## 已确认

- 用户要求清理 GitHub 最新文件，只留核心内容，更新 README，并发布新版 Release。
- 用户已选择：源码仓库不再附游戏素材和依赖副本，完整 Release 保留游玩所需素材。
- 清理只作用于即将发布的 Git 树；保留既有提交历史和本地工作区，不发布暂停的 AI 试验。
- 不改变战斗、经济、招募、盟约或天灾规则。

## 已核验来源与现状

- weishu 当前 main：`f10164cadb1e31295f15f9b257d6f9a5a2f577e3`，尚无 Release 或标签。
- 最新树有 20,744 个文件、约 1,292.75 MiB；游戏素材约 1,172.50 MiB，生产依赖约 63.71 MiB。
- 上游 [README](https://github.com/sganggs/Stronghold-Protocol#readme)、[NOTICE](https://github.com/sganggs/Stronghold-Protocol/blob/master/NOTICE.md)、[.gitignore](https://github.com/sganggs/Stronghold-Protocol/blob/master/.gitignore)：源码与游戏素材分开，完整发行包附素材；自编代码 GPL-3.0-or-later，游戏素材不适用 GPL，保留第三方条款及 Spine 附加许可。
- 本分支以 0.2.2 为基线，有独立扩展；本次不合并上游 0.3.x。

## 拟实施

- 分支版本为 `0.2.3`，标签 `v0.2.3`；README 明确它是基于 0.2.2 的 weishu 独立版本，不代表上游 0.3.x。
- 主树移除 `node_modules/`、`public/vendor/`、`public/fonts/`、`public/assets/`；保留源码、生成的核心数据、依赖锁、必要维护工具和核心测试、当前规则与安装文档、全部必要许可。
- 清理过期草案、重复验收记录与历史分析材料；所需既有资料通过上一版提交访问，更新引用避免失效。
- 重写 README，明确本 fork 的当前功能、完整包与源码两种启动方式、素材来源与版权、非商业要求、反馈渠道和上游致谢。
- 发布包含生产依赖和当前素材的完整 ZIP；不混入开发依赖、缓存、机器设置或暂停的 AI 改动。源代码压缩包由 GitHub 标签提供。
- 自定义素材与本地棋盘素材不一定能由公开镜像重建；源码安装说明明确优先使用同版本完整包素材，不能宣称 setup 能恢复全部内容。
- 使用独立索引生成快进提交；不改写历史。精简后最新源码变小，但完整历史仍保留旧素材。

## 待验证

- 精简树的相对引用、npm 脚本、安装和启动均可用。
- 发行包素材清单完整、第三方许可齐全、无本机路径及配置泄漏。
- 必要打包测试、文档检查、干净解压启动与 HTTP/模型素材抽查通过。
- 推送后确认 main、标签、Release 状态及上传附件大小和校验和。

## 实施与验证

- 精简源码保留 1,401 个文件；从最新树移除 19,345 个素材、依赖、截图和历史草案文件。核心测试、当前规则及仍被规则引用的上游历史规范保留，不删本机开发材料，不改写 Git 历史。
- 保留文档中 71 个指向已归档文件的链接改为整理前提交的永久链接。
- README、NOTICE、第三方声明、贡献指南及代理规则同步改为源码与完整发行包分发；第三方全文许可和 Spine 附加许可保持。
- package、锁文件和界面 APP_VERSION 一致为 0.2.3；协议版本仍为 1，没有玩法改动。
- 干净源码 `npm ci --no-audit --no-fund`：通过，自动生成浏览器库。
- `node --test test/core-release.test.js test/package.test.js test/package-update.test.js test/docs-consistency.test.js test/docs-paths.test.js`：44 项通过。
- `node --test test/assets.test.js test/assets-diy.test.js test/skin-catalogue.test.js test/doctor.test.js`：68 项通过。
- `node --test --test-reporter=spec --test-concurrency=4`：6,136 项，6,090 通过、44 跳过；两项失败均为重写 README 后缺失监听地址/可选本地素材说明。已补齐，两项所在测试及版本/分发检查共 20 项复测全通过，没有战斗测试失败。
- `node tools/ci.mjs --only lint,imports,typecheck`：通过；lint 零错误，138 个既有警告；导入检查保留 3 个现有 Node 数据适配器边界提示，类型检查通过。
- 完整包仅附生产依赖；打包清单、导入与本机信息扫描通过。干净解压核对 6,492 项运行文件和 13,417 项素材，真实 Chrome 首页显示 0.2.3、连接正常、无脚本错误；三张最新装备/分队图片 HTTP 可读取。
- 完整包仍需用户自行安装 Node.js 22+，未附运行时。本次不提供上游覆盖更新包。

## 发布状态

实施和本地验收完成。发布目标为 main、标签 `v0.2.3` 及[正式 Release](https://github.com/KLBSTL/weishu/releases/tag/v0.2.3)；远端状态以该页面为准。最终上传校验和与远端核验记录保存在工作区独立发布记录中。
