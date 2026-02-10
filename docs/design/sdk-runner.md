# SDK Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/llm/sdk-runner.ts`
- 导出函数：`runCodexSdk`
- 目标：通过 `@openai/codex-sdk` 进行流式执行

## 输入与输出
### 输入
- 必填：`role(manager|worker)`、`prompt`、`workDir`、`timeoutMs`
- 可选：`model`、`modelReasoningEffort`、`threadId`、`outputSchema`、`logPath`、`logContext`、`abortSignal`

### 输出
- `{ output, elapsedMs, usage?, threadId? }`

## 执行流程
1. 根据 role 决定 sandbox：
   - `worker` -> `danger-full-access`
   - `manager` -> `read-only`
2. 启动或恢复 thread。
3. `runStreamed` 消费事件流：
   - `agent_message` 聚合输出
   - `turn.completed` 提取 usage
   - `turn.failed/error` 抛错
4. 写调用日志并返回。

## 调用方
- `src/worker/specialist-runner.ts`
