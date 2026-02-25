# Runner 参考（当前实现）

> 返回 [系统设计总览](../README.md)

## Manager Runner

实现：`src/manager/runner.ts`

- 导出：`runManager`
- Prompt 组装：`buildManagerPrompt`
- 模板来源：`prompts/manager/system.md`（单模板渲染，支持 `{#if}` 条件块）
- 注入策略：代码仅注入内容；`<M:...>` 标签与结构由模板声明
- Provider 路径：`runWithProvider(provider='openai-chat')`
- Provider role：`manager`
- 会话连续性：依赖本地 `history/tasks/intents/managerCompressedContext`，不依赖 provider thread
- 应用层压缩：`compress_context` 基于本地上下文生成摘要并写入 `managerCompressedContext`
- 输出：`{ output, elapsedMs, usage? }`

流程：

1. 基于 inputs/results/tasks/intents/history/cron 上下文构造 manager prompt。
2. 执行 prompt 预算限制并计算 timeout。
3. 调用 OpenAI-compatible `chat/completions`（流式 SSE）。
4. 若出现 action_feedback/query_history，则在同批次内继续下一轮推理。
5. 成功/失败都归档到 `traces/YYYY-MM-DD/<ts36><ra>.txt`。

## Worker Runner

实现：`src/worker/profiled-runner.ts`

- 导出：`runWorker`
- Prompt 组装：`buildWorkerPrompt` -> `prompts/worker/system.md`
- Provider：`codex-sdk`
- 输出：`{ output, elapsedMs, usage? }`

流程：

1. 构造 worker prompt。
2. 执行 provider。
3. 多轮执行直到出现 `DONE` 标记或到达上限轮次。
4. 记录进度并归档最终结果。

## Provider Runtime

实现：`src/providers/registry.ts`

- 导出：`runWithProvider`
- 当前注册 provider：
  - `openai-chat`：`src/providers/openai-chat-provider.ts`
  - `codex-sdk`：`src/providers/codex-sdk-provider.ts`
- 共享 provider 运行时基元：`src/providers/provider-runtime.ts`
- provider 输入解析共享：`src/shared/input-parsing.ts`

不保留旧 provider 兼容层。
