# Manager Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/manager/runner.ts`
- 导出函数：`runManager`
- Prompt 组装：`buildManagerPrompt`
- 模型调用：`runApiRunner`

## 输入与输出
### 输入
- `stateDir`、`workDir`、`inputs`、`results`、`tasks`、`history`、`timeoutMs`
- 可选：`env`、`model`、`modelReasoningEffort`、`seed`、`temperature`、`fallbackModel`

### 输出
- `{ output, elapsedMs, fallbackUsed, usage? }`

## 执行流程
1. 构建 manager prompt。
2. primary 模型调用 `runApiRunner`。
3. 归档 primary 成功/失败到 `llm/*`。
4. primary 失败时，若存在 fallback model，则自动降级再试。
5. fallback 成功返回 `fallbackUsed=true`。
6. fallback 也失败则抛错给上层处理。

## 归档与去重键
- 归档 role 固定 `manager`。
- 归档含 `attempt=primary|fallback`。
- `requestKey` 由 prompt/model/sampling 参数稳定生成。

## 关键环境变量
- `MIMIKIT_MANAGER_MODEL`
- `MIMIKIT_MANAGER_REASONING_EFFORT`
- `MIMIKIT_FALLBACK_MODEL`
