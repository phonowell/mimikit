# 夜班作业 ROI Backlog

## 维护规则

- 仅保留未完成且可执行项。
- 每条都要绑定代码入口，避免抽象口号。
- 每条都必须直接降低夜班运行成本、失败率或人工唤醒频率。
- 完成后迁移到对应设计文档，不在 backlog 堆历史。

## P1（剩余）

1. 预算阈值默认值调优
- 目标：用真实值守数据收敛 `worker.budget.maxDurationMs/maxRounds`。
- 夜班收益：减少不必要暂停和过晚暂停的双向波动。
- 代码入口：`src/config.ts`、`src/worker/profiled-runner-loop.ts`、`docs/design/workflow/task.md`。
- 验收：默认阈值有真实样本支撑，文档与日志字段同步更新。

2. 预算暂停后的显式 choice 恢复
- 目标：在现有 `paused + partial` 语义上补一条更顺手的确认恢复入口。
- 夜班收益：降低 operator 从部分结果切回继续执行的操作成本。
- 代码入口：`src/orchestrator/core/user-choice.ts`、`src/worker/resume-task.ts`、`webui/`。
- 验收：预算暂停后可直接从现有 choice/UI 入口恢复，无新增状态机。

3. 值守指标看板
- 目标：把预算暂停、误拒收敛、恢复继续三类信号挂到可读面板。
- 夜班收益：让 operator 能快速判断“是已完成、待恢复，还是输入不足”。
- 代码入口：`src/http/`、`webui/`、`.mimikit/log.jsonl` 读取链路。
- 验收：面板能区分正常完成、预算暂停、守卫拒绝/输入不足。
