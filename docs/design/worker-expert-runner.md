# Worker Expert Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/worker/expert-runner.ts`。
- 导出函数：`runExpertWorker`。
- 依赖执行器：`runCodexSdk`。

## 输入与输出
### 输入
- `stateDir`、`workDir`、`task`、`timeoutMs`。
- 可选 `model`、`modelReasoningEffort`、`abortSignal`。

### 输出
- `{ output, elapsedMs, usage? }`。

## 执行流程
1. 构建 worker prompt（`buildWorkerPrompt`）。
2. 调用 `runCodexSdk`（固定 `role='worker'`）。
3. 成功路径：
   - 归档 `ok=true`。
   - 若 SDK 返回 `threadId`，写入归档元信息。
   - 返回 `output/elapsedMs/usage`。
4. 失败路径：
   - 归档 `ok=false`（含 `error`、`errorName`）。
   - 抛出原始错误。

## 归档策略
- 每次调用都归档（成功与失败均归档）。
- 归档 role 固定 `worker`，并带 `taskId`。

## 错误语义
- 不做降级输出，不吞错。
- 重试由上层 `worker-run-retry` 负责。

## 调用方
- `runTaskWithRetry` 在 `profile=expert` 时调用。
- `code-evolve` 任务也直接调用该 runner。
