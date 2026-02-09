# Teller 工作流程（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 本文描述当前 `teller` 真实执行链路（以代码实现为准）。
- 主线代码：`src/orchestrator/teller-loop.ts`、`src/teller/runner.ts`。
- 协作代码：`src/orchestrator/thinker-cycle.ts`、`src/orchestrator/orchestrator.ts`、`src/streams/channels.ts`。

## teller 角色边界
- 角色定义：
  - 内部摘要：把输入/结果压缩为 `teller-digest` 交接给 thinker。
  - 对外出话：把 thinker 决策改写成最终 assistant 回复。
- teller 不负责：任务派发、任务取消、直接生成任务 action。
- 提示词来源：`prompts/agents/teller/system.md`、`prompts/agents/teller/injection.md`、`prompts/agents/teller/digest-system.md`、`prompts/agents/teller/digest-injection.md`。

## 启动与输入进入
1. `Orchestrator.start()` 并发拉起 `tellerLoop`/`thinkerLoop`/`workerLoop`。
2. 用户输入进入 `Orchestrator.addUserInput()`：
   - 写入 `channels/user-input.jsonp`（`publishUserInput`）。
   - 同时放入内存 `runtime.inflightInputs`，用于“待回复输入”追踪。

## tellerLoop 每轮执行顺序
位于 `src/orchestrator/teller-loop.ts`，循环直到 `runtime.stopped=true`。

### 1) 消费用户输入
- 从 `channels/user-input.jsonp` 按 `channels.teller.userInputCursor` 增量读取（`limit=100`）。
- 新输入追加到 `buffer.inputs`。
- 每消费一条包，更新 `runtime.channels.teller.userInputCursor`。
- 若本轮读到新输入，更新 `buffer.lastInputAt=now`。

### 2) 消费 worker 结果
- 从 `channels/worker-result.jsonp` 按 `channels.teller.workerResultCursor` 增量读取（`limit=100`）。
- 新结果追加到 `buffer.results`。
- 每消费一条包，更新 `runtime.channels.teller.workerResultCursor`。
- 若本轮首次收到结果，设置 `buffer.firstResultAt=now`。

### 3) 消费 thinker 决策并产出用户回复
- 从 `channels/thinker-decision.jsonp` 按 `channels.teller.thinkerDecisionCursor` 增量读取（`limit=20`）。
- 每个 decision 包执行：
  - 调 `formatDecisionForUser()` 生成最终用户文本。
  - 以 `assistant` 角色追加到 `history.jsonl`。
  - 更新 `runtime.channels.teller.thinkerDecisionCursor`。
- 本批处理完后，按 `decision.inputIds` 清理：
  - `runtime.inflightInputs` 中对应输入移除。
  - `buffer.inputs` 中对应输入移除（避免重复进入后续 digest）。

### 4) 判断是否触发 digest
- 条件一（输入防抖）：
  - `hasInputs && (now - lastInputAt >= config.teller.debounceMs)`。
- 条件二（仅结果兜底）：
  - `hasResults && !hasInputs && (now - firstResultAt >= config.thinker.maxResultWaitMs)`。
- 命中任一条件且缓冲非空时：
  - 读取 `history`。
  - 执行 `runTellerDigest()` 生成 `TellerDigest`。
  - 发布到 `channels/teller-digest.jsonp`（`publishTellerDigest`）。
  - 清空 `buffer`（inputs/results/时间戳全部归零）。

### 5) 轮询等待
- 每轮末尾 `sleep(config.teller.pollMs)`。

## runTellerDigest 细节
实现：`src/teller/runner.ts`。

- Prompt 构建：`buildTellerDigestPrompt()`。
  - system: `prompts/agents/teller/digest-system.md`
  - injection: `prompts/agents/teller/digest-injection.md`
  - 注入：`inputs` + `tasks(含本批results)` + `history`
- 调用模型：`runApiRunner()`。
- 输出解析：`extractDigestSummary()` 仅识别 `@digest_context` / `@handoff_context` 的 `summary`。
- 失败/空摘要兜底：
  - 优先最新 `input.text`
  - 次选最新 `result.output` 前 300 字
  - 最后固定文案
- 返回结构（`TellerDigest`）：
  - `digestId`
  - `summary`
  - `inputs`（本批）
  - `results`（本批）
  - `taskSummary`（全局任务状态摘要）

## formatDecisionForUser 细节
实现：`src/teller/runner.ts`。

- Prompt 构建：`buildTellerPrompt()`。
  - system: `prompts/agents/teller/system.md`
  - injection: `prompts/agents/teller/injection.md`
  - 注入：`environment` + `inputs` + `tasks` + `history` + `thinker_decision`
- 调用模型：`runApiRunner()`。
- 正常返回：`response.output.trim()`；若非空直接作为用户可见文本。
- 异常/空文本兜底：
  - 优先 `decision` 原文
  - 次选 `inputIds` 对应的最新输入
  - 最后固定“收到（timestamp）”文案

## teller 与 thinker/worker 的耦合点
- `worker -> teller`：`publishWorkerResult`，被 teller 聚合进 `buffer.results`。
- `teller -> thinker`：`publishTellerDigest`。
- `thinker -> teller`：`publishThinkerDecision`，其中 `inputIds` 驱动 teller 清理 inflight。
- thinker 消费侧：`thinkerLoop` 每次只取 1 个 digest（`limit=1`），并受 `minIntervalMs` 节流。

## 状态与落盘
- teller 相关 cursor：
  - `channels.teller.userInputCursor`
  - `channels.teller.workerResultCursor`
  - `channels.teller.thinkerDecisionCursor`
- thinker digest cursor：`channels.thinker.tellerDigestCursor`。
- cursor 持久化于 `runtime-state.json`（strict schema）。
- 通道文件：
  - `channels/user-input.jsonp`
  - `channels/worker-result.jsonp`
  - `channels/teller-digest.jsonp`
  - `channels/thinker-decision.jsonp`
- 用户可见回复落盘：`history.jsonl`（role=`assistant`）。

## 默认时序参数（影响 teller）
来源：`src/config.ts`。

- `teller.pollMs = 1000`
- `teller.debounceMs = 10000`
- `thinker.maxResultWaitMs = 20000`（teller 仅结果触发阈值）
- `thinker.minIntervalMs = 15000`（影响 digest 被 thinker 消费节奏）
