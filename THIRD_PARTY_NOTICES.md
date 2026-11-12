# 第三方组件、代码来源与参考说明

本项目的代码与资产来源按下面几类列出：随仓库分发的第三方文件、移植与改编的代码、只作设计参考的项目、模型与音频。

## 一、随仓库分发的第三方组件

| 组件 | 位置 / 版本 | 许可 | 来源 |
|---|---|---|---|
| **Electron** | 45.2.1（开发依赖，运行时） | MIT | https://github.com/electron/electron |
| **ws** | ^8.18.0（QQ 网关用） | MIT | https://github.com/websockets/ws |
| **Live2D Cubism Core** | `assets/vendor/live2dcubismcore.min.js` | Live2D Proprietary Software License（Redistributable Code） | https://www.live2d.com/ |
| **Live2D Cubism Web Framework** | `assets/sdk/cubism5-framework.js`、`assets/sdk/shaders/`（5-r.1 的打包产物） | Live2D Open Software License | https://github.com/Live2D/CubismWebFramework |
| **PixiJS** | `assets/vendor/pixi.min.js`，6.5.10 | MIT | https://github.com/pixijs/pixijs |
| **pixi-live2d-display** | `assets/vendor/cubism4.min.js` | MIT | https://github.com/guansss/pixi-live2d-display |
| **Tokenizers.js** | `electron/vendor/tokenizers/`，0.2.0 | Apache-2.0 | https://www.npmjs.com/package/@huggingface/tokenizers |
| **DeepSeek V4 分词资源** | `assets/tokenizers/deepseek-v4/` | MIT（来源与校验见该目录 `PROVENANCE.md`） | https://api-docs.deepseek.com/ |
| **@hazart-pkg/live2d-core** | 开发依赖 | 以其发布页为准 | https://www.npmjs.com/package/@hazart-pkg/live2d-core |
| **esbuild** | 开发依赖 | MIT | https://github.com/evanw/esbuild |

说明：

- `renderer/live2d5.js` 是对 Cubism Web Framework 的手写封装，不是官方 Sample 的副本。
- PixiJS 与 pixi-live2d-display 是早期渲染方案留下的文件，当前主渲染走 Cubism Web Framework 5。
- 使用 Live2D SDK 需遵守 Live2D 的许可条款；本项目的 MIT 许可不覆盖这些文件。

## 二、移植与改编的代码

### jingyu-live2d-agent

- 仓库：https://github.com/InariNGT-Ofiicial/jingyu-live2d-agent
- 许可：MIT，Copyright (c) 2026 InariNGT-Ofiicial

编舞引擎的下列部分由该项目的 Python 实现移植或改编为 JavaScript：

| 本项目文件 | 来源与关系 |
|---|---|
| `engine/sampler.js` | 关键帧采样数学（`samplePoints` / `sampleMotion`，smoothstep 插值）照其 `compiler.py` |
| `engine/arm-binding.js` | 手臂二维联动，移植自其 `arm_binding.py`；原算法作用于作者已有曲线，这里改为先合成轨道再改写，属于改编 |
| `engine/compiler.js` | 计划校验规则（冲突检测、范围裁剪、保持型轨道的淡入淡出）对照其 `compiler.py` |
| `electron/planner.js` | 「模型出计划 → 本地编译校验 → 失败重试一次」的流程对照其 `planner.py` |
| `engine/model-profile.js`、`renderer/parameter-policy.js` | 「物理输出只读、只写输入侧参数」的可写性判定思路 |
| `engine/test/choreo.test.js` | 部分采样测试点与其一致 |

按 MIT 许可的要求，保留其版权与许可声明：

```
MIT License

Copyright (c) 2026 InariNGT-Ofiicial

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 三、设计参考（未复制代码）

| 项目 / 资料 | 参考点 |
|---|---|
| **jingyu-live2d-agent** | 除上一节移植的部分外，还参考了它「自然语言 → 动作时间线」的整体分层，以及把虚拟主播能力拆成表演、语音、感知的做法 |
| **Live2D CubismWebSamples** | 遮罩缓冲的用法（按每个 drawable 的遮罩数分配缓冲、先 `startUp` 渲染器），用来解决早期渲染方案的脸部黑块 |
| **WHALEL2D** | `〔〕` 内联动作语言的思路 |
| **live2dLumiPet** | 多表情混合、vtube 热键、MediaPipe 面部捕捉的思路 |
| **dsh-world** | 日记 / 自我叙事式的记忆结构 |
| **dsh-bili-scroll** | 视频字幕与帧内容过滤的思路 |
| **VTube Studio** | 只作为行为对照（同一模型在其中的显示效果、热键与表情的组织方式）；未使用、未移植其任何代码 |
| **虚拟主播演示视频的逐帧量化** | 一段约 11 分钟的生动性演示，逐帧统计得出「眼、眉、嘴的活动量是头部的 4~5 倍」，由此定下表演优先级：口型 > 面部 > 头部微动 > 头部动作 |
| **传统动画原则** | 表演层手势的预备动作、过冲回弹、各部位先后跟随 |

### v1.1.0 新增模块的来源

`renderer/lip-sync.js`（口型）、`renderer/liveliness.js`（生动层）、`renderer/acting.js`（表演层与情绪）、`electron/director-provider.js` 的连接测试，以及台词行内标记的调度，均为本项目自行实现，没有使用上述任何项目的代码。

表演层的参数方向、可见幅度和表情联动，是在 DeepSeek 免费公皮「大肥鱼」上逐个参数截图实测得出的。

## 四、模型

| 项 | 内容 |
|---|---|
| 模型 | DeepSeek 免费公皮「大肥鱼」 |
| 原画 / 拆分 | @神宫凉子 |
| Live2D 建模 | @霓虹猫 NeonNeko |
| 视频剪辑 | @泣零7ero |
| 原发布 | 哔哩哔哩 BV1KmxY66EZ3 |

- 模型**不随本仓库分发**，请到原发布页获取，并遵守随模型附带的使用须知。
- 作者的说明以原发布页为准；使用本项目不授予模型资产的再分发权。

## 五、音频

- TTS 语音由**用户自行部署**的 [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) 服务合成，本仓库**不包含**任何语音模型权重、参考音频或声音克隆数据。
- 参考音频（`idle50.wav` 等）**不在仓库内**，仅存在于用户本机。

## 六、字体与图标

- 界面无内置第三方字体，使用系统字体。
- 表情 / 图标使用 emoji 与内联 SVG。

## 声明

若你是上述资产或代码的权利人，认为本项目使用不当，请通过仓库 Issue 联系，我们会及时处理。
