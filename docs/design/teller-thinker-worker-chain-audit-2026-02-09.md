# teller-thinker-worker 链路审计（2026-02-09）

## 结论
- 主链路为 `teller -> thinker -> worker`，执行调用路径已统一。
- `worker-run-retry` 显式调用 `runExpertWorker`（expert profile）。
- 历史 `evolve/code-evolve` 相关链路已下线，系统改为 reporting 每日报告模式。

## 关注点
- thinker 只产出 action/decision，不直接执行任务。
- worker 负责执行与结果回写，reporting 负责事件归档与日报。

## 范围
- 审计目标：`teller <-> thinker <-> worker` 通信链路。
- 审计维度：通信方式、内部方法、落盘文件、命名一致性、相似流程合并。

## 入口与调度
- 入口：`src/cli/index.ts` 创建 `Orchestrator` 并 `start()`。
- 调度：`src/orchestrator/core/orchestrator-service.ts` 并行启动 `tellerLoop`、`thinkerLoop`、`workerLoop`。

## 当前通信链路（2026-02-09 同步后）
- `user -> teller`：`publishUserInput` / `consumeUserInputs`。
- `worker -> thinker`：`publishWorkerResult` / `consumeWorkerResults`（直连）。
- `teller -> thinker`：`publishTellerDigest` / `consumeTellerDigests`。
- `thinker -> teller`：`publishThinkerDecision` / `consumeThinkerDecisions`。
- `thinker -> worker`：`parseActions` + `applyTaskActions` + `enqueueTask` + `enqueueWorkerTask`。

## 通道与运行时 prune
- 文件通道（JSONP）：`src/streams/channels.ts` + `src/streams/jsonp-channel.ts`。
- 运行时 prune 已接入：
  - teller 侧：`user-input`、`thinker-decision`
  - thinker 侧：`worker-result`、`teller-digest`
- prune 策略：按已消费 cursor 与 `channels.keepRecentPackets` 计算 `keepFromCursor`。

## 落盘文件
- 主状态：`history.jsonl`、`log.jsonl`、`runtime-state.json`。
- 通道：`channels/user-input.jsonp`、`channels/worker-result.jsonp`、`channels/teller-digest.jsonp`、`channels/thinker-decision.jsonp`。
- worker 过程：`task-progress/{taskId}.jsonl`、`task-checkpoints/{taskId}.json`。
- 结果归档：`tasks/{yyyy-mm-dd}/*.md`、`llm/{yyyy-mm-dd}/*.txt`。
- reporting：`reporting/events.jsonl`、`reports/daily/{yyyy-mm-dd}.md`。

## cursor 命名现状
- teller：`channels.teller.userInputCursor`、`channels.teller.thinkerDecisionCursor`。
- thinker：`channels.thinker.tellerDigestCursor`、`channels.thinker.workerResultCursor`。
- 仅接受当前新结构，不再保留兼容映射。

## 方法级时序表（可审核）
| 步骤 | 调用方 | 方法 | 输出/副作用 | 落盘文件 |
|---|---|---|---|---|
| 1 | `Orchestrator.addUserInput` | `publishUserInput` | 写入用户输入事件 | `channels/user-input.jsonp` |
| 2 | `tellerLoop` | `consumeUserInputs` | 拉取新输入并推进 `channels.teller.userInputCursor` | 读取 `channels/user-input.jsonp` |
| 3 | `thinkerLoop` | `consumeWorkerResults` | 拉取新结果并推进 `channels.thinker.workerResultCursor` | 读取 `channels/worker-result.jsonp` |
| 4 | `tellerLoop` | `runTellerDigest` + `publishTellerDigest` | 输入摘要交接 thinker | `channels/teller-digest.jsonp` |
| 5 | `thinkerLoop` | `consumeTellerDigests` | 拉取 digest 并推进 `channels.thinker.tellerDigestCursor` | 读取 `channels/teller-digest.jsonp` |
| 6 | `thinkerCycle` | `runThinker` + `parseActions` + `applyTaskActions` | 生成决策与任务动作 | `llm/{date}/*.txt` + `runtime-state.json` |
| 7 | `thinkerCycle` | `publishThinkerDecision` | 发布决策给 teller | `channels/thinker-decision.jsonp` |
| 8 | `tellerLoop` | `consumeThinkerDecisions` + `formatDecisionForUser` + `appendHistory` | 写 assistant 回复并清理 inflight inputs | `history.jsonl` |

## 关键持久化节点
- 通道 cursor 与任务快照：`persistRuntimeState -> saveRuntimeSnapshot`。
- worker 标准模式过程：`appendTaskProgress` 与 `saveTaskCheckpoint`。
- LLM 归档统一入口：`appendLlmArchiveResult -> appendLlmArchive`。
