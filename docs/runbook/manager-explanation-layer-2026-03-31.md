# Manager Explanation Layer 2026-03-31

## Scope

- 任务：在不改动 manager 决策层与高风险门禁的前提下，最小补强用户可见的 task-result 解释层。
- 约束：不碰 focus 选择、action 合法性、intent-evidence guard、任务合同与 worker 执行协议。
- 目标：让 task 结果回复更可定位、可验证、少歧义，尤其补足 task 标识、停下原因与归档缺失说明。

## 现状回读

- `prompts/manager/system.md` 已要求“涉及 task 结果必须附任务归档链接”。
- `src/policy/manager/direct-task-result-reply.ts` 会在单条 compact 成功结果时直接回给用户。
- `src/policy/manager/loop-helpers.ts` 会在 manager fallback 场景下生成稳定 task-result reply。
- 以上两条用户可见路径此前都缺少稳定的 task id 暴露；fallback 在无 handoff summary 时只会回落到英文通用句式，也不会把 `stopReason` 明确露出。

## 方案

- 只抽一层 `src/policy/manager/task-result-visible-reply.ts`，统一负责 manager 用户可见的 task-result 表达。
- 统一输出结构保持最小：
  - 第一行显式暴露 task title / id 与结果状态
  - 第二行保留压缩后的结果正文（若有）
  - 失败 / 取消 / 停下时补 `停下原因：<stopReason>`，对 `input_required` / `guard_rejected` 增加最小中文提示
  - 最后一行始终给出 `任务归档` 链接或 `任务归档: 未生成`
- 不改 `resolveTaskResultSummary()`、prompt digest、action guard 与任何调度逻辑，避免把“解释层增强”扩散回决策面。

## 自评审

- 与任务目标一致：本轮只动 manager 用户可见回复层，不改 action 选择与 guard。
- 不过度设计：仅新增一个具名职责文件，服务两个已存在的用户可见 reply 接缝。
- 可验证性提升：
  - 任务能直接定位到 `task title / id`
  - 失败 / 停下能看到 `stopReason`
  - 归档缺失不再隐含，需要明确显示 `任务归档: 未生成`
- 保守取舍：未把 task id 注入更底层通用 summary helper，避免影响 manager 内部 digest 与决策上下文噪音。

## 修改点

- 新增 `src/policy/manager/task-result-visible-reply.ts`
- 更新 `src/policy/manager/direct-task-result-reply.ts`
- 更新 `src/policy/manager/loop-helpers.ts`
- 更新 `prompts/manager/system.md`
- 更新 `docs/design/workflow/task.md`
- 更新 `tests/manager-task-result-direct-reply.test.ts`
- 更新 `tests/manager-loop-helpers.test.ts`

## 验证

- Red: `pnpm vitest run tests/manager-task-result-direct-reply.test.ts tests/manager-loop-helpers.test.ts`
  - 结果：按预期失败，暴露当前回复缺少 task id 与 `stopReason`。
- Green: `pnpm vitest run tests/manager-task-result-direct-reply.test.ts tests/manager-loop-helpers.test.ts`
  - 结果：通过。
- Code review:
  - 范围：`src/policy/manager/{task-result-visible-reply,direct-task-result-reply,loop-helpers}.ts`、`prompts/manager/system.md`、`docs/design/workflow/task.md`、对应测试与本归档
  - 结果：未发现需要阻塞合并的 P0/P1/P2 问题；新增 helper 职责单一，且未回渗到 manager 决策层
- Gate 1: `pnpm type-check`
  - 首次结果：失败；命中 `exactOptionalPropertyTypes`，已改为条件展开 `task/detail` 并收紧 `stopReason` 类型读取
  - 二次结果：通过。
- Gate 2: `pnpm review-code-changes`
  - 结果：通过（147 files / 449 tests）。

## 当前状态

- 解释层最小改动已落地到 code + prompt + doc + tests。
- 决策层、guard、任务合同与 worker 协议保持不变。
- 当前 worktree 质量门禁已通过。
- `main` 当前在另一 worktree（`/Users/mimiko/Projects/mimikit`）检出；本次 worker runtime 写边界仅覆盖当前 worktree，尚未在本轮内执行 merge back / cleanup。
