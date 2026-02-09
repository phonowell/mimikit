# Orchestrator 循环（入口）

> 返回 [系统设计总览](./README.md)

## 目的
- 该文档只保留 orchestrator 总览与分流入口。
- 角色细节以下列独立文档为准，避免重复维护：
  - `docs/design/teller-workflow.md`
  - `docs/design/thinker-workflow.md`
  - `docs/design/worker-workflow.md`

## 启动与并发循环
- 启动入口：`Orchestrator.start()`。
- 并发拉起三个循环：`tellerLoop`、`thinkerLoop`、`workerLoop`。
- 实现位置：`src/orchestrator/orchestrator.ts`。

## 通道总览（JSONP）
- `channels/user-input.jsonp`：用户输入事件。
- `channels/worker-result.jsonp`：任务结果事件。
- `channels/teller-digest.jsonp`：teller 给 thinker 的摘要事件。
- `channels/thinker-decision.jsonp`：thinker 给 teller 的决策事件。

## cursor 与持久化
- teller cursor：`channels.teller.userInputCursor` / `workerResultCursor` / `thinkerDecisionCursor`。
- thinker cursor：`channels.thinker.tellerDigestCursor`。
- 状态持久化：`runtime-state.json`（strict schema）。

## 角色分工（摘要）
- `teller`：消费输入/结果，生成 digest，并将 thinker 决策改写为用户可见回复。
- `thinker`：消费 digest，产出决策文本与任务 action（create/cancel/feedback 等）。
- `worker`：执行任务（standard/expert），发布 `worker-result`。

## 参数入口
- 配置定义：`src/config.ts`。
- 角色关键节流参数：
  - `teller.pollMs` / `teller.debounceMs`
  - `thinker.pollMs` / `thinker.minIntervalMs` / `thinker.maxResultWaitMs`
  - `worker.maxConcurrent` / `worker.retryMaxAttempts` / `worker.retryBackoffMs`
