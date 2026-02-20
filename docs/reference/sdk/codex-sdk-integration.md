# Codex SDK · Mimikit 接入与建议

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
