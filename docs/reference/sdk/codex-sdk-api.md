# Codex SDK · API 与协议

## 一、版本更新日志（0.98.0 → 0.101.0）

### v0.101.0 (2026-02-12)

- **模型解析优化**: 模型选择时保留原始 slug，不再重写模型引用，保持引用稳定性

### v0.100.0 (2026-02-11)

- **JavaScript REPL 运行时**（实验性）: 支持 `js_repl`，可跨工具调用持久化状态
- **多速率限制支持**: 协议/后端/TUI 层面支持多并发速率限制
- **WebSocket 传输**: 重新引入 app-server WebSocket 传输，支持入站/出站分离架构

### v0.99.0 (2026-02-11)

- 基础稳定性更新

### v0.98.0 (2026-02-05)

- **GPT-5.3-Codex** 模型支持
- **Steer mode** 默认启用：运行任务时 `Enter` 直接发送消息，`Tab` 显式插入换行
- **Mid-turn steering**: 任务执行期间可提交消息干预行为

---

## 二、SDK API 全量清单（0.101.0）

- 客户端：`new Codex(options?)`
- `CodexOptions`:
  - `codexPathOverride?: string` - 自定义 codex 二进制路径
  - `baseUrl?: string` - API 基础 URL
  - `apiKey?: string` - OpenAI API Key
  - `config?: Record<string, unknown>` - CLI 配置覆盖（拍平为 `--config key=value`）
  - `env?: Record<string, string>` - 自定义环境变量（不继承 `process.env`）
- 会话：`startThread(options?)`、`resumeThread(id, options?)`
- 线程属性：`thread.id`（首次 turn 开始后可用）
- 执行：`thread.run(input, turnOptions?)`（缓冲直到结束）
- 流式：`thread.runStreamed(input, turnOptions?)`（返回事件流）
- `TurnOptions`:
  - `outputSchema?: object`（结构化输出 JSON Schema）
  - `signal?: AbortSignal`（中断信号）
- 输入类型：`string` 或 `UserInput[]`
- `UserInput` 子类型：
  - `{ type: 'text', text: string }`
  - `{ type: 'local_image', path: string }`（本地图片）
  - `{ type: 'remote_image', url: string }`（远程图片，v0.100+）
  - `{ type: 'image_url', image_url: { url: string } }`（兼容格式）
- 输出类型（`run`）：`{ items, finalResponse, usage }`

---

## 三、ThreadOptions 全量参数

| 参数                                                                         | 类型    | 说明                                     |
| ---------------------------------------------------------------------------- | ------- | ---------------------------------------- |
| `model?: string`                                                             | string  | 模型 ID（如 `gpt-5.3-codex`）            |
| `workingDirectory?: string`                                                  | string  | 工作目录                                 |
| `skipGitRepoCheck?: boolean`                                                 | boolean | 跳过 Git 仓库检查                        |
| `sandboxMode?: 'read-only' \| 'workspace-write' \| 'danger-full-access'`     | enum    | 沙箱模式                                 |
| `approvalPolicy?: 'never' \| 'on-request' \| 'on-failure' \| 'untrusted'`    | enum    | 审批策略                                 |
| `modelReasoningEffort?: 'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh'` | enum    | 推理强度                                 |
| `networkAccessEnabled?: boolean`                                             | boolean | 网络访问开关                             |
| `webSearchMode?: 'disabled' \| 'cached' \| 'live'`                           | enum    | 网页搜索模式                             |
| `webSearchEnabled?: boolean`                                                 | boolean | 网页搜索开关                             |
| `additionalDirectories?: string[]`                                           | array   | 附加工作目录                             |
| `jsReplEnabled?: boolean`                                                    | boolean | JavaScript REPL 运行时（v0.100+ 实验性） |
| `jsReplRuntimePath?: string`                                                 | string  | JS REPL 运行时路径覆盖                   |
| `rateLimits?: RateLimitConfig[]`                                             | array   | 多速率限制配置（v0.100+）                |

---

## 四、事件协议（runStreamed）

### 顶层事件

- `thread.started`（含 `thread_id`）
- `turn.started`
- `turn.completed`（含 `usage`）
- `turn.failed`（含 `error.message`）
- `turn.cancelled`（用户/系统取消）
- `item.started` / `item.updated` / `item.completed`
- `error`（流级致命错误）
- `rate_limit.hit`（速率限制触发，v0.100+）

### Usage 字段

```typescript
{
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}
```

---

## 五、ThreadItem 全量类型与关键字段

| 类型                | 关键字段                                                       |
| ------------------- | -------------------------------------------------------------- |
| `agent_message`     | `text: string`                                                 |
| `reasoning`         | `text: string`（思维链）                                       |
| `command_execution` | `command`, `aggregated_output`, `exit_code?`, `status`         |
| `file_change`       | `changes[{ path, kind: 'add'\|'delete'\|'update' }]`, `status` |
| `mcp_tool_call`     | `server`, `tool`, `arguments`, `result?`, `error?`, `status`   |
| `web_search`        | `query`, `results?`                                            |
| `todo_list`         | `items[{ text, completed }]`                                   |
| `error`             | `message`, `code?`                                             |
| `js_repl_execution` | `code`, `result?`, `error?`（v0.100+ 实验性）                  |

---

## 六、运行语义（官方说明）

- SDK 通过 `stdin/stdout` 与本地 `codex` 二进制交换 JSONL 事件
- 线程可持久化并恢复；README 标注会话存储在 `~/.codex/sessions`
- `run()` 适合一次性结果；`runStreamed()` 适合进度、工具调用与审计场景
- `config` 会被拍平成 `--config key=value` 传给 CLI；同名线程参数优先级更高
- 自定义 `env` 时，SDK 不继承 `process.env`，仅使用你传入的环境变量集合（再加 SDK 必需变量）
- **Steer Mode**: v0.98+ 默认启用，运行中可直接发消息干预（mid-turn steering）
- **Model Resolution**: v0.101+ 保留原始模型 slug，避免引用被重写

---
