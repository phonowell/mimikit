# OpenCode SDK 完整功能参考（Mimikit）

> 更新时间：2026-02-14  
> 基线版本：`@opencode-ai/sdk@1.2.0`  
> 依据：`node_modules/@opencode-ai/sdk/README.md` + 官方文档 + GitHub 源码

## 这份文档的目标

- 记录 SDK 全量能力（含当前未使用能力），后续接入时直接查表，不再重调研。
- 标注 Mimikit 已用/未用边界，避免把"可用能力"误判为"当前已接入"。
- 与 Codex SDK 形成对照，便于技术选型。

---

## 一、SDK 概述

OpenCode SDK 是一个 TypeScript/JavaScript 客户端库，提供对 OpenCode Server 的类型安全访问。所有代码均从 OpenAPI 规范自动生成，零依赖。

**核心特点:**

- 类型安全：完整的 TypeScript 类型定义
- 零依赖：轻量级，无外部依赖
- 双协议：支持 HTTP REST 和 WebSocket API
- 自动生成的客户端：从 OpenAPI 规范同步更新

---

## 二、安装与初始化

### 安装

```bash
npm install @opencode-ai/sdk
```

### 基础初始化

```typescript
import { createOpencode } from "@opencode-ai/sdk";

const client = createOpencode({
  baseUrl: "http://localhost:4096", // 默认
  timeout: 60000, // 60秒超时
  throwOnError: false, // 默认返回错误而非抛出
});
```

### 配置选项 (ClientOptions)

| 参数            | 类型                     | 默认值                  | 说明                                               |
| --------------- | ------------------------ | ----------------------- | -------------------------------------------------- |
| `baseUrl`       | `string`                 | `http://localhost:4096` | 服务器 URL                                         |
| `timeout`       | `number`                 | `60000`                 | 请求超时（毫秒）                                   |
| `fetch`         | `function`               | `globalThis.fetch`      | 自定义 fetch 实现                                  |
| `parseAs`       | `string`                 | `auto`                  | 响应解析方式：`auto` \| `json` \| `text` \| `blob` |
| `responseStyle` | `string`                 | `fields`                | 返回风格：`data`（仅数据） \| `fields`（完整响应） |
| `throwOnError`  | `boolean`                | `false`                 | 错误时抛出异常而非返回                             |
| `headers`       | `Record<string, string>` | `{}`                    | 自定义请求头                                       |

---

## 三、API 全量清单

### 1. Global API

| 方法                     | 描述     | 返回值                               |
| ------------------------ | -------- | ------------------------------------ |
| `client.global.health()` | 健康检查 | `{ healthy: true, version: string }` |

```typescript
const health = await client.global.health();
console.log(health.data.version); // "1.2.0"
```

### 2. Session API

| 方法                                            | 描述         | 参数                         | 返回值      |
| ----------------------------------------------- | ------------ | ---------------------------- | ----------- |
| `client.session.list()`                         | 列出所有会话 | -                            | `Session[]` |
| `client.session.get({ path: { id } })`          | 获取会话详情 | `id: string`                 | `Session`   |
| `client.session.create({ body })`               | 创建新会话   | `CreateSessionRequest`       | `Session`   |
| `client.session.delete({ path: { id } })`       | 删除会话     | `id: string`                 | `void`      |
| `client.session.update({ path: { id }, body })` | 更新会话     | `id`, `UpdateSessionRequest` | `Session`   |

```typescript
// 列出会话
const sessions = await client.session.list();
console.log(sessions.data); // Session[]

// 创建会话
const session = await client.session.create({
  body: {
    agent: "build", // 可选：指定 agent
    cwd: "/path/to/project", // 可选：工作目录
    metadata: {
      // 可选：自定义元数据
      project: "my-app",
      task: "refactor",
    },
  },
});

// 获取会话
const existing = await client.session.get({
  path: { id: "session-123" },
});
```

### 3. Message API

| 方法                                                     | 描述         | 参数                                | 返回值      |
| -------------------------------------------------------- | ------------ | ----------------------------------- | ----------- |
| `client.message.list({ path: { sessionId } })`           | 列出会话消息 | `sessionId: string`                 | `Message[]` |
| `client.message.create({ path: { sessionId }, body })`   | 发送消息     | `sessionId`, `CreateMessageRequest` | `Message`   |
| `client.message.get({ path: { sessionId, messageId } })` | 获取单条消息 | `sessionId`, `messageId`            | `Message`   |

```typescript
// 发送文本消息
const message = await client.message.create({
  path: { sessionId: "session-123" },
  body: {
    content: "帮我重构这段代码",
    role: "user",
  },
});

// 发送带附件的消息
const messageWithAttachment = await client.message.create({
  path: { sessionId: "session-123" },
  body: {
    content: "分析这个文件",
    role: "user",
    attachments: [{ path: "/path/to/file.ts", type: "file" }],
  },
});
```

### 4. Stream API (WebSocket)

| 方法                                             | 描述              | 参数                | 返回值      |
| ------------------------------------------------ | ----------------- | ------------------- | ----------- |
| `client.stream.connect({ path: { sessionId } })` | 连接 WebSocket 流 | `sessionId: string` | `WebSocket` |

```typescript
// WebSocket 流式通信
const ws = await client.stream.connect({
  path: { sessionId: "session-123" },
});

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data); // StreamEvent
};

ws.send(
  JSON.stringify({
    type: "message",
    content: "继续执行任务",
  }),
);
```

---

## 四、核心类型定义

### Session

```typescript
interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  agent?: string;
  cwd?: string;
  status: "active" | "paused" | "completed" | "error";
  metadata?: Record<string, unknown>;
  messageCount: number;
}
```

### Message

```typescript
interface Message {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system" | "tool";
  content: string;
  parts: Part[];
  createdAt: string;
  attachments?: Attachment[];
}

type Part =
  | TextPart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart
  | ImagePart;

interface TextPart {
  type: "text";
  text: string;
}

interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

interface ReasoningPart {
  type: "reasoning";
  reasoning: string;
}

interface ImagePart {
  type: "image";
  mimeType: string;
  data: string; // base64
}
```

### Attachment

```typescript
interface Attachment {
  path: string;
  type: "file" | "image" | "directory";
  name?: string;
  size?: number;
}
```

---

## 五、错误处理

```typescript
// 方式 1: throwOnError = false（默认）
const result = await client.session.get({
  path: { id: "invalid-id" },
});

if (result.error) {
  console.error("Error:", result.error.message);
  console.error("Status:", result.response.status);
} else {
  console.log("Session:", result.data);
}

// 方式 2: throwOnError = true
const clientStrict = createOpencode({
  throwOnError: true,
});

try {
  const session = await clientStrict.session.get({
    path: { id: "invalid-id" },
  });
} catch (error) {
  console.error("Failed:", error.message);
}
```

---

## 六、Mimikit 当前使用映射

### 已使用（根据 package.json 推断）

- `@opencode-ai/sdk@1.2.0` 已安装
- `src/providers/opencode-provider.ts` 集成中

### 未使用但可直接接入

- **Session 管理**: `session.list()`, `session.create()`, `session.delete()`
- **消息历史**: `message.list()` 获取完整对话历史
- **流式连接**: `stream.connect()` WebSocket 实时通信
- **健康检查**: `global.health()` 服务状态监控
- **元数据支持**: Session 创建时传入自定义元数据

### 未使用（需评估）

- **消息附件**: `attachments` 文件上传功能
- **Session 更新**: `session.update()` 动态修改会话
- **自定义 fetch**: 用于代理或特殊网络环境

---

## 七、OpenCode vs Codex SDK 对比

| 特性         | OpenCode SDK                                | Codex SDK           |
| ------------ | ------------------------------------------- | ------------------- |
| **定位**     | 通用 AI 助手平台                            | 编码专用 Agent      |
| **协议**     | HTTP REST + WebSocket                       | stdio JSONL         |
| **依赖**     | 零依赖                                      | 需 codex CLI 二进制 |
| **模型支持** | 多 Provider（Anthropic, OpenAI, Google...） | OpenAI 专用         |
| **会话管理** | 显式 CRUD API                               | 隐式线程管理        |
| **流式**     | WebSocket 原生                              | stdout 事件流       |
| **代码规模** | 轻量级                                      | 较重（401MB）       |
| **本地运行** | 需 OpenCode Server                          | 需 codex 二进制     |
| **类型生成** | OpenAPI 自动生成                            | 手工维护            |
| **社区**     | 新兴（开源替代）                            | 主流（OpenAI 官方） |

---

## 八、接入建议

### 场景 1: 多模型支持（推荐）

OpenCode SDK 支持切换不同 Provider，适合需要对比多模型的场景。

```typescript
// 使用不同模型
const session = await client.session.create({
  body: {
    agent: "build",
    // OpenCode 配置决定使用哪个 Provider
    metadata: {
      model: "claude-sonnet-4",
      provider: "anthropic",
    },
  },
});
```

### 场景 2: 持久化会话管理

利用 Session API 实现跨进程/跨设备的持久化会话。

```typescript
// 保存会话 ID
const session = await client.session.create({ body: {} });
await saveToDatabase("active_session", session.data.id);

// 恢复会话
const sessionId = await getFromDatabase("active_session");
const messages = await client.message.list({ path: { sessionId } });
```

### 场景 3: 实时协作（WebSocket）

相比 Codex 的 stdout 流，OpenCode 的 WebSocket 更适合 Web 应用场景。

```typescript
// 实时更新 UI
const ws = await client.stream.connect({ path: { sessionId } });

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "message.delta":
      appendToUI(msg.delta);
      break;
    case "tool.call":
      showToolExecution(msg.tool);
      break;
    case "error":
      showError(msg.error);
      break;
  }
};
```

---

## 九、快速参考卡片

```typescript
import { createOpencode } from "@opencode-ai/sdk";

// 初始化
const client = createOpencode({
  baseUrl: "http://localhost:4096",
  timeout: 120000,
});

// 健康检查
const health = await client.global.health();
console.log("Server version:", health.data.version);

// 创建会话并发送消息
const session = await client.session.create({
  body: { agent: "build", cwd: process.cwd() },
});

const message = await client.message.create({
  path: { sessionId: session.data.id },
  body: { role: "user", content: "解释这段代码" },
});

// 获取完整对话历史
const history = await client.message.list({
  path: { sessionId: session.data.id },
});

// 清理
await client.session.delete({
  path: { id: session.data.id },
});
```

---

## 十、相关资源

- **OpenCode 官网**: https://opencode.ai
- **官方文档**: https://opencode.ai/docs
- **GitHub**: https://github.com/opencode-ai/opencode
- **SDK npm**: https://www.npmjs.com/package/@opencode-ai/sdk
- **Vercel AI SDK Provider**: `ai-sdk-provider-opencode-sdk`
