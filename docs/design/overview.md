# 系统概览（v5）

> 返回 [系统设计总览](./README.md)

## 目标
- 降低长会话噪音对决策的干扰。
- 把“对话理解/回复”与“决策/调度”解耦。
- 通过 worker 分层平衡成本与能力。
- 输出可追踪的每日报告，支持运行观测。

## 架构
- `teller`：
  - 输入：用户输入 + 任务状态摘要 + 历史。
  - 输出：`teller-digest`、最终 assistant 回复。
- `thinker`：
  - 输入：`teller-digest` + 任务结果。
  - 输出：任务 action + `thinker-decision`。
- `worker`：
  - `standard`：api-runner，多步执行，支持内部 action（read_file/write_file/edit_file/exec_shell/run_browser）。
  - `expert`：codex-sdk，昂贵、能力强。
- `reporting`：
  - 输入：thinker/worker 运行事件。
  - 输出：`events.jsonl` 与 `reports/daily/*.md`。

## 数据流
1. 用户输入写入 `user-input.jsonp`。
2. teller 消费输入/结果并产出摘要到 `teller-digest.jsonp`。
3. thinker 节流消费摘要，产出决策到 `thinker-decision.jsonp`。
4. teller 消费决策并生成最终用户可见回复。
5. worker 执行结果写入 `worker-result.jsonp`。
6. reporting 事件写入 `reporting/events.jsonl` 并按天生成日报。

## 关键策略
- thinker 通过 `minIntervalMs` 节流，优先省费。
- teller 始终掌控最终语气，thinker 不直接对话。
- 通道消费采用 cursor，避免重复处理。
- 报告系统只做观测，不做自动代码改写。
