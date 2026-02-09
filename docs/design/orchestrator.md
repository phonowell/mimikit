# Orchestrator 循环

> 返回 [系统设计总览](./README.md)

## 角色分层
- `teller`：消费用户输入与任务结果，产出去噪摘要；掌控最终用户回复语气。
- `thinker`：只做决策，不直接面向用户；消费 `teller` 摘要并产出 action 与决策文本。
- `worker`：执行层，分为 `standard`（api-runner）与 `expert`（codex-sdk）。

## 通道模型（jsonp）
- `user-input.jsonp`：用户输入事件。
- `worker-result.jsonp`：任务执行结果事件。
- `teller-digest.jsonp`：teller 生成的摘要事件。
- `thinker-decision.jsonp`：thinker 产出的决策事件。

每个通道均维护 `cursor`，消费者按 cursor 增量读取，避免重复消费。

## 循环机制
- `tellerLoop`：
  - 拉取 `user-input` 与 `worker-result`。
  - debounce 后生成 digest 并写入 `teller-digest`。
  - 消费 `thinker-decision`，通过 teller egress 生成最终 assistant 回复。
- `thinkerLoop`：
  - 按 `minIntervalMs` 节流。
  - 消费 `teller-digest`，运行 thinker（api-runner），解析 action 并写入 `thinker-decision`。
- `workerLoop`：
  - 按并发限制拉取 pending task。
  - 按 profile 路由至 standard/expert 执行器。

## 节流与成本
- thinker 只在 digest 到达且满足节流时运行。
- standard worker 支持多轮 action/respond（read_file/write_file/edit_file/exec_shell/run_browser），expert worker 保留复杂编码与重任务能力。
