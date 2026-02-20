# OpenCode SDK · API 与会话模型

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

