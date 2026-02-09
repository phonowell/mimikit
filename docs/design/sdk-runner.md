# SDK Runner（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 实现文件：`src/llm/sdk-runner.ts`。
- 导出函数：`runCodexSdk`。
- 目标：通过 `@openai/codex-sdk` 运行流式线程调用。

## 输入与输出
### 输入
- 必填：`role(thinker|worker)`、`prompt`、`workDir`、`timeoutMs`。
- 可选：`model`、`modelReasoningEffort`、`threadId`、`outputSchema`、`logPath`、`logContext`、`abortSignal`。

### 输出
- `{ output, elapsedMs, usage?, threadId? }`。

## 执行流程
1. 计算日志上下文：`promptChars`、`promptLines`、timeout 等。
2. 根据角色设置运行策略：
   - `worker` -> `sandboxMode='danger-full-access'`
   - `thinker` -> `sandboxMode='read-only'`
   - `approvalPolicy` 固定 `'never'`
3. 若配置 `logPath`：
   - 读取 codex settings 并写 `llm_call_started`。
   - 设置读取失败时写安全日志并继续。
4. 建立线程：
   - 有 `threadId` 则 `resumeThread`
   - 否则 `startThread`
5. 创建 idle 级超时终止器（`createIdleAbort`）。
6. 调 `thread.runStreamed(prompt, { outputSchema?, signal? })`。
7. 消费事件流：
   - `item.completed(agent_message)` -> 更新最终文本
   - `turn.completed` -> 提取 usage
   - `turn.failed` / `error` -> 标记失败并中断
8. 成功：写 `llm_call_finished`，返回输出与 `threadId`。
9. 失败：写 `llm_call_failed`（含错误与截断栈）并抛错。
10. finally：`idle.dispose()`。

## 错误语义
- 流式事件中的失败会转为抛错。
- 不做自动重试。

## 调用方
- `worker-expert-runner`（主调用方）。
