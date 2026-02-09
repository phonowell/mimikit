# API Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/llm/api-runner.ts`。
- 导出函数：`runApiRunner`（别名 `runManagerApi`）。
- 目标：通过 HTTP 调用 OpenAI Chat Completions。

## 输入与输出
### 输入
- `prompt`、`timeoutMs`。
- 可选 `model`、`modelReasoningEffort`、`seed`、`temperature`。

### 输出
- `{ output, elapsedMs, usage? }`。

## 执行流程
1. 加载设置：`loadCodexSettings()`。
2. 解析模型：`resolveOpenAiModel(params.model)`。
3. 解析地址与鉴权：
   - `baseUrl`: `settings.baseUrl` → `OPENAI_BASE_URL` → 默认 `https://api.openai.com`
   - `apiKey`: `settings.apiKey` → `OPENAI_API_KEY`
   - 若需要 OpenAI 鉴权且无 key，抛错。
4. 构建超时控制：`AbortController + setTimeout`。
5. 发送请求：`POST {baseUrl}/chat/completions`，载荷包含：
   - `model`
   - `model_reasoning_effort`
   - 可选 `seed` / `temperature`
   - `messages=[{ role:'user', content: prompt }]`
6. 解析响应：提取文本与 usage，计算 `elapsedMs`。
7. 异常：统一包装为 `[llm] OpenAI request` 错误并抛出。
8. finally：清理 timeout timer。

## 错误语义
- 缺模型配置、缺鉴权、网络异常、响应解析异常都会抛错。
- 不做内部 fallback。

## 调用方
- `teller-runner`、`thinker-runner`、`worker-standard-runner`。
