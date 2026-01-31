# Codex SDK 能力与用法（Mimikit）

## 定位与适用场景（官方）
- 用于**程序化控制本地 Codex agent**。
- 适合场景：CI/CD、构建自定义 agent、内嵌到内部工具或应用。
- TypeScript 库，**比 non-interactive mode 更全面更灵活**；需 Node.js 18+。

## SDK 与 CLI 的关系（官方）
- SDK **封装了本地 `codex` 二进制**：通过 `stdin/stdout` 交换 JSONL 事件。
- 即：SDK 不是直接 API，而是更易用的“CLI 编程封装层”。

## 核心能力（官方）
- 线程式会话：
  - `startThread()` 创建新线程。
  - `run(prompt)` 同一线程多次执行。
  - `resumeThread(threadId)` 恢复历史线程继续执行。
- 流式事件：
  - `run()` 缓冲到结束。
  - `runStreamed()` 返回 async generator，可消费中间事件。
- 结构化输出：
  - `run(prompt, { outputSchema })` 约束最终 JSON 输出。
- 多模态输入（图片）：
  - `run([{ type: "text" }, { type: "local_image", path }])`。
- 工作目录控制：
  - `startThread({ workingDirectory, skipGitRepoCheck })`。
- 线程选项（ThreadOptions）：
  - `model`
  - `sandboxMode`: `read-only` | `workspace-write` | `danger-full-access`
  - `approvalPolicy`: `never` | `on-request` | `on-failure` | `untrusted`
  - `networkAccessEnabled`
  - `webSearchMode` / `webSearchEnabled`
  - `additionalDirectories`
  - `modelReasoningEffort`
- 运行环境控制：
  - `new Codex({ env })` 可控制传给 CLI 的环境变量。
- CLI 配置覆盖：
  - `new Codex({ config })` → 自动转换为 `--config key=value`。
  - “yolo 等价”：`sandboxMode: "danger-full-access"` + `approvalPolicy: "never"`。

## 返回结构（官方 + 本地观察）
- `items[]`：逐项输出（含 `reasoning` / `agent_message` 等）。
- `finalResponse`：最终回复文本。
- `usage`：`input_tokens/output_tokens/cached_input_tokens?`。

## runStreamed 事件类型（SDK 暴露）
- `thread.started` / `turn.started` / `turn.completed` / `turn.failed`
- `item.started` / `item.updated` / `item.completed`
- `item` 类型可能包括：
  - `agent_message` / `reasoning`
  - `command_execution`（包含聚合 stdout/stderr、exit_code）
  - `file_change`（包含变更文件列表与状态）
  - `mcp_tool_call`
  - `web_search`
  - `todo_list`
  - `error`

## 最小示例（官方）
```ts
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();
const result = await thread.run("Diagnose the test failure and propose a fix");
console.log(result.finalResponse);
```

## 流式示例（官方）
```ts
const { events } = await thread.runStreamed("Diagnose the test failure");
for await (const event of events) {
  if (event.type === "item.completed") console.log(event.item);
  if (event.type === "turn.completed") console.log(event.usage);
}
```

## 结构化输出示例（官方）
```ts
const schema = {
  type: "object",
  properties: { summary: { type: "string" }, status: { type: "string" } },
  required: ["summary", "status"],
  additionalProperties: false,
} as const;
const turn = await thread.run("Summarize repository status", { outputSchema: schema });
console.log(turn.finalResponse);
```

## 本地 Codex 配置/技能机制（需验证 SDK 是否继承）
> SDK 文档未显式说明配置继承，但其定位是控制“本地 Codex agent”。

### 本地配置
- `~/.codex/config.toml` 是 Codex 本地配置文件。
- CLI 和 IDE 扩展共享同一 `config.toml`。
- 配置优先级：CLI flags > profile > config.toml 根级 > 内置默认值。
- `CODEX_HOME`（默认 `~/.codex`）存放 `config.toml`、`auth.json` 等状态文件。

### Team Config 与 Rules/Skills
- Team Config 可在多层路径提供 `config.toml` / `rules/` / `skills/`。
- 位置优先级（高到低）：`$CWD/.codex/` → 父目录 `.codex/` → `REPO_ROOT/.codex/` → `$CODEX_HOME` → `/etc/codex/`。

### Skills 搜索路径（与 SDK 相关）
- `REPO`：`$CWD/../.codex/skills` 与 `$REPO_ROOT/.codex/skills`
- `USER`：`$CODEX_HOME/skills`
- `ADMIN`：`/etc/codex/skills`（官方说明可用于 SDK scripts/automation）
- `SYSTEM`：Codex 内置 skills

### MCP（外部上下文/工具）
- Codex 的 MCP 服务器配置在 `config.toml`。
- CLI 与 IDE 共享 MCP 配置。

## 本地验证结果（已做）
- SDK 包：`@openai/codex-sdk` 已安装。
- **repo 级** `.codex/skills` 未被 SDK 识别（待确认用户级/管理员级路径）。

## 可用于 Mimikit 的优化方向（记录）
- 用 SDK 替代 `codex exec` 进程式调用，减少进程与 JSONL 解析开销。
- Thread reuse disabled in Mimikit:
  - Each run starts a new thread.
  - History/memory are injected explicitly by Supervisor.
- `runStreamed()` 提供更细粒度的事件流（更易做日志/审计/进度显示）。
- `outputSchema` 可替代“工具 JSONL 解析”，降低格式错误成本。
- `usage` 字段可直接用于成本统计。

## 风险与约束
- Thread reuse disabled; token growth is driven by injected history/memory.
- SDK 的“上下文可见性”仍是事件粒度，并非可直接读取完整上下文。
- 技能路径与配置继承的行为需验证（当前仅验证了 repo 级技能不生效）。

## 待验证清单
- SDK 是否读取 `$CODEX_HOME/skills` / `/etc/codex/skills`。
- SDK 是否继承 `config.toml`：
  - model/provider/profile
  - approval/sandbox
  - MCP 服务器
- SDK vs CLI 的 token/时延对比（按角色分组）。
