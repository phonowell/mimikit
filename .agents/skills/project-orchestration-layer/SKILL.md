---
name: project-orchestration-layer
description: 项目级多 worktree 编排与低 token 协议，invoke by explicit user call without condition checks; available on main/worktree-1/2/3 with equivalent slot intelligence and minimal orchestration actions.
---

# Project Orchestration Layer

## 调用方式
- 用户显式调用后生效。
- 不做条件判定，不依赖关键词/分支/上下文推断。

## 角色边界
- `main` 仅编排，禁止业务实现。
- 业务实现仅在 `worktree-1/2/3`；并行上限 `3`。
- 槽位智能与编排层等价；默认全量更新，不留兼容层。

## 执行前硬闸门
- 编辑前必跑：`git rev-parse --abbrev-ref HEAD && pwd`。
- 放行条件：目录命中 `~/Projects/mimikit-worktree-{1,2,3}` 且分支命中 `worktree-{1,2,3}`。
- 未通过：降级“仅编排模式”，仅允许拆解/派发/汇报，禁止实现与提交。

## 防漂移机制
- 每轮声明：`模式=<编排|实现> | 分支=<branch> | 槽位=<worktree-x|none>`。
- 声明缺失、字段不全、或与硬闸门冲突：本轮降级仅编排。
- 切任务/切槽位/准备编辑时，必须重跑硬闸门。

## Plan 隔离
- `main` 与 `worktree-1/2/3` 的 `plans/` 相互独立，禁止跨槽位当真相源。
- 派发任务卡必须包含：`plan_id/当前步骤/已完成/下一步/阻塞`。
- 是否可 `wt-land` 只看本槽位证据：`git status --short`、`git diff --stat`、`lint/type-check/test`。

## 分配防抖策略
- 默认防抖窗口：`30s`。
- `30s` 内有新增约束/补充需求：重置为新的 `30s`。
- 提前派发例外：用户要求立即执行、下游阻塞等待、防抖到点。
- 每次分配记录：`是否触发防抖/等待时长/触发派发原因`。

## 里程碑检查
- 分配前：槽位可访问且边界无交叉；任务卡字段完整。
- 编辑前：首步 `pnpm run wt-rebase`；通过硬闸门；声明 `模式/分支/槽位`。
- 提交前：全量改动已审阅，受影响测试通过，提交信息可追溯 `task-...`。

## 收敛门禁
- `wt-land` 前必须完成 `review-code-changes` 闭环。
- 全量 `lint/type-check/test` 通过后才可 land。
- 无依赖可并行 land；有依赖按拓扑顺序串行 land。

## 违例自动处置
1. 立即停止：发现 `main` 出现实现改动即停写停提。
2. 立即回滚：仅回滚本次越界实现改动到 `HEAD` 干净状态。
3. 记录根因：`触发任务/越界文件/绕过硬闸门原因/防再发措施`。
4. 重新派发：生成新槽位任务卡并指派到 `worktree-1/2/3`。
5. 恢复执行：从“执行前硬闸门”重新开始。

## 低 Token 协议
- 禁用 `fork_context`，每个 agent 只发最小任务卡。
- 默认少中断：仅阻塞或目标变化时中断，并记录原因与成本。
- 编排层按需加载 skill，优先必要编排动作，延后高耗时任务到收敛阶段。
- 状态仅在里程碑汇报：`完成/阻塞/待合并`。
- 对话输出仅四项：`files changed`、`diff --stat`、`3 条关键点`、`命令结论`。
- 测试策略：槽位优先受影响测试；收敛阶段跑一次全量门禁。

## 工作流
1. 预检：确认槽位可用。
2. 分配：按目录边界分槽，避免交叉编辑。
3. 同步：槽位收到任务卡先跑 `pnpm run wt-rebase`。
4. 执行：在各自槽位实现与自检。
5. 收敛：执行 `review-code-changes` + 全量门禁。
6. 回主线：`pnpm run wt-land -- --message "..."`，依赖链按拓扑 land。

## 禁止事项
- 禁止把完整会话上下文广播给全部 agent。
- 禁止重复输出背景信息与长日志。
- 禁止未过门禁直接 `wt-land`。
- 禁止忽略依赖关系并发 land。
