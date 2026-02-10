# Worker Specialist Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/worker/specialist-runner.ts`
- 导出函数：`runSpecialistWorker`
- 依赖执行器：`runCodexSdk`

## 输入与输出
### 输入
- `stateDir`、`workDir`、`task`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`abortSignal`

### 输出
- `{ output, elapsedMs, usage? }`

## 执行流程
1. 构建 worker prompt。
2. 调用 `runCodexSdk(role='worker')`。
3. 成功：归档 `ok=true`，返回 `output/elapsedMs/usage`。
4. 失败：归档 `ok=false`（含错误），抛出原始异常。

## 归档策略
- 每次调用都归档（成功与失败都归档）。
- 归档 role 固定 `worker`，并附带 `taskId`。

## 调用方
- `src/worker/run-retry.ts`（`profile=specialist`）
