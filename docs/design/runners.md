# Runner 参考（当前实现）

> 返回 [系统设计总览](./README.md)

## Manager Runner
实现：`src/manager/runner.ts`

- 导出：`runManager`
- Prompt 组装：`buildManagerPrompt`
- 模型调用：`runWithProvider(provider='openai-chat')`

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
- 依赖：`runWithProvider(provider='openai-chat')`、`parseStandardStep`、`executeStandardStep`

输入：
- 必填：`stateDir`、`workDir`、`task`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`abortSignal`

输出：
- `{ output, elapsedMs, usage? }`

流程：
1. 加载 checkpoint，恢复 `round/transcript/finalized/finalOutput`。
2. 循环调用 planner。
3. `final` 时返回最终文本；`actions` 时按顺序串行执行每个 action，并持续写入 transcript。
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
- 依赖：`runWithProvider(provider='codex-sdk')`

输入：
- 必填：`stateDir`、`workDir`、`task`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`abortSignal`

输出：
- `{ output, elapsedMs, usage? }`

流程：
1. 构建 worker prompt。
2. 调用 `runWithProvider(provider='codex-sdk', role='worker')`。
3. 成功时归档 `ok=true` 并返回。
4. 失败时归档 `ok=false` 并抛原始异常。

调用方：
- `src/worker/run-retry.ts`（`profile=specialist`）

## Provider Runtime
实现：`src/providers/run.ts` + `src/providers/registry.ts`

- 导出：`runWithProvider`
- 能力：统一请求入口、按 `provider` 分发、默认 provider 注册。

当前 provider：
- `openai-chat`：`src/providers/openai-chat-provider.ts`
- `codex-sdk`：`src/providers/codex-sdk-provider.ts`
- `opencode`：`src/providers/opencode-provider.ts`

## OpenAI Chat Provider
实现：`src/providers/openai-chat-provider.ts`

- 目标：通过 OpenAI-compatible `/chat/completions` 执行。
- 配置来源：`src/providers/openai-settings.ts`
- HTTP 客户端：`src/providers/openai-chat-client.ts`

## Codex SDK Provider
实现：`src/providers/codex-sdk-provider.ts`

- 目标：通过 `@openai/codex-sdk` 流式执行。
- 关键能力：thread resume、idle timeout、日志事件写入。
