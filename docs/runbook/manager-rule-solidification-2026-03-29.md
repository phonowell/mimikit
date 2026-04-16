# Manager Rule Solidification 2026-03-29

> Historical note (2026-04-16): this runbook captures an intermediate rule set. The later 2026-04-15 simplification removed the `intent-evidence` layer and pruned `tests/manager-project-profile-prompt.test.ts` / `tests/manager-enqueue-task-guard.test.ts`. Treat the sections below as historical context, not the current live guard surface.

## Scope

- 任务：把可跨项目复用的 manager 编排规则，从口头约定收敛为仓库内可复用表达。
- 约束：只固化通用 manager 规则，不把 MIMIKIT repo 特有开发流程提升成通用规则。
- 结果：保留通用的 prompt/doc/code/test 固化；撤回误提升到通用层的 repo 特有 worktree 闭环规则。

## 现状回读

- `prompts/manager/system.md` 已承载 manager 身份、决策边界、任务合同与输出协议。
- `prompts/manager/action-surface.md` 与 `docs/design/workflow/action.md` / `docs/design/workflow/task.md` 已承载 action/task 契约说明。
- `src/policy/manager/action-validation.ts` 已在 schema 校验后接入 manager 级 guard。
- `src/policy/manager/action-validation-enqueue-task.ts` 当前最合适的代码守护点是同批次 `enqueue_task` 的目录冲突校验。
- 当时由 `tests/manager-project-profile-prompt.test.ts` 与 `tests/manager-enqueue-task-guard.test.ts` 覆盖提示词与 guard 的最小稳定契约；这两条测试已在后续 ROI prune 中删除。

## 规则拆分

### 纳入通用固化

1. 证据充分时默认推进，不把可执行事项退回成多余追问。
   - 层级：`prompts/manager/system.md` + `docs/design/workflow/action.md`
   - 原因：这是 manager 决策边界，不依赖仓库实现细节。
2. 当时的 intent-evidence guard 按风险分级工作，而不是做字面重叠卡死。
   - 层级：`prompts/manager/system.md` + `docs/design/workflow/action.md`
   - 原因：这是通用门禁原则，适合落在提示与规则文档，不必再加重复代码分支。
3. 默认粗粒度派单；只有目录边界独立且互不冲突时才并发多个 `enqueue_task`。
   - 层级：`prompts/manager/system.md` + `prompts/manager/action-surface.md` + `docs/design/workflow/action.md` + `docs/design/workflow/task.md` + `src/policy/manager/action-validation-enqueue-task.ts` + `tests/manager-enqueue-task-guard.test.ts`（历史）
   - 原因：既是通用编排原则，也能在当前校验层低成本做硬拒绝，回归价值高。
4. 输出 action 前逐字段按当前契约做硬检查。
   - 层级：已存在于 `prompts/manager/system.md`、`src/policy/manager/action-validation.ts`、`src/policy/manager/manager-turn-schema.ts`
   - 原因：实现已具备，不需要重复新增守护。

### 判定为 repo 特有，因此不纳入通用固化

1. 当前仓库写任务默认必须 `use_worktree=true`，并进入 review / merge / cleanup 闭环。
   - 理由：依赖 MIMIKIT 当前仓库的 git/worktree 运维流程，不是所有 manager 场景都成立。
   - 处理：保留在 repo 级约束（如 `CLAUDE.md` / 任务合同）中，不再出现在通用 manager prompt/doc/code guard。
2. `pnpm review-code-changes`、merge back、cleanup 属于当前仓库交付流程。
   - 理由：这是本仓库的交付门禁，不是通用 manager 编排规则。
   - 处理：只在本次归档与 git 生命周期里记录，不写入通用规则层。

## 自评审

- 与目标一致：本轮只保留跨项目可复用的 manager 编排原则，把 repo 级 worktree 闭环从通用表达层拿掉。
- 没有过度设计：只保留一个代码守护点，即目录冲突 fan-out；其余规则落在提示/文档层，避免同义重复。
- 能力变化：manager 仍会被提示优先推进、按风险分级判断、默认粗粒度派单；但不再把 MIMIKIT 自身 worktree 流程误当成通用 manager 规则。
- 不把 repo 规则泛化的原因：`use_worktree=true`、review/merge/cleanup 依赖当前仓库的执行模式与运维流程，脱离该仓库并不成立。

## 修改点

- 从通用提示与规则文档中移除 startup worktree 强制 `use_worktree=true` 的表述。
- 从 `src/policy/manager/action-validation-enqueue-task.ts` 中移除对应硬校验，仅保留同批次重叠目录 fan-out 拒绝。
- 用最小测试守护“通用 prompt 不再包含 repo 特有 worktree 规则”与“fan-out 目录冲突 guard 仍然存在”。

## 验证

- Red: `pnpm vitest run tests/manager-enqueue-task-guard.test.ts tests/manager-project-profile-prompt.test.ts`
  - 结果：先因 `tests/manager-project-profile-prompt.test.ts` 断言失败，确认通用 prompt 仍包含 repo 特有 worktree 规则；这两条测试已在后续 ROI prune 中删除。
- Green: `pnpm vitest run tests/manager-enqueue-task-guard.test.ts tests/manager-project-profile-prompt.test.ts`
  - 结果：当时通过；当前仓库不再保留这两条测试文件。
- Code review:
  - 范围：当前 diff（prompt/doc/guard/test + 本归档）
  - 结果：未发现需要阻塞合并的 P0/P1/P2 问题；当前实现保持最小化，只保留 fan-out 目录冲突硬守护。
- Gate 1: `pnpm review-code-changes`
  - 首次结果：失败；`tests/manager-enqueue-task-branch-override.test.ts` 命中 5000ms 超时。
  - 复核：单独重跑 `pnpm vitest run tests/manager-enqueue-task-branch-override.test.ts -t "reuses existing auto-generated worktree for the same semantic task"` 通过，判定为偶发超时而非本次改动引入。
  - 二次 fresh 结果：`pnpm review-code-changes` 全量通过。

## 当前状态

- 通用规则固化已收敛到 prompt/doc/code/test 的最小组合。
- repo 特有 worktree 闭环规则已从通用层回撤。
- `code-reviewer` 与 `pnpm review-code-changes` 已通过。
- merge back / cleanup 尚未执行；当前 runtime 写边界只覆盖本 worktree，无法在本次任务内安全切回主 worktree 并清理外部 worktree/branch。
