# Teller Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/teller/runner.ts`。
- 导出函数：`runTellerDigest`、`formatDecisionForUser`。
- 依赖执行器：`runApiRunner`。

## runTellerDigest
### 输入
- `workDir`、`inputs`、`results`、`tasks`、`history`。
- `timeoutMs`、可选 `model`、`modelReasoningEffort`。

### 执行流程
1. 构建 digest prompt（`buildTellerDigestPrompt`）。
2. 调用 `runApiRunner`。
3. 解析输出中的 `@digest_context` / `@handoff_context` `summary`。
4. 若调用失败或无可用摘要，走 `fallbackSummary`：
   - 最新用户输入
   - 或最新结果前 300 字
   - 或固定兜底文案
5. 返回 `TellerDigest`：`digestId`、`summary`、`inputs`、`results`、`taskSummary`。

### 特征
- 不抛出模型调用异常（内部捕获并降级）。
- `taskSummary` 来自 `buildTaskStatusSummary(tasks)`，不是模型生成。

## formatDecisionForUser
### 输入
- `workDir`、`tasks`、`history`、`decision`、`inputIds`、`inputs`。
- `timeoutMs`、可选 `model`、`modelReasoningEffort`。

### 执行流程
1. 构建 teller 最终回复 prompt（`buildTellerPrompt`）。
2. 调用 `runApiRunner`。
3. 若输出非空，直接返回该文本。
4. 若异常或空文本，走 fallback：
   - 优先 `decision` 原文
   - 次选 `inputIds` 对应最新输入
   - 最后固定“收到（timestamp）”文案
5. 返回 `{ text, usage?, elapsedMs? }`。

### 特征
- 失败不抛错，始终给出用户可见文本。
- 仅负责“改写与出话”，不处理任务 action。

## 调用方
- `tellerLoop` 在摘要阶段调用 `runTellerDigest`。
- `tellerLoop` 在决策出话阶段调用 `formatDecisionForUser`。
