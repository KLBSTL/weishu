# 地图材质还原草案与实施记录

日期：2026-10-15。状态：**本批已完成并通过本地验收。** 用户在上一轮视觉迁移后授权开始下一批，范围为地图法线、金属度/光滑度和自发光。AI优化继续暂停；本轮未提交或上传GitHub。

## 已核验的起点

- 上一轮已分发11张场景、网格和烘焙光照。sceneMaterial目前主要使用底色、主光和lightmap，场景贴图加载器仅收集材质的map；所有场景图像被当作sRGB纹理。
- 11张场景共76条材质记录，保留原shader、keywords、纹理缩放/偏移、floats和colors。检查现有目录发现18张所需法线/金属/自发光贴图缺失；基础棋盘的部分相关纹理已经存在，可核验后复用。
- 原场景网格含法线、UV0、UV1、顶点色，没有切线属性。不能直接把切线空间法线当世界法线，也不能为金属贴图应用sRGB转换。
- 已冻结396个当前文件及SHA256到独立研究目录；此前的全部玩法/AI代码、golden及原索引保留。

## 来源与待核验

- 固定场景仍来自上游488db49f11daf862b67ce26fa4cf89aa6cba2466及校验后的0.2.6资源包，见[上一轮迁移](visual-restoration-migration-draft.md)。
- 补充素材取自官方Android赛季26-04-13-12-31-42_e9b560的hot_update_list及地图依赖bundle；下载后逐个核验官方MD5，并记录SHA256与导出清单。原bundle、索引和提取依赖放研究目录，运行时不依赖Python或官方CDN。
- 通用通道依据：[Unity金属/光滑度](https://docs.unity3d.com/Manual/StandardShaderMaterialParameterMetallic.html)、[法线](https://docs.unity3d.com/Manual/StandardShaderMaterialParameterNormalMap.html)、[自发光](https://docs.unity3d.com/Manual/StandardShaderMaterialParameterEmission.html)。HG自定义shader的启用条件与打包方式优先核对实际shader数据，不能仅凭贴图后缀推断。
- [已核验] 本批8张法线为ETC2_RGB（34）或ASTC_6x6（50）的RGB XYZ编码，原GLES采样RGB×2−1，XY乘_BumpScale。金属贴图采样R/A，MetallicGlossMap启用时使用贴图R而非将其乘以_Metallic；光滑A乘_GlossMapScale。自发光仅按_EMISSION启用并乘_EmissionColor。其他未确认编码由导出器拒绝/跳过，不猜测swizzle。
- shader来源：固定官方索引中的shaders/standard.ab（MD5 31f521ccc399c290ca501f7ca4380f69）和shaders/standardrealtimeshadow.ab（MD5 c3239548dd936216ebfcd4d065f4cb2f）。UnityPy的完整Shader.export不兼容其中分段程序；已按压缩段解出实际GLSL片段核对上述采样语句，不对未正确解析的程序表作结论。原程序与研究脚本留在研究目录。
- [未实现] 完整顶点颜色/第二层材质混合与原场景反射探针。当前反射来自已有studio PMREM，线性mobile BRDF近似保留已解码lightmap；这两项明确标为[ASSUMED]，不声称与Unity Gamma渲染逐像素一致。

## 拟实施

1. 收集、校验并离线分发这11张场景实际引用的相关贴图，扩展提取器和可重建的分发清单。
2. 按纹理用途区分sRGB与线性采样。经原shader核对，三个表面采样器共用MainTex的UV变换，按该规则处理缩放/偏移；复用图像时不混淆GPU纹理的色彩空间。
3. 从几何法线、UV导数构造切线基，应用原法线强度；还原金属R/光滑A、标量fallback和已确认的原shader控制项。
4. 在原烘焙光照之上加入对应反射/高光和自发光，保留alpha、焦点明暗、无纹理/自定义地图/2D回退及资源释放。
5. 使用固定地图、相机、窗口和GPU保存前后截图；验证缺图、切换场景、上下文恢复、像素特征、性能和素材闭包，战斗golden保持不变。

## 范围与验收

涉及board3d的load/materials/scene、素材导出与清单生成、对应测试和文档；不修改服务器战斗、AI、干员、经济、地图可部署格或碰撞。水面动态交互、环境粒子、天空盒、后处理及技能素材不在本批实现范围。

先执行材质/资源定向测试与真实WebGL材质用例，再运行绘制组合、静态检查、文档、golden和适用浏览器回归。不能仅以uniform存在声称视觉已实现；需真实shader编译和画面对照。性能与前后截图均记录在ark/testing/material-restoration-20261015/，不降低现有性能阈值。

## 实施记录

已完成：

- 新增22张官方表面贴图，其中8张法线、9张金属/光滑度、5张自发光；PNG共6,669,539字节。连独立materials.json补充清单，完整棋盘包增至156文件、56,000,708字节，比上一轮增加6,680,233字节。原catalogue.json与场景网格保持不变。
- 新导入器tools/import-scene-materials.py核验8个主题bundle的官方MD5，记录索引SHA256及各bundle SHA256；只导出已启用且实际引用的贴图。attachBoardArt合并独立补充目录并保护其资源不被prune删除。运行客户端无需UnityPy、提取脚本或网络下载。
- 场景加载器只请求已启用贴图；N/M作为线性数据，底色/E作为sRGB创建纹理，缺图保留几何法线和标量。原贴图与GPU纹理分别缓存，场景重建复用，释放时两类均销毁。
- 用UV导数构造切线基，处理镜像UV、退化UV与法线强度0；金属R/光滑A、高光与反射开关、自发光关键词/颜色、共享MainTex变换均接通。Unlit/粒子材质绕过表面光照，保留alpha和焦点效果。反射与BRDF近似如上注明。
- 11张地图保存1600×900、DPR 1的迁入前后截图并逐图复核；所有场景均实际启用N/M，城市和竞技场启用E，没有误给沙地图材质打开未启用的自发光。无HTTP、页面或shader错误。

## 最终验证

| 检查 | 结果 | 日志（研究目录） |
|---|---|---|
| 绘制、素材提取及召唤模型组合 | 626项：617通过、0失败、9按默认条件跳过 | render-tests.log |
| 真实Chrome棋盘及材质像素 | 40通过、0失败、0跳过 | browser-final.log |
| 素材准备、启动冒烟、lint、导入、类型 | 全部通过；新增测试的一条unused警告已修正后复验 | ci.log、lint-final.log |
| 本地golden全部家族 | 290个全部匹配，未更新任何golden | golden.log |
| 独立候选Git索引打包闭包 | 1通过、0失败，保留真实索引 | package.log |
| 保护检查 | server/shared/golden的384个文件SHA256无变化 | summary.json |
| 文档与可重建性 | 31通过、0失败；主素材清单重复生成字节相同，22张贴图解码像素与原导出相同 | docs-final.log |

主要命令：

```text
node --test --test-concurrency=4 <rg --files test/render -g '*.test.js'列出的文件> test/local-extract.test.js test/local-token-models.test.js
RENDER_E2E=1 node --test --test-concurrency=1 test/render/scene-surface.browser.test.js test/render/board3d.browser.test.js
node tools/ci.mjs --only setup,smoke,lint,imports,typecheck
node tools/golden.mjs
node --test test/docs-consistency.test.js test/docs-paths.test.js
```

环境变量为简写，Windows使用PowerShell的$env:RENDER_E2E='1'并设置CHROME_PATH。完整记录与原图在ark/testing/material-restoration-20261015/；真实像素输出在test/e2e/out/scene-surface-pixels.json。像素用例实际验证RGB法线改变照明、强度0恢复、R与A各自改变表面、G/B不影响金属、无光时E发亮/未启用时不发亮、UV与缺图/退化回退，而非仅查uniform。

32个棋盘/机位/分辨率视图、相机切换、上下文恢复、无素材/2D回退及120单位压力仍通过原阈值。压力样本56.1 FPS，棋盘JS 0.26 ms；未降低45 FPS / 3 ms门槛。新贴图与反射有采样开销：同机1920×1080、120单位、竞技场地图，交替旧/新各两次（每次200帧），均值13.44→14.20 ms/帧，约增加5.6%；这是本次画质取舍，不宣称帧率改善。普通地图的前后采样约6.06 ms，受显示刷新上限限制，不能由此声称零开销。

本批未重复整仓长时间AI/房间测试，也未修改它们。已对全部绘制相关测试、真实浏览器、静态规则、资源闭包与全量战斗golden完成验证。完整顶点混合、原反射探针、水面交互、环境粒子、天空盒/后处理和技能特效留给后续批次。
