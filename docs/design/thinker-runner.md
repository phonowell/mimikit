# Thinker Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/thinker/runner.ts`。
- 导出函数：`runThinker`。
- 依赖执行器：`runApiRunner`。

## 输入与输出
### 输入
- 上下文：`inputs`、`results`、`tasks`、`history`、可选 `env`。
- 执行参数：`timeoutMs`、可选 `model`、`modelReasoningEffort`、`seed`、`temperature`、`fallbackModel`。
- 持久化参数：`stateDir`、`workDir`。

### 输出
- `{ output, elapsedMs, fallbackUsed, usage? }`。

## 执行流程
1. 构建 thinker prompt（`buildThinkerPrompt`）。
2. 生成归档检索键：主请求 `requestKey`，以及可选 fallback 请求键。
3. 主调用：`runApiRunner`。
4. 主调用成功：归档 `ok=true`（attempt=`primary`）并返回 `fallbackUsed=false`。
5. 主调用失败：归档 `ok=false`（attempt=`primary`）。
6. 若无 fallback model：直接抛错。
7. fallback 调用成功：归档 `ok=true`（attempt=`fallback`）并返回 `fallbackUsed=true`。
8. fallback 调用失败：归档 `ok=false`（attempt=`fallback`）后抛错。

## 归档策略
- 主/备两条路径都写入 llm archive。
- 采样参数（`seed`、`temperature`）会进入归档元信息。
- 失败归档包含 `error` 与 `errorName`。

## 错误语义
- `runThinker` 仅在“主失败且备失败/无备”时抛错。
- 不负责错误降级文案；降级决策由 `thinker-cycle` 处理。

## 调用方
- `runThinkerCycle`（主决策链路）。
- `runIdleConversationReview`（空闲复盘）。
- `runPromptOptimizer`（提示词优化任务）。
