# 本地语音识别部署

此目录是 v1.1.0 上的本地 ASR 补丁。模型、Python 虚拟环境、日志位于忽略提交的 `_asr/`。

## 使用

1. 双击根目录 `启动语音识别.cmd`；已有本项目服务时直接复用，不重复加载模型。
2. 启动桌宠，打开独立聊天窗，点击 🎙 开始说话，再点 ■ 停止并转写。可点取消或按 Escape 丢弃本次输入。
3. 转写结果自动进入现有聊天处理；回答的 TTS 与口型仍由原有设置控制。
4. 不用时双击 `停止语音识别.cmd`，释放模型内存。关闭桌宠不会自动关闭独立 ASR 服务。

这是点击式半双工语音输入，不是常开麦克风，也不是全双工打断。录音期间停止聊天窗当前 TTS，避免录入自己的回复。Windows 首次可能请求麦克风权限。

## 结构

- `server.py`：FastAPI + sherpa-onnx CPU 推理，127.0.0.1:8000，仅回环请求；无 CORS，不保存录音或转写正文。
- `manage.py`：检查健康状态、启动、停止本项目进程。
- `download_model.py`：官方模型下载及 SHA256 校验。
- `test_service.py`：音频解码测试。

端点：`GET /health`、`POST /v1/audio/transcriptions`。上传字段 `file`，接受 WAV 与浏览器 WebM/Opus，PyAV 解码后转单声道 16kHz。最长 65 秒、12MB；串行推理，忙碌时 429。桌宠录音前端上限 60 秒、客户端请求超时 90 秒。

配置见根目录 `config.json` 的 `asr`。本地模型固定为 SenseVoice int8，自动识别中英日韩粤；`model/language` 兼容表单字段不触发模型切换或下载。默认无密钥。ASR 服务仅接受本地 HTTP，不会把录音上传外网。

## 模型来源

- 项目：https://github.com/k2-fsa/sherpa-onnx
- 模型：sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17
- 官方包：https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2
- 包字节数：163002883
- SHA256：7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e
- SenseVoice 权重遵守上游模型许可；服务代码不改变原有模型和 SDK 许可。

## 重建环境

使用 Python 3.12：`python -m venv _asr/venv`，再运行 `_asr/venv/Scripts/python.exe -m pip install -r asr/requirements-lock.txt` 和 `_asr/venv/Scripts/python.exe asr/download_model.py`。
