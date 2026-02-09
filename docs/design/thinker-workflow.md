# Thinker 工作流程（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 本文描述当前 `thinker` 真实执行链路（以代码实现为准）。
- 主线代码：`src/orchestrator/thinker-cycle.ts`、`src/thinker/runner.ts`。
- 协作代码：`src/orchestrator/action-intents.ts`、`src/orchestrator/teller-history.ts`、`src/streams/channels.ts`。

## thinker 角色边界
- 角色定义：消费 `teller-digest`，输出“决策文本 + 任务 action”。
- 输出通道：`channels/thinker-decision.jsonp`。
- thinker 不负责：直接面向用户出话（最终话术由 teller 负责）。
- 提示词来源：`prompts/agents/thinker/system.md`、`prompts/agents/thinker/injection.md`。

## 启动与输入进入
1. `Orchestrator.start()` 并发拉起 `thinkerLoop`。
2. `thinkerLoop` 仅消费 `channels/teller-digest.jsonp`（不直接消费 `worker-result`）。

## thinkerLoop 每轮执行顺序
位于 `src/orchestrator/thinker-cycle.ts`，循环直到 `runtime.stopped=true`。

### 1) 节流检查
- 若 `now - runtime.lastThinkerRunAt < config.thinker.minIntervalMs`，本轮跳过并 `sleep(config.thinker.pollMs)`。

### 2) 拉取 digest
- 按 `channels.thinker.tellerDigestCursor` 增量读取 `teller-digest`（`limit=1`）。
- 若无新 digest，则 `sleep(config.thinker.pollMs)`。
- 若有 digest，先推进 `runtime.channels.thinker.tellerDigestCursor`，再执行 `runThinkerCycle()`。

## runThinkerCycle 细节
实现：`src/orchestrator/thinker-cycle.ts`。

### 1) 构建上下文窗口
- 读取 `history.jsonl`，按字节/条数窗口裁剪最近历史。
- 从 `runtime.tasks` 选择最近任务窗口。
- 进入运行态：`runtime.thinkerRunning=true`，并记录 `runtime.lastThinkerRunAt`。

### 2) 运行 thinker 模型
- 调 `runThinker()`，输入包括：
  - digest 携带的 `inputs`、`results`
  - 裁剪后的 `tasks`、`history`
  - `env.tellerDigestSummary` 与 `env.taskSummary`
- `runThinker()` 内部：
  - 构建 prompt（`buildThinkerPrompt`）
  - 主模型调用失败时，可切到 fallback model
  - 每次主/备调用结果都写入 llm archive

### 3) 解析输出并落地副作用
- `parseActions(result.output)` 拆成：
  - `parsed.text`（给 teller 的决策草案）
  - `parsed.actions`（任务 action）
- `collectTaskResultSummaries()` 提取 `summarize_task_result` 映射。
- 先把 digest 内输入/结果写入历史：
  - `appendConsumedInputsToHistory()`
  - `appendConsumedResultsToHistory()`
- 再执行 action：`applyTaskActions()`
  - `create_task`：入队任务（含去重）
  - `cancel_task`：取消任务
  - `capture_feedback`：写结构化反馈
- 发布 thinker 决策：`publishThinkerDecision()`，载荷包含 `decision`、`inputIds`、`taskSummary`。

### 4) 错误路径
- 错误时仍尽力把未落地的 inputs/results 补写历史。
- 写入 thinker_error 反馈。
- 发布兜底决策（固定文案），避免 teller 链路断流。

### 5) 结束收尾
- 记录 `thinker_end` 日志（成功/失败）。
- `persistRuntimeState(runtime)` 持久化任务与 cursor。
- 退出运行态：`runtime.thinkerRunning=false`。

## thinker 与 teller/worker 的耦合点
- `teller -> thinker`：`publishTellerDigest`。
- `thinker -> teller`：`publishThinkerDecision`（由 teller 改写为用户可见文本）。
- `thinker -> worker`：通过 action 入队/取消任务。
- `worker -> thinker`：当前为间接链路（worker 结果先由 teller 汇总进 digest）。

## 状态与落盘
- thinker cursor：`channels.thinker.tellerDigestCursor`（持久化到 `runtime-state.json`）。
- 决策落盘：`channels/thinker-decision.jsonp`。
- digest 消费后写历史：`history.jsonl`（用户输入与任务系统消息）。
- 日志：`log.jsonl`（`thinker_start` / `thinker_end`）。
- llm 归档：`llm/YYYY-MM-DD/*.txt`（主调用与 fallback 调用均归档）。

## 默认时序参数（影响 thinker）
来源：`src/config.ts`。

- `thinker.pollMs = 2000`
- `thinker.minIntervalMs = 15000`
- `thinker.maxResultWaitMs = 20000`（由 teller 侧用于“仅结果触发 digest”）
- `thinker` 默认模型：`gpt-5.2-high`
