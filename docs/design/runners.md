# Runner 参考（当前实现）

> 返回 [系统设计总览](./README.md)

## Manager Runner
实现：`src/manager/runner.ts`

- 导出：`runManager`
- Prompt 组装：`buildManagerPrompt`
- 模型调用：`runApiRunner`

输入：
- 必填：`stateDir`、`workDir`、`inputs`、`results`、`tasks`、`history`、`timeoutMs`
- 可选：`env`、`model`、`modelReasoningEffort`、`seed`、`temperature`、`fallbackModel`

输出：
- `{ output, elapsedMs, fallbackUsed, usage? }`

流程：
1. 构建 manager prompt。
2. 调用 primary model。
3. 归档 primary 结果。
4. primary 失败且有 fallback 时降级重试。
5. fallback 成功时 `fallbackUsed=true`。
6. fallback 失败则抛错。

归档与去重：
- role 固定 `manager`。
- `attempt=primary|fallback`。
- `requestKey` 由 prompt/model/sampling 参数稳定生成。

关键环境变量：
- `MIMIKIT_MANAGER_MODEL`
- `MIMIKIT_MANAGER_REASONING_EFFORT`
- `MIMIKIT_FALLBACK_MODEL`

## Worker Standard Runner
实现：`src/worker/standard-runner.ts`

- 导出：`runStandardWorker`
- 依赖：`runApiRunner`、`parseStandardStep`、`executeStandardStep`

输入：
- 必填：`stateDir`、`workDir`、`taskId`、`prompt`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`abortSignal`

输出：
- `{ output, elapsedMs, usage? }`

流程：
1. 加载 checkpoint，恢复 `round/transcript/finalized/finalOutput`。
2. 循环调用 planner。
3. `final` 时返回最终文本；`action` 时执行动作并写入 transcript。
4. 每轮写 `task-progress`，关键节点写 `task-checkpoint`。
5. 汇总 usage 返回。

错误语义：
- 可能抛错：`standard_aborted`、`standard_timeout`、`standard_max_rounds_exceeded`、`standard_step_parse_failed:*`。
- 错误上抛给 `runTaskWithRetry` 收敛。

调用方：
- `src/worker/run-retry.ts`（`profile=standard`）

## Worker Specialist Runner
实现：`src/worker/specialist-runner.ts`

- 导出：`runSpecialistWorker`
- 依赖：`runCodexSdk`

输入：
- 必填：`stateDir`、`workDir`、`task`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`abortSignal`

输出：
- `{ output, elapsedMs, usage? }`

流程：
1. 构建 worker prompt。
2. 调用 `runCodexSdk(role='worker')`。
3. 成功时归档 `ok=true` 并返回。
4. 失败时归档 `ok=false` 并抛原始异常。

调用方：
- `src/worker/run-retry.ts`（`profile=specialist`）

## API Runner
实现：`src/llm/api-runner.ts`

- 导出：`runApiRunner`
- 目标：通过 HTTP 调用 OpenAI Chat Completions

输入：
- `prompt`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`seed`、`temperature`

输出：
- `{ output, elapsedMs, usage? }`

流程：
1. 读取 codex settings。
2. 解析最终模型 `resolveOpenAiModel()`。
3. 建立 `AbortController` 超时控制。
4. 调用 `/chat/completions`。
5. 解析输出文本与 usage。
6. 失败时抛错，不做内部 fallback。

调用方：
- `src/manager/runner.ts`
- `src/worker/standard-runner.ts`

## SDK Runner
实现：`src/llm/sdk-runner.ts`

- 导出：`runCodexSdk`
- 目标：通过 `@openai/codex-sdk` 流式执行

输入：
- 必填：`role(manager|worker)`、`prompt`、`workDir`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`threadId`、`outputSchema`、`logPath`、`logContext`、`abortSignal`

输出：
- `{ output, elapsedMs, usage?, threadId? }`

流程：
1. 按 role 决定 sandbox（`worker=danger-full-access`，`manager=read-only`）。
2. 启动或恢复 thread。
3. `runStreamed` 消费事件流并聚合输出/usage。
4. 失败事件抛错。
5. 写调用日志后返回。

调用方：
- `src/worker/specialist-runner.ts`

## Local Runner
实现：`src/llm/local-runner.ts`

- 导出：`runLocalRunner`
- 目标：调用本地兼容 `/chat/completions` 服务

输入：
- `prompt`、`model`、`baseUrl`、`timeoutMs`

输出：
- `{ output, elapsedMs, usage? }`

流程：
1. 建立超时控制。
2. 请求本地 `/chat/completions`。
3. 解析输出文本与 usage。
4. 失败抛错并清理 timer。

当前调用情况：
- 当前仓库未作为运行时主链路调用。
