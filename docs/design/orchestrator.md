# Orchestrator 循环（入口）

> 返回 [系统设计总览](./README.md)

## 目的
- 本文只保留 orchestrator 总览与分流入口。
- 角色细节见：`docs/design/teller-workflow.md`、`docs/design/thinker-workflow.md`、`docs/design/worker-workflow.md`。

## 启动与并发循环
- 启动入口：`Orchestrator.start()`。
- 并发拉起：`tellerLoop`、`thinkerLoop`、`workerLoop`。
- 实现位置：`src/orchestrator/core/orchestrator-service.ts`。

## 通道总览（JSONP）
- `channels/user-input.jsonp`：用户输入事件。
- `channels/worker-result.jsonp`：任务结果事件（thinker 直连消费）。
- `channels/teller-digest.jsonp`：teller 给 thinker 的摘要事件。
- `channels/thinker-decision.jsonp`：thinker 给 teller 的决策事件。

## cursor 与持久化
- teller cursor：`channels.teller.userInputCursor` / `channels.teller.thinkerDecisionCursor`。
- thinker cursor：`channels.thinker.tellerDigestCursor` / `channels.thinker.workerResultCursor`。
- 状态持久化：`runtime-state.json`（strict schema）。

## 角色分工（摘要）
- `teller`：消费输入与 thinker 决策，生成 digest，产出用户可见回复。
- `thinker`：消费 digest + worker 结果，产出决策文本与任务 action。
- `worker`：执行任务（standard/expert），发布 `worker-result`。

## 参数入口
- 配置定义：`src/config.ts`。
- 关键节流参数：
  - `teller.pollMs` / `teller.debounceMs`
  - `thinker.pollMs` / `thinker.minIntervalMs` / `thinker.maxResultWaitMs`
  - `channels.pruneEnabled` / `channels.keepRecentPackets`
  - `worker.maxConcurrent` / `worker.retryMaxAttempts` / `worker.retryBackoffMs`
