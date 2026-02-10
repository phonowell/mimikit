# API Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/llm/api-runner.ts`
- 导出函数：`runApiRunner`
- 目标：通过 HTTP 调用 OpenAI Chat Completions

## 输入与输出
### 输入
- `prompt`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`seed`、`temperature`

### 输出
- `{ output, elapsedMs, usage? }`

## 执行流程
1. 读取 codex settings（模型/鉴权/baseUrl）。
2. 解析最终模型 `resolveOpenAiModel()`。
3. 构建超时控制（`AbortController`）。
4. 调用 `/chat/completions`。
5. 解析输出文本与 usage。
6. 失败时抛错，不做内部 fallback。

## 调用方
- `src/manager/runner.ts`
- `src/worker/standard-runner.ts`
