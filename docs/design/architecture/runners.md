# Runner 参考（当前实现）

> 返回 [系统设计总览](../README.md)

## 文档边界

- 本文档仅描述 manager/worker/provider 的运行时装配与执行流程。
- Task/Action/Plan/Focus/Memory 的领域语义不在本文定义，统一以 `../workflow/task.md`、`../workflow/action.md`、`../workflow/plan.md`、`../workflow/focus.md`、`../workflow/memory.md` 为准。

## Manager Runner

实现：`src/policy/manager/runner.ts`

- 导出：`runManager`
- Prompt 组装：`buildManagerPromptPayload`（对外仍导出 `buildManagerPrompt` 便于纯字符串调用）
- 模板：`prompts/manager/system.md`（`nunjucks` 渲染）
- prompt 角色：顶层只定义“主 agent 编排层”的身份、action 门禁、输出协议与 packet 入口；具体执行默认委派给 worker
- `state_packet.tasks` / `state_packet.plans` 会携带稳定合同 digest，供 manager 做去重、替换、续跑与验收门禁判断；不会注入完整 worker prompt 或执行原文
- Provider：固定 `openai-responses`（direct responses）
- Provider 配置来源：`loadCodexSettings()`，优先读取 `~/.codex/config.toml` 的 active provider（`base_url`、`api_key`、`env_key`/`api_key_env`），缺省回退 `OPENAI_API_KEY` 与 `~/.codex/auth.json`
- 超时：按 prompt 字节动态计算（`60s~120s`）
- 输出：`{ output, elapsedMs, usage?, threadId?, contextPacket, promptBytes, promptSegmentCount }`

主流程：

1. 根据输入、任务、plan、历史、focus 组装 prompt、context packet 与 prompt segments。
2. 执行 token 预算与超时控制。
3. 调用 provider 接口并返回整段输出。
4. 若收到 `action_feedback`，在同批次继续修正回合。
5. 成功/失败都归档到 `traces/YYYY-MM-DD/<ts36><ra>.txt`。

## Worker Runner

实现：`src/execution/worker/profiled-runner.ts`

- 导出：`runWorker`
- Prompt 组装：`buildWorkerPrompt` -> `prompts/worker/system.md`
- Provider：固定 `codex-sdk`（外部执行运行时）
- 输出：`{ output, handoff, elapsedMs, usage?, traceRef? }`
- 上下文补充：注入当前任务 `focusId` 对应的 `focus brief`，仅作背景摘要。
- 恢复补充：若 task 带 `resumeInstruction`，只在恢复后的下一轮首个 worker prompt 注入 `<M:resume_instruction>`，不改写原 task prompt。
- 任务 prompt 过大时会外置到 `generated/worker-task-prompts/YYYY-MM-DD/{taskId}.md`；该文件保存的是外置任务说明，不是完整 worker runner prompt。
- worker 系统 prompt 本身只保留执行合同、输入优先级与 handoff 要求；最终结果通过 `worker_turn` JSON schema 收敛为 `{ reply, handoff }`。
- 异常回收：当前无 provider 级外部子进程生命周期上报

主流程：

1. 构造 worker prompt。
2. 调用 provider（外部执行运行时）执行。
3. 单次 dispatch 只执行一次 provider 调用；若输出缺失完成协议则直接报错，由上层按失败处理。
4. 每次 provider 调用都会先落 trace，再把 `.mimikit/...` 相对 `traceRef` 回传到 task result。
5. 记录进度并归档任务结果。

## Provider Runtime

实现：`src/execution/providers/registry.ts`

- 导出：`runWithProvider`
- 当前注册 provider：
  - `codex-sdk`：`src/execution/providers/codex-sdk-provider.ts`
  - `openai-responses`：`src/execution/providers/openai-responses-provider.ts`
- 共享运行时工具：`src/execution/providers/provider-runtime.ts`
- 共享错误建模：`src/execution/providers/provider-error.ts`

## Runtime Reaper

实现：`src/kernel/runtime/reaper-*.ts`

- 启动与桥接：`src/bootstrap/cli/index.ts`
- 守护进程入口：`src/kernel/runtime/reaper-daemon.ts`
- 子进程登记：`src/kernel/runtime/reaper-registry.ts`
- lease 心跳：`src/kernel/runtime/reaper-handle.ts`

机制：

1. 主进程启动时创建 reaper handle，并周期刷新 `runtime/lease.json`。
2. 若未来出现 provider 级外部子进程，启动后登记到 `runtime/children.json`。
3. 正常释放时从 children registry 注销。
4. 若主进程异常退出且 lease 过期，reaper 执行 `SIGTERM -> SIGKILL` 回收残留子进程。
