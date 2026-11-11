# DeepSeek V4 离线文本分词资源

2026-11-02 从 DeepSeek 官方 [Token Usage 页](https://api-docs.deepseek.com/quick_start/token_usage/) 实际链接下载 `https://cdn.deepseek.com/api-docs/deepseek_v4_tokenizer.zip`。

ZIP SHA256：`e7310d1dafe0a86d8a5629fe78a7c763760f651db9b8682718a1781dcd6fe495`。仅提取 tokenizer.json 与 tokenizer_config.json；没有运行归档 Python 示例、trust_remote_code、pip 或模型调用。

- tokenizer.json：`89085f12ef79460ac5f66d1119325ddfc694b4ab209d80bbd81d35f081dc9614`
- tokenizer_config.json：`841f8cf146e3f0ad1082594a31f68ecf7608c20467ef355081333d85bbaeb1cb`

官方 ZIP 不附许可证；随包保留的 MIT 通知依据官方 [DeepSeek-V4-Pro LICENSE](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/LICENSE) 及 [官方 tokenizer 许可说明](https://github.com/deepseek-ai/deepseek-recipe/blob/main/static/tokenizers/README.md)。许可证文本由已核对的官方网页复制；直接原文下载遭连接重置／超时，未关闭 TLS 校验。完整证据位于项目 `evidence/tokenizers`。

配置中保留了原始 `LlamaTokenizerFast`、`model_max_length:16384` 和 chat_template 元数据；本实现不将这些字段当作当前服务器上下文承诺，不执行 Jinja 或其他模板代码。用户显式选择 `deepseek-v4` 后，以固定 Tokenizers.js 对整个 `JSON.stringify({messages})` 编码，另留封装 512 和输出默认 1800。它不是服务器真实聊天模板／账单精确值；官方 API 返回的 usage 才是实际用量。图片在该 profile 下拒绝，不伪造精确视觉 token。

保守 profile 使用 UTF-8 字节代理预算，不加载此资源，不称为精确 token。图片另限 4 MiB、单张预留 16384 本地预算单位；这不是所有服务商视觉计费的通用保证。正文始终受独立 64 KiB 上限，超限拒绝，不截断原文。
