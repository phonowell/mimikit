# 工程 ROI Backlog

## 维护规则

- 仅保留未完成且可执行项。
- 每条都要绑定代码入口，避免抽象口号。
- 完成后迁移到对应设计文档，不在 backlog 堆历史。

## P0（先做）

1. `query_context(history scope)` 连续无进展的降级路径
- 目标：避免直接回退为 `Service unavailable`。
- 代码入口：`src/manager/loop-batch-run-rounds.ts`、`src/manager/loop-batch-flow.ts`。
- 验收：同类场景返回可执行澄清或默认答复，不写入 `manager_end status=error`。

2. `run_task` 路径误伤收敛
- 目标：减少误判导致的 `action_execution_rejected`。
- 代码入口：`src/manager/action-apply-guards.ts`、`src/manager/read-file-request.ts`。
- 验收：允许 `generated/` 与 `.mimikit/generated` 产物写入的正常任务不再误拒。

## P1（本轮）

1. 引用语义增强（`quote_ref`）
- 目标：引用消息不只传 ID，补充摘要语义。
- 代码入口：`src/http/helpers.ts`、`src/orchestrator/core/orchestrator-runtime-ops.ts`、`src/prompts/build-prompts.ts`。
- 验收：引用场景回复优先围绕被引用内容。

2. 同类拒绝熔断
- 目标：阻断重复重试风暴。
- 代码入口：`src/manager/action-feedback-collect.ts`、`src/manager/loop-batch-run-rounds.ts`。
- 验收：同一批次内同类拒绝达到阈值后停止重复执行并给替代动作。

3. 长任务预算治理
- 目标：控制超长任务时延与 token 成本。
- 代码入口：`src/worker/run-retry.ts`、`src/worker/profiled-runner-loop.ts`。
- 验收：超预算任务自动降级为部分结果并请求继续确认。
