# mimiclaw / picoclaw 调研与可借鉴点（2026-02-27）

> 已有更聚焦版本：`./manager-roi-refocus-2026-02-27.md`（仅围绕“代码量降低 + manager 稳定/功能提升”）。

## 范围与版本

- 调研仓库：`../project/mimiclaw` @ `e9a9211d8920e717091aff6c1b7c335805750039`
- 调研仓库：`../project/picoclaw` @ `a5c8179fa854c67450e5a681282d8e459ab04d69`
- 对照基线：`mimikit` @ `2ec76e9`

## 实现特征速览

| 维度 | mimiclaw | picoclaw | mimikit（当前） |
| --- | --- | --- | --- |
| 主架构 | ESP32 单机双核任务 + 队列（`main/mimi.c`） | Go 单进程，多通道 + 多 agent 路由（`pkg/agent/loop.go`） | 单 session orchestrator，manager/worker 分层（`src/orchestrator/core/orchestrator-service.ts`） |
| LLM 回路 | ReAct 工具循环（`main/agent/agent_loop.c`） | ReAct + fallback + summarize（`pkg/agent/loop.go`） | manager action loop + worker continue loop（`src/manager/loop-batch-run-manager.ts`、`src/worker/profiled-runner-loop.ts`） |
| Prompt 组织 | 代码拼装 + 本地文件拼接（`main/agent/context_builder.c`） | ContextBuilder + mtime 缓存（`pkg/agent/context.go`） | `prompts/` 模板 + 渲染（`src/prompts/build-prompts.ts`） |
| Skills | 内置字符串 + SPIFFS 发现（`main/skills/skill_loader.c`） | workspace/global/builtin 三层优先级（`pkg/skills/loader.go`） | skill 由 worker 执行链负责，提示词不在 TS 硬编码（`prompts/`） |
| Provider 策略 | 轻量多 provider，偏静态配置 | model-centric + fallback + cooldown（`pkg/providers/factory_provider.go`、`pkg/providers/fallback.go`） | provider 注册表（`src/providers/registry.ts`），暂无跨模型 failover 链 |
| 安全边界 | 设备本地 SPIFFS 范围 | workspace 沙箱 + exec deny patterns（`README.md`、`docs/tools_configuration.md`） | 依赖现有执行链约束，未显式提供 workspace 沙箱开关 |

## 可直接借鉴（高 ROI，低改造）

### 1) Prompt 源文件缓存 + mtime 失效

- 参考：`picoclaw/pkg/agent/context.go` 的 `BuildSystemPromptWithCache` + `sourceFilesChangedLocked`
- 当前痛点：`mimikit/src/prompts/build-prompts.ts` 每轮都会读取 persona/user_profile 与模板，频繁 I/O。
- 建议落地：
  - 在 `src/prompts/prompt-loader.ts` 增加进程内缓存（key=绝对路径，value={content,mtime}）。
  - 仅缓存静态模板与 persona/user_profile 读取结果；动态区块仍实时渲染。
  - 缓存失效触发：`mtime` 变化或显式 reload。

### 2) Provider fallback 链（带冷却）

- 参考：`picoclaw/pkg/providers/fallback.go`、`pkg/providers/cooldown.go`
- 当前痛点：`mimikit/src/providers/registry.ts` 为单 provider 调用，遇到 429/临时网络故障只能整轮失败。
- 建议落地：
  - 在 manager 路径先做最小版本：主模型失败时切备用模型（仅 1 层 fallback）。
  - 冷却窗口只做内存态，避免复杂持久化；先覆盖 `rate_limit`/`billing`/`timeout` 三类错误。

### 3) Worker 执行安全开关显式化

- 参考：`picoclaw` 的 `restrict_to_workspace` + exec deny patterns（`README.md`、`docs/tools_configuration.md`）
- 当前痛点：`mimikit` 缺少“是否允许越界路径/危险命令”的显式配置面。
- 建议落地：
  - 在 `src/config.ts` 增加 worker 安全选项（默认严格）。
  - 在 worker 运行前注入路径校验与 deny pattern（最小集合即可）。

## 条件借鉴（中 ROI，需控复杂度）

### 1) 路由会话键规范

- 参考：`picoclaw/pkg/routing/route.go`、`pkg/routing/session_key.go`
- 价值：若后续接 Telegram/Slack，可复用“路由优先级 + 会话键规范”避免历史串线。
- 约束：mimikit 当前是单主 session 架构，不建议提前引入完整多 agent 路由系统。

### 2) 对话历史紧急压缩

- 参考：`picoclaw/pkg/agent/loop.go` 的 `forceCompression`
- 价值：当上下文溢出时能自动降级重试，减少硬失败。
- 约束：mimikit 已有 `compress_context` action，建议优先补“自动触发阈值”而非新增第二套摘要系统。

### 3) Skills 多来源优先级

- 参考：`picoclaw/pkg/skills/loader.go`（workspace > global > builtin）
- 价值：便于未来引入团队共享 skills。
- 约束：需保持 prompts 不硬编码规则，避免把 skill 文本重新塞回 TS 代码。

## 不建议借鉴（与当前原则冲突）

- `mimiclaw/main/agent/context_builder.c` 与 `main/skills/skill_loader.c` 存在大量提示词/skill 文本硬编码，不符合“提示词统一放 `prompts/`”规则。
- mimiclaw 的 ESP32 专属内存/任务布局（PSRAM、双核 pinning、SPIFFS）是硬件约束产物，对 mimikit 复用价值低。
- picoclaw 全量多通道接入面较大（大量 `pkg/channels/*`），直接搬运会明显抬高代码规模与维护负担。

## 建议执行顺序

1. `P0`：Prompt 缓存（小改动，可先验证 I/O 与响应时间收益）。
2. `P0`：Manager provider fallback 最小实现（1 主 1 备 + 冷却）。
3. `P1`：Worker 安全边界配置化（默认严格，按需放宽）。
4. `P1`：上下文溢出自动压缩触发器（复用现有 `compress_context` 机制）。
