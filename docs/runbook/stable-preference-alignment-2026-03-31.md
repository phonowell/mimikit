# stable preference alignment

> Historical note (2026-04-16): this runbook predates the 2026-04-15 manager simplification. Current implementation still keeps stable preference alignment in `remember_memory` plus manager prompt rules, but manager authorization no longer uses the deleted `intent-evidence` layer, `tests/manager-project-profile-prompt.test.ts` has been removed, and the current full-suite baseline is `95` files / `327` tests.

## Goal

- 在不新增策略层的前提下，最小固化“用户稳定偏好对齐”能力。
- 继续沿用 `memory + prompt rule` 路线，只收紧稳定偏好的作用域与禁区。

## Short plan and self-review

- 方案：把最小落地点放在 manager system prompt 与 memory 主规范，不新增并行记忆通道、推断器、评分器或画像层。
- 自评审：该方案符合项目目标，因为它继续依赖显式来源、repo 作用域和现有 guard，只把“可影响什么 / 不可影响什么”固化成可验证规则。
- 过度设计评估：低。没有新增状态层、配置面板、独立策略模块或隐式偏好学习流程。
- 能力影响：增强 manager 对稳定偏好的承接一致性；不放宽高风险动作门禁，不扩大长期记忆边界。

## Decision

- `remember_memory` 继续承接稳定偏好与 repo 规则。
- 稳定偏好只允许影响表达方式、推进节奏、任务粒度与解释风格。
- 稳定偏好不得改写用户目标、验收标准、`task/plan/focus/memory` 分层。
- 稳定偏好不得把一次性安排、当前状态或临时判断升级为长期规则。
- 稳定偏好不得绕过当前 action 合法性与高风险门禁，也不得直接触发或放宽高风险 action。

## Changes

- 在 `prompts/manager/system.md` 新增稳定偏好作用域规则，明确允许面与禁止面。
- 在 `docs/design/workflow/memory.md` 新增“稳定偏好对齐边界”章节，补齐主规范。
- 在 memory 主规范与 manager prompt 中锁定偏好作用域与门禁文案。

## Why this stays minimal

- 没有新增独立策略层、用户画像系统、偏好推断器或评分器。
- 没有修改 `task` / `plan` / `focus` / `memory` 分层，也没有新增兼容壳。
- 没有放宽 provenance、runtime 合法性或高风险 action 规则。

## Validation

- Historical verification:
  - 原始改动当时通过了对应 prompt 回归；该专用测试已在后续 ROI prune 中删除，不再是当前仓库验证入口。
- Current verification baseline:
  - 当前全量测试基线为 `95` files / `327` tests passed。
- Code review:
  - 按最近 diff 复盘 `prompts/manager/system.md` 与 `docs/design/workflow/memory.md`，未发现 P0/P1/P2 问题；改动维持单一路径、无重复抽象与无兼容层扩张。
- Gate: `pnpm review-code-changes`
  - 通过，包含 `lint`、`lint:changed-tests`、`type-check`、`build:webui` 与全量 `vitest run`。

## Remaining boundary

- 本轮只固化“偏好如何影响编排风格”的边界，不做自动识别增强或更强排序逻辑。
- 后续若要增强承接，仍应优先复用当前显式来源和 repo 作用域，不应回到黑盒偏好层。

## Git lifecycle

- Worktree branch: `task/wt-e7871efffc`
- Feature commit: `940e1018` (`feat: align stable preference boundaries`)
- Merge-back: fast-forwarded into `main`
- Cleanup: worktree / branch cleanup handled after merge
