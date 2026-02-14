# Codex SDK 完整功能参考（Mimikit）

> 更新时间：2026-02-14  
> 基线版本：`@openai/codex-sdk@0.101.0`  
> 依据：`node_modules/@openai/codex-sdk/README.md` + `node_modules/@openai/codex-sdk/dist/index.d.ts` + 官方 Release Notes

## 这份文档的目标

- 记录 SDK 全量能力（含当前未使用能力），后续接入时直接查表，不再重调研。
- 标注 Mimikit 已用/未用边界，避免把"可用能力"误判为"当前已接入"。

---

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

## 七、Mimikit 当前使用映射

### 已使用

- `new Codex()`、`startThread()`、`runStreamed()`
- `workingDirectory`、`sandboxMode`、`approvalPolicy`、`modelReasoningEffort: 'high'`
- `turn.failed` / `error` 失败处理、`turn.completed.usage` 统计
- `outputSchema` 入参通道（`src/providers/codex-sdk-provider.ts` 已支持）

### 未使用但可直接接入（高价值）

- `resumeThread(id)`（跨轮会话复用）
- `UserInput.local_image` / `remote_image`（多图输入）
- `skipGitRepoCheck`（非 Git 工作目录）
- `networkAccessEnabled`、`webSearchMode`、`webSearchEnabled`
- `additionalDirectories`
- `jsReplEnabled` / `jsReplRuntimePath`（v0.100+ 实验性 JS REPL）
- `CodexOptions.config` / `env` / `apiKey` / `baseUrl` / `codexPathOverride`

### 未使用（需评估）

- 多速率限制配置（`rateLimits`，v0.100+）
- `turn.cancelled` 事件处理
- `rate_limit.hit` 事件监听

---

## 八、新增功能接入建议

### 1. GPT-5.3-Codex 模型（推荐）

```typescript
const thread = codex.startThread({
  model: "gpt-5.3-codex",
  modelReasoningEffort: "high",
});
```

- 速度提升 25%
- 编码性能与推理能力结合

### 2. Mid-turn Steering（交互优化）

- 在流式输出期间允许用户发送干预消息
- 需要前端配合：监听 `turn.started` 后开启输入框

### 3. JavaScript REPL（实验性，v0.100+）

```typescript
const thread = codex.startThread({
  jsReplEnabled: true,
  // jsReplRuntimePath: '/custom/node/path' // 可选
});
```

- 支持状态跨工具调用持久化
- 适合复杂数据处理和计算任务

### 4. 多速率限制（高并发场景）

```typescript
const codex = new Codex({
  config: {
    rateLimits: [{ requestsPerMinute: 60 }, { requestsPerHour: 1000 }],
  },
});
```

---

## 九、接入注意与补证项

- 事件流提供"过程可观测性"，不等于可直接读取模型完整内部上下文
- `config.toml`、Rules/Skills、MCP 在 SDK 场景的最终继承边界，建议用集成测试固化
- 建议补一组基准：`codex-sdk-provider` vs `codex exec`（按角色、任务类型、token、时延、失败率）
- **v0.100+ 注意**: `js_repl` 为实验性功能，生产环境使用前需充分测试
- **v0.101+ 注意**: 模型 slug 稳定性改进，原有按前缀匹配逻辑可能需调整

---

## 十、快速参考卡片

```typescript
// 基础用法
import { Codex } from "@openai/codex-sdk";

const codex = new Codex({
  apiKey: process.env.OPENAI_API_KEY,
  // baseUrl: 'https://custom.api.endpoint',
  // env: { PATH: '/usr/local/bin' },
});

const thread = codex.startThread({
  model: "gpt-5.3-codex",
  workingDirectory: "/path/to/project",
  sandboxMode: "workspace-write",
  approvalPolicy: "on-failure",
});

// 流式执行
for await (const event of thread.runStreamed("实现一个快速排序")) {
  console.log(event);
}

// 结构化输出
const result = await thread.run("分析代码质量", {
  outputSchema: {
    type: "object",
    properties: {
      score: { type: "number" },
      issues: { type: "array", items: { type: "string" } },
    },
  },
});
```
