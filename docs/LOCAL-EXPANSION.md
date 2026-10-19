# weishu 扩展与分发

当前分支版本为 0.2.3，基于上游 0.2.2（`62eb113`），后续扩展独立维护。本次整理不改变已发布玩法，也不合并暂停中的 AI 试验。

## 当前规则

- [萨卡兹](design/sarkaz.md)、[哥伦比亚](design/columbia.md)、[分队与招募](design/recruitment-squads.md)。
- [天灾难度](design/catastrophe.md)、[三类敌人](design/ultimate-enemies.md)。
- [界面与外观](design/client.md)、[中继试验场](design/relay-map.md)。

规则以代码与生成数据为准；当前技术文档和回归测试仍保留。早期逐次方案和验收记录可从[整理前提交](https://github.com/KLBSTL/weishu/tree/f10164cadb1e31295f15f9b257d6f9a5a2f577e3/docs)查看。

## 分发

- 源码树保留运行代码、生成数据、锁文件、维护工具、回归测试、规则文档及许可证。
- 不跟踪 `node_modules/`、`public/vendor/`、`public/assets/`、`public/fonts/`，不清除已有 Git 历史。
- 完整 Release 包含当前素材、生产依赖和浏览器库；不附 Node.js 运行时、开发依赖、缓存与机器配置。
- 源码安装使用 `npm ci`，再从同版本完整包复制素材和字体；基础 setup 镜像不能保证复原所有扩展素材。
- 维护者具备当前素材后，可执行 `npm run package -- --out <仓库外目录>` 制作完整包。工具校验素材清单、导入、敏感本机路径及包内容。

素材、字体与第三方软件的权利不属于本项目的 GPL 授权。分发必须保留 [NOTICE](../NOTICE.md)、[LICENSE](../LICENSE) 及[第三方声明](../THIRD-PARTY-NOTICES.md)。

本次清理范围、来源和验收见[发布草案](core-release-20261019.md)。
