# pi-mono 调研（面向 mimikit，2026-02-12）

## 调研范围
- 仓库：`../pi-mono`
- 重点文件：
  - `../pi-mono/README.md`
  - `../pi-mono/package.json`
  - `../pi-mono/packages/agent/README.md`
  - `../pi-mono/packages/coding-agent/README.md`
  - `../pi-mono/packages/coding-agent/docs/{sdk.md,rpc.md,extensions.md,skills.md,packages.md,compaction.md}`
  - `../pi-mono/packages/agent/src/{agent-loop.ts,types.ts}`
  - `../pi-mono/packages/ai/src/{models.ts,api-registry.ts,providers/register-builtins.ts,providers/openai-codex-responses.ts}`
  - `../pi-mono/packages/mom/src/{main.ts,context.ts,sandbox.ts}`
  - `../pi-mono/packages/pods/{README.md,src/cli.ts}`
- 对照文件（mimikit）：
  - `docs/design/system-architecture.md`
  - `src/orchestrator/core/orchestrator-service.ts`
  - `src/manager/{loop.ts,runner.ts}`
  - `src/worker/{run-task.ts,run-retry.ts}`
  - `src/providers/{codex-sdk-provider.ts,openai-chat-provider.ts,run.ts}`

## pi-mono 的主要特点

| 维度 | 事实证据 | 结论 |
|---|---|---|
| 多包分层 | 根 README + `packages/*`（`ai/agent/coding-agent/tui/web-ui/mom/pods`） | 不是单体 CLI，而是“LLM SDK + agent runtime + 多前端/场景”的组合仓库。 |
| 模型/供应商抽象 | `packages/ai/src/api-registry.ts` + `providers/register-builtins.ts` | 通过 API provider registry 做统一流式接口，支持多家 provider。 |
| Codex 兼容通道 | `packages/ai/src/providers/openai-codex-responses.ts` | 已内建 `openai-codex-responses`，且含重试、reasoning 参数、session/prompt cache key 支持。 |
| Agent 事件循环 | `packages/agent/src/agent-loop.ts` + `types.ts` | 具备 turn/message/tool 全事件流、steering/follow-up 队列、context transform。 |
| 高扩展 harness | `packages/coding-agent/src/index.ts` + `docs/extensions.md` | 扩展点完整：命令、工具、UI、生命周期拦截、包化分发。 |
| 技能渐进披露 | `docs/skills.md` | 只把 skill 元信息放主 prompt，按需加载 `SKILL.md`，token 友好。 |
| 会话树与压缩 | `docs/compaction.md` | 有 session tree、branch summary、自动 compaction，且追踪读写文件集合。 |
| 集成模式丰富 | `docs/sdk.md` + `docs/rpc.md` | 同时支持 SDK 嵌入与 RPC 子进程接入。 |
| 场景化产品能力 | `packages/mom` + `packages/pods` | 从“编码 agent”延展到 Slack 自主代理和 GPU Pod 模型运维。 |

## 值得 mimikit 参考学习的点（高 ROI）

| 优先级 | 可借鉴点 | 原因 | 落地方向 |
|---|---|---|---|
| P0 | Provider 注册表抽象（类似 `pi-ai`） | mimikit 在该调研时点仍偏单通道（OpenAI/Codex 配置优先）；未来多模型路由会持续抬高维护成本。 | 已落地到 `src/providers/`：统一 `stream`/`usage` 语义。 |
| P0 | Steering/Follow-up 语义 | `manager/worker` 在线处理中断与追问是高频需求，现有队列能力偏任务级，缺消息级“插队”语义。 | 参考 `agent-loop.ts` 的双队列机制，给 manager 引入“当前轮后插入消息”。 |
| P1 | Compaction 结构化 summary + 文件轨迹 | mimikit 已有历史窗口裁剪，但缺“可追溯摘要对象”。 | 在历史压缩时记录 `summary + readFiles + modifiedFiles`，提升审计与回放质量。 |
| P1 | 资源加载器思路（skills/prompts/packages） | 你们已有 skills 体系，pi 的包化分发模型可减少本地硬耦合。 | 评估将部分 `prompts/` 与 workflow 工具模块化为可加载包。 |
| P2 | 扩展事件钩子 | 后续需要对工具调用做策略控制（审计/限权/配额）时，事件钩子比散落 if 更稳。 | 给 worker tool 执行链增加 `before/after/error` hook 接口。 |

## 我们项目是否可直接使用 pi-mono

| 选项 | 可行性 | 判断 |
|---|---|---|
| 直接用 `pi-coding-agent` 替换 mimikit 主系统 | 低 | 架构目标不一致：mimikit 是 `manager-worker-evolver` 编排系统；pi-coding-agent 主要是交互式/会话式编码 harness（README 也明确不内置 sub-agents/plan mode）。 |
| 直接把 `pi-mono` 整仓作为运行时依赖 | 低 | 包面过大（含 TUI/WebUI/Mom/Pods），会引入大量当前不需要的运行面与升级负担。 |
| 局部接入 `@mariozechner/pi-agent-core` 作为 worker 引擎 | 中高 | 可行，但需要适配：任务状态机、结果归档、取消/重试、现有 action 协议与 prompt 构建流程。 |
| 局部接入 `@mariozechner/pi-ai` 作为 LLM 抽象层 | 高 | 与现有 `src/providers/` 边界最接近，迁移成本可控，且能直接获得多 provider + 统一 usage/cost 计算。 |
| 通过 RPC 模式把 pi 当 sidecar | 中 | 能快速试点，但多一层进程协议与运行时治理，长期维护复杂度高于 SDK 直连。 |

## 结论
- 不建议“整套直接替换” mimikit。
- 建议优先试点“局部复用”：
  - 首选：`pi-ai`（统一 provider 抽象）
  - 次选：`pi-agent-core`（增强 worker 事件循环与工具调用模型）
- 若目标是最小风险验证，可先做 1 个 PoC：仅把 `worker standard` 路径替换为 `pi-agent-core + pi-ai`，保持现有 orchestrator/存储/任务协议不变。

## 注意事项
- 上游仓库当前 README 标注了 OSS vacation（截至 2026-02-16 前 issue/PR 暂停），近期协作节奏需预期管理。
- 若后续接入，请优先使用“包级最小依赖”，避免引入 `coding-agent` 的交互 UI 负担。
