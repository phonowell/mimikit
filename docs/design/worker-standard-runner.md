# Worker Standard Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/worker/standard-runner.ts`。
- 导出函数：`runStandardWorker`。
- 依赖：`runApiRunner`、`parseStandardStep`、`executeStandardStep`、checkpoint/progress 存储。

## 输入与输出
### 输入
- `stateDir`、`workDir`、`taskId`、`prompt`、`timeoutMs`。
- 可选 `model`、`modelReasoningEffort`、`abortSignal`。

### 输出
- `{ output, elapsedMs, usage? }`。

## 执行流程
1. 初始化与恢复：
   - 读取 checkpoint（`loadTaskCheckpoint`）。
   - 规范化为 `StandardState(round/transcript/finalized/finalOutput)`。
   - 写入 `standard_start` 或 `standard_resume` 事件。
2. 进入循环（直到 `finalized=true`）：
   - 终止条件：`abort`、总超时、`maxRounds` 上限。
   - 构建 planner prompt（含 transcript、可用 actions、是否恢复）。
   - 调 `runApiRunner`（单轮超时固定夹在 5s~30s）。
   - 解析 step，并写 `standard_round` 事件。
3. `respond` 分支：
   - 校验 response 非空。
   - 设置最终输出并写 checkpoint（stage=`responded`）。
   - 写 `standard_done` 事件并退出循环。
4. `action` 分支：
   - 调 `executeStandardStep` 执行动作。
   - 将动作 transcript 追加到状态。
   - 写 checkpoint（stage=`running`）。
5. 汇总 usage（input/output/total）并返回。

## 落盘副作用
- 进度：`task-progress/{taskId}.jsonl`。
- 断点：`task-checkpoints/{taskId}.json`。

## 错误语义
- 可能抛出：`standard_aborted`、`standard_timeout`、`standard_max_rounds_exceeded`、解析/动作执行错误、空响应错误。
- 不做内部吞错，异常交由上层 `worker-run-task` 收敛为 failed/canceled 结果。

## 调用方
- `runTaskWithRetry` 在 `profile=standard` 时调用。
