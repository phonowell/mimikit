# OpenCode SDK · Mimikit 接入与选型

## 六、Mimikit 当前使用映射

### 已使用（根据 package.json 推断）

- `@opencode-ai/sdk@1.2.0` 已安装
- `src/providers/opencode-provider.ts` 集成中
- `src/providers/opencode-session.ts` 已用于 manager `compress_context` 的 `session.summarize`

### 当前实现约束（Mimikit）

- 调用 `session.summarize` 时必须显式提供 `providerID/modelID`。
- `providerID/modelID` 统一由 `runtime.config.manager.model` 解析，不在 manager 层分散拼装。
- summarize 的重试策略统一收敛在 provider session 层（最多 2 次）。

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
