# weishu — 萨卡兹与哥伦比亚扩展

本仓库保存当前可运行版本的源码快照。基础项目为 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)，基线为上游0.2.2、提交 `62eb113`。保留原项目作者声明、GPL-3.0-or-later许可证、第三方声明及非官方同人使用说明。

## 当前内容

- 萨卡兹9名、哥伦比亚10名，伊芙利特只属于萨卡兹与远见，共19名不同干员。具体角色、盟约和特质以 [萨卡兹规则](design/sarkaz.md)、[哥伦比亚规则](design/columbia.md) 为准。
- 薪火集结分队：22生命，每正式回合首次主动刷新优先两名不同的合格萨卡兹，正常购买；不再发归队信标。
- 拓界研发分队：26生命，首回合豆苗，第3/6/9回合发研发调令，用普通哥伦比亚样本换高一本，最多二选一。
- 检索在休整期商店上方操作，次数可保留，取消不消耗，重连不重抽，样本装备回收，空间不足拒绝确认。详见 [检索分队规则](design/recruitment-squads.md)。
- 战斗中点击干员可查看本场战斗统计；复用原项目单人及1–4人合作联机。
- 常规招募池106名，分队42支。云迹、星源及部分阿戈尔、维多利亚干员暂时隐藏，保留烛煌与哈洛德。

三本哥伦比亚芯片、六本力场发生器已接入商店与战斗，两个普通件可合成精锐。二本束灵骨、六本死魂灵残躯也已加入商店，可合成精锐；更多地图和敌人仍为后续工作。自动测试验证机制，不代表已完成长期强度平衡。

## 安装与启动

需要 Node.js 22+（建议22或24）。仓库包含源码、生成的数据、依赖锁文件、原创SVG、文档、测试，以及下载的立绘/音频/模型、字体、前端库和完整生产依赖。普通游玩无需执行 `npm install`，启动不依赖外部素材站。

```bash
git clone https://github.com/KLBSTL/weishu.git
cd weishu
node server/index.js
```

浏览器进入 `http://localhost:3000`。局域网队友通过主机局域网IP的3000端口进入同一房间。也可以使用仓库内的 `scripts/start-windows.bat` 或 `scripts/start.sh`。GitHub仓库地址本身不是可直接游玩的游戏地址。

下载素材约560 MiB，可用 `git clone --depth 1` 只克隆最新版本。Node.js运行时本身需单独安装；没有上传开发依赖、浏览器、Python环境、缓存、机器配置和日志。开发测试时执行 `npm ci`，会按锁文件补齐开发依赖。

本地客户端提取是可选项，未附带3D棋盘等提取内容，详见 [素材说明](ASSETS.md)。当前下载源缺少磐蟹及中继器的专用模型时使用占位表现，机制仍可运行。

## 素材与依赖维护

本分支按维护者要求，将 `public/assets/`、`public/fonts/`、`public/vendor/` 及锁文件标记为生产依赖的包随仓库分发。每个npm包保留原始文件和许可证；开发依赖仍忽略。更新依赖时先执行 `npm ci` 和 `npm run vendor`，再按 `package-lock.json` 中非 `dev` 的包审核更新生产依赖（忽略目录中的新文件需显式加入），不要直接提交整个本机 `node_modules/`。不更改上游的许可证适用范围。

完整性检查：`node tools/setup.mjs --check --no-local`。无下载启动：`node scripts/launch.mjs --no-setup`，或直接运行 `node server/index.js`。

## 验证记录

2026-10-10 盟约与萨卡兹装备最终修订验收：

- `node --test --test-concurrency=2` 最终整仓复跑：5,818项，5,800通过、0失败、18跳过。首次运行的17项旧规则/计数断言失败已全部修正，并包含在此复跑中；日志位于本地 `ark/sarkaz-equipment-full-tests-final.log`。
- 核心规则193项、旧断言适配145项、变形同构体与装备池38项均通过；覆盖轰击共享冷却、目标持续伤害刷新、激活门槛、价格/资金特质、两件装备和首次刷新优先。
- `node tools/golden.mjs`：286个场景全部匹配。120个有意变化及原因见 [最终修订审计](sarkaz-equipment-golden.md)，138个自选场景均未改变。
- `SIM_E2E=1` 的萨卡兹/哥伦比亚浏览器模拟与服务端散列一致；`SP_E2E=1` 的两支分队页面、刷新与重连流程通过。浏览器截图已检查。
- 服务器冒烟、lint、导入边界、类型检查和四种界面语言严格检查通过，保留既有警告。
- 发布快照包含92个生产npm依赖包，无开发包或本地缓存。隔离目录中无需下载即可启动，10,906个素材引用无缺失，10,913个素材/字体/前端库地址均返回非空HTTP 200；屏蔽外部浏览器网络后正常进入大厅，无页面错误。

2026-10-10 手稿修订验收：

- `node --test --test-concurrency=2 --test-reporter=spec <本次27个相关测试文件>`：514项通过，覆盖新机制、生成数据、检索、装备配对、翻译和文档。输出保存在 `ark/columbia-final-validation.log`。
- `SIM_E2E=1 node --test test/sim/columbia.browser.test.js test/sim/sarkaz.browser.test.js`：2组浏览器测试通过；普通/精锐及萨卡兹模拟散列与服务器相同，角色素材HTTP请求成功。
- `node tools/ci.mjs --only smoke,lint,imports,typecheck` 与 `node tools/i18n.mjs check --all --strict` 通过；保留既有lint警告和导入检查中的既有提示。
- 整仓首次运行5812项：5772通过、22失败、18跳过；20项名单/计数/翻译旧断言已修正并纳入上述514项复验，另外2项耗时测试在独立复测中通过。不把首次整仓结果描述为零失败。
- `node --test --test-concurrency=1 --test-name-pattern='benchmark|performance' test/sim/perf.test.js test/sim/robustness.test.js`：3项通过。波次77.1、压力场景141.7、首领场最佳247.3微秒/步，均低于原500微秒/步阈值；仅为本机单独运行结果。
- 60局随机假战斗及8局真实模拟在整仓测试中通过。286个黄金场景按新玩法更新，变更列表见 [手稿修订审计](columbia-revision-golden.md)。

此前检索分队版本的功能验收（历史记录）：

- 126项定向测试通过，覆盖检索事务、旧分队兼容、生成数据、翻译、文档和相关界面。
- 60局随机假战斗及8局真实模拟通过，包含随机操作与断线重连。
- 两组真实浏览器流程通过，覆盖两支分队的选择、取消重开、刷新重连、领取及桌面/手机横屏布局。
- 287个黄金场景全部匹配。此次检索分队造成的22个有意变化详见 [审计](recruitment-golden.md)；此前扩展另见 [萨卡兹审计](sarkaz-golden.md)、[哥伦比亚审计](columbia-golden.md) 和 [角色修订审计](columbia-traits-golden.md)。
- 服务器冒烟、lint、导入边界及类型检查通过；已有lint警告保留。
- 全仓测试原始运行共5804项，5780通过、18跳过、6失败；6项旧断言/测试构造适配问题已修正并在上述定向及随机测试中复测通过。未将该次全仓运行描述为零失败。

维护与验证入口见 [AGENTS.md](../AGENTS.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)。源码快照包含全部测试，其他机器可复验。
