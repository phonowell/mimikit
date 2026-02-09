# Teller 工作流程（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 本文描述当前 `teller` 真实执行链路（以代码实现为准）。
- 主线代码：`src/teller/loop.ts`、`src/teller/runner.ts`。
- 协作代码：`src/thinker/loop.ts`、`src/orchestrator/core/orchestrator-service.ts`、`src/streams/channels.ts`。

## teller 角色边界
- 角色定义：
  - 内部摘要：把输入压缩为 `teller-digest` 交接给 thinker。
  - 对外出话：把 thinker 决策改写成最终 assistant 回复。
- teller 不负责：任务派发、任务取消、直接消费 `worker-result`。
- 提示词来源：`prompts/agents/teller/system.md`、`prompts/agents/teller/injection.md`、`prompts/agents/teller/digest-system.md`、`prompts/agents/teller/digest-injection.md`。

## 启动与输入进入
1. `Orchestrator.start()` 并发拉起 `tellerLoop`/`thinkerLoop`/`workerLoop`。
2. 用户输入进入 `Orchestrator.addUserInput()`：
   - 写入 `channels/user-input.jsonp`（`publishUserInput`）。
   - 同时放入内存 `runtime.inflightInputs`，用于“待回复输入”追踪。

## tellerLoop 每轮执行顺序
位于 `src/teller/loop.ts`，循环直到 `runtime.stopped=true`。

### 1) 消费用户输入
- 从 `channels/user-input.jsonp` 按 `channels.teller.userInputCursor` 增量读取（`limit=100`）。
- 新输入追加到 `buffer.inputs`。
- 每消费一条包，更新 `runtime.channels.teller.userInputCursor`。
- 若本轮读到新输入，更新 `buffer.lastInputAt=now`。

### 2) 消费 thinker 决策并产出用户回复
- 从 `channels/thinker-decision.jsonp` 按 `channels.teller.thinkerDecisionCursor` 增量读取（`limit=20`）。
- 每个 decision 包执行：
  - 调 `formatDecisionForUser()` 生成最终用户文本。
  - 以 `assistant` 角色追加到 `history.jsonl`。
  - 更新 `runtime.channels.teller.thinkerDecisionCursor`。
- 本批处理完后，按 `decision.inputIds` 清理：
  - `runtime.inflightInputs` 中对应输入移除。
  - `buffer.inputs` 中对应输入移除（避免重复进入后续 digest）。

### 3) 判断是否触发 digest
- 条件：`hasInputs && (now - lastInputAt >= config.teller.debounceMs)`。
- 命中后：
  - 读取 `history`。
  - 执行 `runTellerDigest()` 生成 `TellerDigest`。
  - 发布到 `channels/teller-digest.jsonp`（`publishTellerDigest`）。
  - 清空 `buffer`（inputs/时间戳归零）。

### 4) 运行时 prune
- `tellerLoop` 在“决策消费后”与“digest 发布后”触发 prune。
- 裁剪通道：
  - `channels/user-input.jsonp`
  - `channels/thinker-decision.jsonp`
- 阈值：按已消费 cursor 与 `channels.keepRecentPackets` 计算 `keepFromCursor`。
- 开关：`channels.pruneEnabled`。

### 5) 轮询等待
- 每轮末尾 `sleep(config.teller.pollMs)`。

## runTellerDigest 细节
实现：`src/teller/runner.ts`。

- Prompt 构建：`buildTellerDigestPrompt()`。
  - system: `prompts/agents/teller/digest-system.md`
  - injection: `prompts/agents/teller/digest-injection.md`
  - 注入：`inputs` + `tasks` + `history`
- 调用模型：`runApiRunner()`。
- 输出解析：`extractDigestSummary()` 识别 `@digest_context` / `@handoff_context` 的 `summary`。
- 失败/空摘要兜底：
  - 优先最新 `input.text`
  - 否则固定文案
- 返回结构（`TellerDigest`）：`digestId`、`summary`、`inputs`、`taskSummary`。

## formatDecisionForUser 细节
实现：`src/teller/runner.ts`。

- Prompt 注入：`environment` + `inputs` + `tasks` + `history` + `thinker_decision`。
- 调用模型：`runApiRunner()`。
- 异常或空文本兜底：`decision` 原文 → 对应输入 → 固定“收到（timestamp）”。

## 状态与落盘
- teller cursor：`channels.teller.userInputCursor`、`channels.teller.thinkerDecisionCursor`。
- thinker cursor：`channels.thinker.tellerDigestCursor`、`channels.thinker.workerResultCursor`。
- cursor 持久化：`runtime-state.json`（strict schema）。
- 通道文件：`channels/user-input.jsonp`、`channels/worker-result.jsonp`、`channels/teller-digest.jsonp`、`channels/thinker-decision.jsonp`。
- 用户可见回复落盘：`history.jsonl`（role=`assistant`）。

## 默认时序参数（影响 teller）
来源：`src/config.ts`。

- `teller.pollMs = 1000`
- `teller.debounceMs = 10000`
- `channels.pruneEnabled = true`
- `channels.keepRecentPackets = 200`
