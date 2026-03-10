# 夜班作业 ROI Backlog

## 维护规则

- 仅保留未完成且可执行项。
- 每条都要绑定代码入口，避免抽象口号。
- 每条都必须直接降低夜班运行成本、失败率或人工唤醒频率。
- 完成后迁移到对应设计文档，不在 backlog 堆历史。

## P0（先做）

1. `enqueue_task` 路径误伤收敛
- 目标：减少误判导致的 `action_execution_rejected`。
- 夜班收益：减少无人值守时因为守卫误判导致的作业卡死。
- 代码入口：`src/manager/action-apply-guards.ts`、`src/manager/read-file-request.ts`。
- 验收：允许 `generated/` 与 `.mimikit/generated` 产物写入的正常任务不再误拒。

## P1（本轮）

1. 长任务预算治理
- 目标：控制超长任务时延与 token 成本。
- 夜班收益：避免长作业拖垮整晚预算，并在需要继续前回到人工确认边界。
- 代码入口：`src/worker/run-retry.ts`、`src/worker/profiled-runner-loop.ts`。
- 验收：超预算任务自动降级为部分结果并请求继续确认。

2. `enqueue_task` 误拒后的替代动作提示
- 目标：误拒发生时给出可继续执行的收敛路径，而不是只返回 rejected。
- 夜班收益：减少无人值守时的空转等待与人工二次澄清。
- 代码入口：`src/manager/action-apply-guards.ts`、`src/manager/loop-batch-run-rounds.ts`。
- 验收：典型误拒场景会返回可执行替代动作或澄清模板。

3. 同类拒绝熔断强化
- 目标：阻断重复重试风暴。
- 夜班收益：避免 manager 因同类拒绝在夜间持续浪费回合与 token。
- 代码入口：`src/manager/action-feedback-collect.ts`、`src/manager/loop-batch-run-rounds.ts`。
- 验收：除当前已落地的批次内熔断外，再补动作级替代策略与更明确的拒绝分类。
