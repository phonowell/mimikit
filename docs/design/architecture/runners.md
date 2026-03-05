# Runner 参考（当前实现）

> 返回 [系统设计总览](../README.md)

## Manager Runner

实现：`src/manager/runner.ts`

- 导出：`runManager`
- Prompt 组装：`buildManagerPrompt`
- 模板：`prompts/manager/system.md`（`nunjucks` 渲染）
- Provider：固定 `openai-responses`（direct responses）
- Provider 配置来源：`loadCodexSettings()`，优先读取 `~/.codex/config.toml` 的 active provider（`base_url`、`api_key`、`env_key`/`api_key_env`），缺省回退 `OPENAI_API_KEY` 与 `~/.codex/auth.json`
- 会话连续性：依赖本地 `history/tasks/plans/managerFocusCompressedContexts`
- 输出：`{ output, elapsedMs, usage? }`

主流程：

1. 根据输入、任务、plan、历史、focus 组装 prompt。
2. 执行 token 预算与超时控制。
3. 调用 provider 接口并返回整段输出。
4. 若收到 `action_feedback/query_history/read_file`，在同批次继续修正回合。
5. 成功/失败都归档到 `traces/YYYY-MM-DD/<ts36><ra>.txt`。

## Worker Runner

实现：`src/worker/profiled-runner.ts`

- 导出：`runWorker`
- Prompt 组装：`buildWorkerPrompt` -> `prompts/worker/system.md`
- Provider：`codex-sdk`（外部执行运行时）
- 输出：`{ output, elapsedMs, usage? }`
- 上下文补充：注入当前任务 `focusId` 对应的 `focus summary/open_items`，以及可用的 `compressed summary`

主流程：

1. 构造 worker prompt。
2. 调用 provider（外部执行运行时）执行。
3. 多轮执行直到检测到结束标签或达到轮次上限。
4. 记录进度并归档任务结果。

## Provider Runtime

实现：`src/providers/registry.ts`

- 导出：`runWithProvider`
- 当前注册 provider：
  - `codex-sdk`：`src/providers/codex-sdk-provider.ts`
  - `openai-responses`：`src/providers/openai-responses-provider.ts`
- 共享运行时工具：`src/providers/provider-runtime.ts`
- 共享错误建模：`src/providers/provider-error.ts`
