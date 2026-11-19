# 本地部署验收（2026-11-18）

开发基线：desktop-pet-v1.1，package version 1.1.0；旧版与归档未修改。

## 已实测

- Python 3.12 独立 venv，sherpa-onnx 2.0.1、PyAV 19.0.2；完整依赖锁见 requirements-lock.txt。
- 官方 SenseVoice int8 包 163002883 字节；SHA256 与 GitHub Release digest 一致：7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e。
- /health 返回 ok=true、device=cpu、model=sensevoice-int8。
- 官方中文测试语音 5.592 秒，WAV 转写 0.314 秒；转为 WebM/Opus 后转写 0.322 秒。两者都输出“开饭时间早上9点至下午5点。”。这是单一样本实测，不是所有录音的速度或准确率保证。
- 通过 Electron 使用的 Node ASR 客户端模块，上传实际 WebM 音频到本机服务，得到同一转写文字。
- 无效音频 HTTP 400；浏览器 Origin HTTP 403；流式 body 限制测试通过。
- 服务 stop→start→重复start 流程通过，重复启动复用已有模型服务。
- 原有99项测试通过；新增16项JS测试、4项Python测试通过；git diff --check通过。

## 尚未实测

真实桌宠进程启动返回 0x80000003，尚未确认根因。未声称这是宿主限制，也未通过禁用 Electron sandbox 绕过。

因此真实麦克风授权、桌宠聊天窗的点击录音、LLM回复/TTS/口型全链路仍待在成功启动的桌宠中验收。当前已证明实际引擎、模型、WebM解码、HTTP服务和Node客户端转写可运行。ASR无须在线服务或GPU；聊天/TTS仍按既有配置独立运行。

使用：启动桌宠.cmd 自动带起ASR；或先独立运行启动语音识别.cmd。聊天窗点击麦克风，再点停止；可取消/Escape。不用时停止语音识别.cmd释放内存。服务只监听127.0.0.1:8000，不常开麦克风，不保存录音。
