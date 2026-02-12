# Codex SDK 完整功能参考（Mimikit）

> 更新时间：2026-02-07
> 基线版本：`@openai/codex-sdk@0.98.0`
> 依据：`node_modules/@openai/codex-sdk/README.md` + `node_modules/@openai/codex-sdk/dist/index.d.ts`

## 这份文档的目标
- 记录 SDK 全量能力（含当前未使用能力），后续接入时直接查表，不再重调研。
- 标注 Mimikit 已用/未用边界，避免把“可用能力”误判为“当前已接入”。

## 一、SDK API 全量清单（0.98.0）
- 客户端：`new Codex(options?)`。
- `CodexOptions`：`codexPathOverride`、`baseUrl`、`apiKey`、`config`、`env`。
- 会话：`startThread(options?)`、`resumeThread(id, options?)`。
- 线程属性：`thread.id`（首次 turn 开始后可用）。
- 执行：`thread.run(input, turnOptions?)`（缓冲直到结束）。
- 流式：`thread.runStreamed(input, turnOptions?)`（返回事件流）。
- `TurnOptions`：`outputSchema`（结构化输出） + `signal`（中断）。
- 输入类型：`string` 或 `UserInput[]`。
- `UserInput` 子类型：`{ type: 'text', text }`、`{ type: 'local_image', path }`。
- 输出类型（`run`）：`{ items, finalResponse, usage }`。

## 二、ThreadOptions 全量参数
- `model?: string`
- `workingDirectory?: string`
- `skipGitRepoCheck?: boolean`
- `sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'`
- `approvalPolicy?: 'never' | 'on-request' | 'on-failure' | 'untrusted'`
- `modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'`
- `networkAccessEnabled?: boolean`
- `webSearchMode?: 'disabled' | 'cached' | 'live'`
- `webSearchEnabled?: boolean`
- `additionalDirectories?: string[]`

## 三、事件协议（runStreamed）
- 顶层事件：
  - `thread.started`（含 `thread_id`）
  - `turn.started`
  - `turn.completed`（含 `usage`）
  - `turn.failed`（含 `error.message`）
  - `item.started` / `item.updated` / `item.completed`
  - `error`（流级致命错误）
- `usage` 字段：`input_tokens`、`cached_input_tokens`、`output_tokens`。

## 四、ThreadItem 全量类型与关键字段
- `agent_message`：`text`
- `reasoning`：`text`
- `command_execution`：`command`、`aggregated_output`、`exit_code?`、`status`
- `file_change`：`changes[{ path, kind(add|delete|update) }]`、`status(completed|failed)`
- `mcp_tool_call`：`server`、`tool`、`arguments`、`result?`、`error?`、`status`
- `web_search`：`query`
- `todo_list`：`items[{ text, completed }]`
- `error`：`message`

## 五、运行语义（官方说明）
- SDK 通过 `stdin/stdout` 与本地 `codex` 二进制交换 JSONL 事件。
- 线程可持久化并恢复；README 标注会话存储在 `~/.codex/sessions`。
- `run()` 适合一次性结果；`runStreamed()` 适合进度、工具调用与审计场景。
- `config` 会被拍平成 `--config key=value` 传给 CLI；同名线程参数优先级更高。
- 自定义 `env` 时，SDK 不继承 `process.env`，仅使用你传入的环境变量集合（再加 SDK 必需变量）。

## 六、Mimikit 当前使用映射
- 已使用：
  - `new Codex()`、`startThread()`、`runStreamed()`
  - `workingDirectory`、`sandboxMode`、`approvalPolicy`、`modelReasoningEffort: 'high'`
  - `turn.failed` / `error` 失败处理、`turn.completed.usage` 统计
  - `outputSchema` 入参通道（`src/providers/codex-sdk-provider.ts` 已支持）
- 未使用但可直接接入：
  - `resumeThread(id)`（跨轮会话复用）
  - `UserInput.local_image`（多图输入）
  - `skipGitRepoCheck`（非 Git 工作目录）
  - `networkAccessEnabled`、`webSearchMode`、`webSearchEnabled`
  - `additionalDirectories`
  - `CodexOptions.config` / `env` / `apiKey` / `baseUrl` / `codexPathOverride`

## 七、接入注意与补证项
- 事件流提供“过程可观测性”，不等于可直接读取模型完整内部上下文。
- `config.toml`、Rules/Skills、MCP 在 SDK 场景的最终继承边界，建议用集成测试固化。
- 建议补一组基准：`codex-sdk-provider` vs `codex exec`（按角色、任务类型、token、时延、失败率）。
