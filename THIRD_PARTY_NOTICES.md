# 第三方组件与引用说明

本项目的代码与资产来源如下，按组件列出。

## 运行时依赖

| 组件 | 版本/说明 | 许可 | 来源 |
|---|---|---|---|
| **Electron** | 45.x | MIT | https://github.com/electron/electron |
| **ws**（WebSocket） | ^8.18.0 | MIT | https://github.com/websockets/ws |
| **Live2D Cubism SDK** | Web 版（moc3 / 模型运行时） | Live2D Proprietary Software License | https://www.live2d.com/ |
| **Live2D 模型（DeepSeek 免费公皮）** | 大肥鱼 | 模型作者授权（请以作者发布页为准） | 模型作者发布页 |

> `live2d5.js` 是对 Cubism SDK 的手写封装（非官方 SDK 副本），运行需自行准备符合 Live2D 许可的 SDK 产物。

## 代码与设计参考

以下项目**仅作设计参考**，未直接复制其代码：

| 项目 | 参考点 |
|---|---|
| **WHALEL2D** | `〔〕` 内联动作语言思路 |
| **live2dLumiPet** | 多表情混合、vtube 热键、MediaPipe 面部捕捉思路 |
| **dsh-world** | 日记 / 自我叙事式记忆结构 |
| **dsh-bili-scroll** | 视频字幕/帧内容过滤思路 |

## 音频

- TTS 语音由**用户自行部署**的 GPT-SoVITS 服务合成，本仓库**不包含**任何语音模型权重、参考音频或声音克隆数据。
- 参考音频（`idle50.wav` 等）**不在仓库内**，仅存在于用户本机。

## 字体/图标

- 界面无内置第三方字体，使用系统字体。
- 表情/图标使用 emoji 与内联 SVG。

## 声明

若你是上述资产的权利人，认为本项目使用不当，请通过仓库 Issue 联系，我们会及时处理。
