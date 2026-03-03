---
name: project-orchestration-layer
description: 项目级多 worktree 编排与低 token 协议，invoke by explicit user call; enforce hard gates for main/worktree execution.
---

# Project Orchestration Layer

## 调用条件
- 仅在用户显式调用后生效。
- 不依赖关键词、分支名或上下文猜测触发。

## 术语与边界
- `main`：编排层；只做拆解、派发、汇报。
- `worktree-1/2/3`：实现槽位；只在槽位做业务实现与提交。
- `topic-*`：主题台账主键；每个需求只绑定一个主题。
- `req-*`：需求台账主键；记录需求状态与证据。
- `agent-*`：Agent 台账主键；记录任务、边界、状态。

## 编辑前硬闸门
1. 每次准备编辑前执行：`git rev-parse --abbrev-ref HEAD && pwd`。
2. 放行条件同时满足：
- 目录命中 `~/Projects/mimikit-worktree-{1,2,3}`。
- 分支命中 `worktree-{1,2,3}`。
3. 未通过时：强制降级为“仅编排模式”，禁止实现、提交、`wt-land`。
4. `main` 永远禁止实现；只允许派发与汇总。

## 单 Session 多主题并行闸门
- 默认并行：不同 `topic-*` 默认并行执行。
- 并行前必须建账并保持一致：
- `topic` 台账：`topic_id/objective/active_topic/status`。
- `req` 台账：`req_id/topic_id/status/evidence/source`。
- `agent` 台账：`agent_id/topic_id/task/file_boundary/status`。
- 可验证定义：
- `合法 active_topic`：存在于 `topic` 台账且 `status=active`。
- `file_boundary`：每个 agent 的仓内相对路径前缀集合。
- `同一验收项`：相同 `acceptance_id` 的需求项。
- 并行放行条件（全部满足）：
- 每个并行单元声明合法 `active_topic`。
- 每个并行单元独立 `agent-*` 与独立 `file_boundary`。
- 所有 `req-*` 可映射到唯一 `topic-*`。
- 并行阻断条件（命中任一即转串行）：
- 文件边界重叠（任意两个 `file_boundary` 前缀集有交集）。
- 同一验收项或同一发布动作存在依赖冲突。
- 任一台账字段缺失或映射不一致。
- 跨主题执行限制：
- 执行单元只能处理其 `active_topic` 绑定的 `req-*`。
- 切换主题前必须登记：`from_topic/to_topic/reason/open_reqs`。

## 多 Agent 强制闸门
- 进入实现模式后，编辑前默认先派发 `>=2` 个 Agent。
- 最小角色集合：`1` 个实现 Agent + `1` 个评审 Agent。
- 受限降级：仅当并发/额度限制导致无法满足 `>=2` 时，可临时降级为 `1` 实现 Agent + 主控复核；必须登记 `degrade_reason/补审时间点`，并在收敛前补做独立评审。
- 主控（编排层）直接改实现文件视为违例。
- 每轮必须记录 Agent 台账字段：
- `agent_id/role/topic_id/req_ids/file_boundary/status/evidence`。
- 任一字段缺失：禁止进入编辑。

## 违例自动处置闭环
- 触发条件：
- 漏记需求、跨主题执行、未满足多 Agent、主控直接实现、台账缺失。
- 闭环步骤（固定顺序）：
1. `停止`：立即停写、停提、停收尾。
2. `预检`：先执行 `git rev-parse --abbrev-ref HEAD && pwd`；仅当分支/目录命中“编辑前硬闸门”才允许自动回滚，否则转人工确认。
3. `回滚`：默认非破坏回滚：`git restore --staged --worktree <scope>` → `git status --short`。
4. `彻底回滚（可选）`：仅在用户明确要求时执行 `git reset --hard HEAD` → `git clean -fd`。
5. `重建台账`：补齐 `topic/req/agent` 缺失字段与映射。
6. `重派发`：按最新台账重新派发 Agent，重划文件边界。
7. `复验`：完成放行证据后才恢复执行。
- 复验放行证据（缺一不可）：
- `需求一致性`：`req-*` 与用户最新要求一致。
- `主题一致性`：`active_topic` 与执行动作一致。
- `Agent 一致性`：最小双 Agent 与台账字段完整；若已登记降级，则需补审完成证据。
- `环境一致性`：分支/目录再次通过“编辑前硬闸门”。

## 里程碑与输出
- 分配前：确认边界无交叉、台账完整。
- 编辑前：任务开始后的首次编辑前跑一次 `pnpm run wt-rebase`，后续仅在同步主线时再跑。
- 收敛前：完成 `review-code-changes`。
- `wt-land` 前：`lint/type-check/test` 全通过；有依赖按拓扑串行 land。
- 对外里程碑摘要只保留四项：`files changed`、`diff --stat`、`3 key points`、`command verdicts`。
- 台账与复验证据不因“四项摘要”而省略；需在 `command verdicts` 中给出证据路径或核验结果。

## 禁止事项
- 禁止在 `main` 做业务实现。
- 禁止未过硬闸门直接编辑或提交。
- 禁止跳过多 Agent 派发直接进入实现。
- 禁止忽略依赖关系并发 `wt-land`。
