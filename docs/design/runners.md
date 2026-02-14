# Runner 参考（当前实现）
> 返回 [系统设计总览](./README.md)

## Manager Runner
实现：`src/manager/runner.ts`

- 导出：`runManager`
- Prompt 组装：`buildManagerPrompt`
- Provider 路径：`runWithProvider(provider='opencode')`
- 会话连续性：持久化并复用 `plannerSessionId`；若 session 无效自动重建
- 输出：`{ output, elapsedMs, sessionId?, usage? }`

流程：
1. 基于 inputs/results/tasks/history/cron 上下文构造 manager prompt。
2. 执行 prompt 预算限制并计算 timeout。
3. 调用 OpenCode provider。
4. 若恢复 session 失败则重建新 session 重试。
5. 成功/失败都归档到 `llm/YYYY-MM-DD/*.txt`。

## Worker Runner
实现：`src/worker/profiled-runner.ts`

- `runStandardWorker` -> provider `opencode`
- `runSpecialistWorker` -> provider `codex-sdk`
- 共享核心：`runProfiledWorker`
- 输出：`{ output, elapsedMs, usage? }`

流程：
1. 构造 worker prompt。
2. 按 profile 配置执行 provider。
3. 多轮执行直到出现 `DONE` 标记或到达上限轮次。
4. 记录进度并归档最终结果。

## Provider Runtime
实现：`src/providers/registry.ts`

- 导出：`runWithProvider`
- 当前注册 provider：
  - `opencode`：`src/providers/opencode-provider.ts`
  - `codex-sdk`：`src/providers/codex-sdk-provider.ts`

不保留旧 chat-completions 运行时兼容 provider。
