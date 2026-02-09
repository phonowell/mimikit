# Thinker 工作流程（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 本文描述当前 `thinker` 真实执行链路（以代码实现为准）。
- 主线代码：`src/orchestrator/roles/thinker/thinker-loop.ts`、`src/orchestrator/roles/thinker/thinker-cycle.ts`、`src/thinker/runner.ts`。
- 协作代码：`src/orchestrator/roles/thinker/thinker-action-apply.ts`、`src/orchestrator/roles/teller/teller-history.ts`、`src/streams/channels.ts`。

## thinker 角色边界
- 角色定义：直接消费 `worker-result` 与 `teller-digest`，输出“决策文本 + 任务 action”。
- 输出通道：`channels/thinker-decision.jsonp`。
- thinker 不负责：直接面向用户出话（最终话术由 teller 负责）。

## 启动与输入进入
1. `Orchestrator.start()` 并发拉起 `thinkerLoop`。
2. `thinkerLoop` 每轮先读 `worker-result`，再读 `teller-digest`。

## thinkerLoop 每轮执行顺序
位于 `src/orchestrator/roles/thinker/thinker-loop.ts`，循环直到 `runtime.stopped=true`。

### 1) 拉取 worker-result
- 按 `channels.thinker.workerResultCursor` 增量读取 `worker-result`（`limit=100`）。
- 结果进入本地缓冲 `bufferedResults`，并推进 cursor。
- 首次收到结果时记录 `firstResultAt`。

### 2) 节流检查
- 若 `now - runtime.lastThinkerRunAt < config.thinker.minIntervalMs`，本轮跳过并 `sleep(config.thinker.pollMs)`。

### 3) 拉取 digest
- 按 `channels.thinker.tellerDigestCursor` 增量读取 `teller-digest`（`limit=1`）。
- 若无 digest 且结果缓冲未到阈值（`thinker.maxResultWaitMs`），则 sleep。

### 4) 触发运行
- 若读到 digest：
  - 推进 `tellerDigestCursor`。
  - 合并 `bufferedResults` 与 `digest.results`。
  - 调 `runThinkerCycle()`。
- 若未读到 digest 但结果缓冲到阈值：
  - 构造“结果触发”临时 digest（无 inputs，仅 results）。
  - 调 `runThinkerCycle()`。

### 5) 清理与 prune
- 每次 thinker 运行后清空 `bufferedResults` 并重置 `firstResultAt`。
- 在结果消费后与运行后触发 prune：
  - `channels/worker-result.jsonp`
  - `channels/teller-digest.jsonp`

## runThinkerCycle 细节
实现：`src/orchestrator/roles/thinker/thinker-cycle.ts`。

- 输入：`digest.inputs` + `digest.results` + 任务/历史窗口。
- 调用：`runThinker()`，解析 `actions + text`。
- 落地：
  - 先写入已消费输入/结果历史（`appendConsumed*ToHistory`）。
  - 再执行 action（create/cancel/capture_feedback）。
  - 发布 `thinker-decision`。
- 收尾：记录日志，持久化 `runtime-state.json`。
- 错误路径：补写未落地输入/结果 + 发布兜底 decision。

## 状态与落盘
- thinker cursor：`channels.thinker.tellerDigestCursor`、`channels.thinker.workerResultCursor`。
- teller cursor：`channels.teller.userInputCursor`、`channels.teller.thinkerDecisionCursor`。
- 决策落盘：`channels/thinker-decision.jsonp`。
- 消费后写历史：`history.jsonl`。
- 日志：`log.jsonl`（`thinker_start` / `thinker_end`）。

## 默认时序参数（影响 thinker）
来源：`src/config.ts`。

- `thinker.pollMs = 2000`
- `thinker.minIntervalMs = 15000`
- `thinker.maxResultWaitMs = 20000`
