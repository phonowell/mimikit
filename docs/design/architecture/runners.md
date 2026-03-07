# Runner 参考（当前实现）

> 返回 [系统设计总览](../README.md)

## 文档边界

- 本文档仅描述 manager/worker/provider 的运行时装配与执行流程。
- Task/Action/Plan/Focus/Memory 的领域语义不在本文定义，统一以 `../workflow/task.md`、`../workflow/action.md`、`../workflow/plan.md`、`../workflow/focus.md`、`../workflow/memory.md` 为准。

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
4. 若收到 `action_feedback/query_context/read_file`，在同批次继续修正回合。
5. 成功/失败都归档到 `traces/YYYY-MM-DD/<ts36><ra>.txt`。

## Worker Runner

实现：`src/worker/profiled-runner.ts`

- 导出：`runWorker`
- Prompt 组装：`buildWorkerPrompt` -> `prompts/worker/system.md`
- Provider：按任务 `provider` 路由到 `codex-sdk` 或 `opencode-sdk`（外部执行运行时）
- 输出：`{ output, elapsedMs, usage? }`
- 上下文补充：注入当前任务 `focusId` 对应的 `focus summary/open_items`，以及可用的 `compressed summary`
- 异常回收：worker provider 会向 runtime reaper 报告外部子进程生命周期（当前覆盖 `opencode serve`）

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
  - `opencode-sdk`：`src/providers/opencode-sdk-provider.ts`
  - `openai-responses`：`src/providers/openai-responses-provider.ts`
- 共享运行时工具：`src/providers/provider-runtime.ts`
- 共享错误建模：`src/providers/provider-error.ts`

## Runtime Reaper

实现：`src/runtime/reaper-*.ts`

- 启动与桥接：`src/cli/index.ts`
- 守护进程入口：`src/runtime/reaper-daemon.ts`
- 子进程登记：`src/runtime/reaper-registry.ts`
- lease 心跳：`src/runtime/reaper-handle.ts`

机制：

1. 主进程启动时创建 reaper handle，并周期刷新 `runtime/lease.json`。
2. `opencode-sdk` 创建 server 子进程后登记到 `runtime/children.json`。
3. 正常释放时从 children registry 注销。
4. 若主进程异常退出且 lease 过期，reaper 执行 `SIGTERM -> SIGKILL` 回收残留子进程。
