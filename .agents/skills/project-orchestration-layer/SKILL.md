---
name: project-orchestration-layer
description: 项目级多 worktree 编排与低 token 协议，use when user explicitly says “你是编排层” or “orchestration layer” and current branch is main; coordinate worktree-1/2/3 with agent-only orchestration and concise milestone reporting.
---

# Project Orchestration Layer

## 硬触发条件
- 仅在用户明确要求进入编排层模式时启用（例如：`你是编排层`、`orchestration layer`）。
- 仅在当前分支为 `main` 时启用。
- 任一条件不满足：不启用本 skill，先说明原因并等待用户确认。

## 角色边界
- 默认只做编排，不直接写业务代码。
- 在 `main` 一律禁止直接修改业务代码（包括小改动/顺手修复）。
- 业务代码改动必须派发到 `worktree-1/2/3` 槽位执行。
- 并行上限固定为 `3`，与 `worktree-1/2/3` 一一对应。
- 所有实现默认全量更新，不留兼容层；如有必要需同步更新相关文档。

## 越界复盘与防复发规则
- 犯错原因：把临时修复当作编排动作，进入编辑前未确认是否处于 `worktree` 槽位，导致在 `main` 直接改了业务代码。
- 解决方案：编辑前必须先确认“当前操作是否在 `worktree-1/2/3` 槽位”；若不在槽位，禁止修改任何业务文件，只能执行编排与派发。
- 越界处置：一旦发生在 `main` 直改业务代码，立即回滚该改动，并改为槽位任务卡派发执行，再回报里程碑状态。

## 低 Token 协议
- 禁用 `fork_context`，每个 agent 只发最小任务卡。
- 任务卡仅包含：目标、文件边界、验收命令、禁止项。
- 对已启动子进程/agent 的中断先评估浪费，默认不中断；仅在阻塞或目标已变化时中断，且必须记录中断原因与成本。
- 对 token 极度敏感：优先最小输入、最少轮次，避免重复上下文与无效轮询。
- 状态回报只在里程碑触发：`完成`、`阻塞`、`待合并`。
- 对话中仅回：`files changed`、`diff --stat`、`3 条关键点`、`命令结论`。
- 长日志写入本地文件，主对话只给路径与摘要。
- 槽位内优先跑受影响测试；全量 `lint/type-check/test` 只在收敛阶段跑一次。

## 工作流
1. 预检：确认 `main`、确认 `worktree-1/2/3` 存在且可用。
2. 分配：按目录边界给 3 个 agent 分槽，避免交叉编辑。
3. 同步：开工前执行 `pnpm run wt-rebase`；落地前再执行一次。
4. 执行：agent 在各自槽位完成改动与自检。
5. 收敛：统一执行 `review-code-changes`，再跑全量门禁。
6. 回主线：`pnpm run wt-land` 必须串行执行，固定顺序 `worktree-1 -> worktree-2 -> worktree-3`；任一槽位未完成前禁止启动下一槽位，最后在 `main` 做一次最终验证。

## 能力缺口处理
- 若出现 skill 生命周期问题（搜索/新增/替换/移除），立即调用 `audit-skill-lifecycle`。
- 若仅为实现细节问题，不触发 skill 生命周期治理，直接按现有能力推进。

## 汇报模板
- 进度：`{当前}/{总数}`
- 每槽位：`状态 | 改动文件数 | 关键风险(最多1条)`
- 合并阶段：`是否可 land | 阻塞项 | 下一动作`

## 禁止事项
- 禁止把完整会话上下文广播给全部 agent。
- 禁止重复输出相同背景信息与长篇日志。
- 禁止未过门禁直接 `wt-land`。
- 禁止并发执行 `wt-land`（仅允许按槽位顺序串行执行）。
