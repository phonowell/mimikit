# stable preference alignment

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
- 稳定偏好不得绕过 `intent-evidence guard`，也不得直接触发或放宽高风险 action 门禁。

## Changes

- 在 `prompts/manager/system.md` 新增稳定偏好作用域规则，明确允许面与禁止面。
- 在 `docs/design/workflow/memory.md` 新增“稳定偏好对齐边界”章节，补齐主规范。
- 在 memory 主规范与 manager prompt 中锁定偏好作用域与门禁文案。

## Why this stays minimal

- 没有新增独立策略层、用户画像系统、偏好推断器或评分器。
- 没有修改 `task` / `plan` / `focus` / `memory` 分层，也没有新增兼容壳。
- 没有放宽 provenance、intent-evidence 或高风险 action 规则。

## Validation

- RED: `pnpm test -- tests/manager-project-profile-prompt.test.ts`
  - 失败，缺口是 manager system prompt 尚未固化“稳定偏好”作用域。
- GREEN: `pnpm test -- tests/manager-project-profile-prompt.test.ts`
  - 通过，当前 Vitest 汇总为 `145` files / `442` tests passed。
- Code review:
  - 按最近 diff 复盘 `prompts/manager/system.md`、`docs/design/workflow/memory.md`、`tests/manager-project-profile-prompt.test.ts`，未发现 P0/P1/P2 问题；改动维持单一路径、无重复抽象与无兼容层扩张。
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
