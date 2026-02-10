# Worker Standard Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/worker/standard-runner.ts`
- 导出函数：`runStandardWorker`
- 依赖：`runApiRunner`、`parseStandardStep`、`executeStandardStep`

## 输入与输出
### 输入
- `stateDir`、`workDir`、`taskId`、`prompt`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`abortSignal`

### 输出
- `{ output, elapsedMs, usage? }`

## 执行流程
1. 加载 checkpoint，恢复 `round/transcript/finalized/finalOutput`。
2. 进入循环：构建 planner prompt 并调用 `runApiRunner`。
3. 解析 step：
   - `final`：读取纯文本最终输出并结束。
   - `action`：执行 action 并追加 transcript。
4. 每轮写 `task-progress`，关键节点写 `task-checkpoint`。
5. 汇总 usage 并返回。

## 错误语义
- 可能抛错：`standard_aborted`、`standard_timeout`、`standard_max_rounds_exceeded`、`standard_step_parse_failed:*`。
- 不吞错，交由上层 `runTaskWithRetry` 收敛。

## 调用方
- `src/worker/run-retry.ts`（`profile=standard`）
