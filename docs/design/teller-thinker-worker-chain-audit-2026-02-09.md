# teller-thinker-worker 链路审计（2026-02-09）

> 返回 [系统设计总览](./README.md)

## 范围
- 审计目标：`teller <-> thinker <-> worker` 通信链路。
- 审计维度：通信方式、内部方法、落盘文件、命名一致性、相似流程合并。

## 入口与调度
- 入口：`src/cli.ts` 创建 `Orchestrator` 并 `start()`。
- 调度：`src/orchestrator/orchestrator.ts` 并行启动 `tellerLoop`、`thinkerLoop`、`workerLoop`。

## 通信链路
- `user -> teller`：`publishUserInput` / `consumeUserInputs`。
- `worker -> teller`：`publishWorkerResult` / `consumeWorkerResults`。
- `teller -> thinker`：`publishTellerDigest` / `consumeTellerDigests`。
- `thinker -> teller`：`publishThinkerDecision` / `consumeThinkerDecisions`。
- `thinker -> worker`：通过命令解析与任务队列（`parseCommands` + `processThinkerCommands` + `enqueueTask`）。
- `worker -> thinker`：间接通过 `worker-result` 被 teller 汇总后传入 thinker digest。

## 通信方式与关键方法
- 文件通道（JSONP）：`src/streams/channels.ts` + `src/streams/jsonp-channel.ts`。
- 内存通道：
  - `runtime.inflightInputs`（用户输入待回复集合）。
  - `runtime.tasks`（thinker 入队，worker 调度）。
- 命令通道：`src/orchestrator/command-parser.ts`、`src/orchestrator/thinker-commands.ts`。

## 落盘文件
- 主状态：`history.jsonl`、`log.jsonl`、`runtime-state.json`。
- 通道：`channels/user-input.jsonp`、`channels/worker-result.jsonp`、`channels/teller-digest.jsonp`、`channels/thinker-decision.jsonp`。
- worker 过程：`task-progress/{taskId}.jsonl`、`task-checkpoints/{taskId}.json`。
- 结果归档：`tasks/{yyyy-mm-dd}/*.md`、`llm/{yyyy-mm-dd}/*.txt`。

## 本轮已落地优化
- 命名统一：`worker/expert-runner` 新增主导出 `runExpertWorker`，并保留兼容别名 `runWorker`。
- 调用统一：`orchestrator/worker-run-retry` 与 `evolve/code-evolve` 改为显式调用 `runExpertWorker`。
- 归档合并：新增 `appendLlmArchiveResult`，复用 thinker/worker 的归档写入模板。
- 流程合并：`teller-loop` 抽出 `appendPacketsToBuffer`，统一 input/result 包消费逻辑。

## 当前命名一致性评估
- `publish*/consume*` 通道命名一致。
- `runThinker` / `runTellerDigest` / `runStandardWorker` / `runExpertWorker` 角色命名已趋于一致。
- `runtime.channels` cursor 已统一为分组命名：`channels.teller.*` + `channels.thinker.*`。

## 方法级时序表（可审核）
| 步骤 | 调用方 | 方法 | 输出/副作用 | 落盘文件 |
|---|---|---|---|---|
| 1 | `Orchestrator.addUserInput` | `publishUserInput` | 写入用户输入事件 | `channels/user-input.jsonp` |
| 2 | `tellerLoop` | `consumeUserInputs` | 拉取新输入并推进 `channels.teller.userInputCursor` | 读取 `channels/user-input.jsonp` |
| 3 | `workerLoop -> runTask` | `finalizeResult -> publishWorkerResult` | 产出任务结果事件 | `channels/worker-result.jsonp` |
| 4 | `tellerLoop` | `consumeWorkerResults` | 拉取新结果并推进 `channels.teller.workerResultCursor` | 读取 `channels/worker-result.jsonp` |
| 5 | `tellerLoop` | `runTellerDigest` | 生成 digest（含 summary/tasks/results） | 无直接文件写入 |
| 6 | `tellerLoop` | `publishTellerDigest` | 发布 digest 给 thinker | `channels/teller-digest.jsonp` |
| 7 | `thinkerLoop` | `consumeTellerDigests` | 拉取 digest 并推进 `channels.thinker.tellerDigestCursor` | 读取 `channels/teller-digest.jsonp` |
| 8 | `thinkerCycle` | `runThinker` | 产出 thinker 原始输出（commands + text） | `llm/{date}/*.txt` |
| 9 | `thinkerCycle` | `parseCommands` + `processThinkerCommands` | 入队/取消任务、反馈收集 | `runtime-state.json`（间接持久化） |
| 10 | `thinkerCycle` | `appendConsumedInputsToHistory` | 已消费输入写入历史 | `history.jsonl` |
| 11 | `thinkerCycle` | `appendConsumedResultsToHistory` | 已消费结果写入历史并更新 task.result 摘要 | `history.jsonl` |
| 12 | `thinkerCycle` | `publishThinkerDecision` | 发布决策给 teller | `channels/thinker-decision.jsonp` |
| 13 | `tellerLoop` | `consumeThinkerDecisions` | 拉取决策并推进 `channels.teller.thinkerDecisionCursor` | 读取 `channels/thinker-decision.jsonp` |
| 14 | `tellerLoop` | `formatDecisionForUser` | 生成面向用户文本 | 无直接文件写入 |
| 15 | `tellerLoop` | `appendHistory` | 写 assistant 回复并清理 inflight inputs | `history.jsonl` |

## 关键持久化节点
- 通道 cursor 与任务快照：`persistRuntimeState -> saveRuntimeSnapshot`。
- worker 标准模式过程：`appendTaskProgress` 与 `saveTaskCheckpoint`。
- LLM 归档统一入口：`appendLlmArchiveResult -> appendLlmArchive`。

## 下一步（已确认继续）
- 第二轮 cursor 命名统一已完成，后续可选项是把 channel 读写封装成“角色级 gateway”进一步减少 loop 侧样板代码。
