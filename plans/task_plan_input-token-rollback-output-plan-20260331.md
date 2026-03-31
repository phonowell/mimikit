# Task Plan: input-token-rollback-output-plan-20260331

类型：implementation + tdd
当前状态：已完成

## 目标

- 基于当前仓库与 2026-03-31 token 收紧实现真相，回滚仍在生效的输入侧上下文裁剪/去重行为。
- 保留与输入裁剪无关的诊断信息，补一份只面向输出侧 token 优化的新方案与自评审。

## 已确认范围

1. task/plan 选择窗收缩
进入条件：`selectRecentTasks` / `selectRecentPlans` 现在优先 active/latest-result/focus，再只补到 `minCount`。
退出条件：恢复为按既有排序窗口取 `maxCount`，不再因为 input token 目标主动缩窗。
验证路径：`tests/plan-select.test.ts`

2. task/plan full-card 输入裁剪
进入条件：state packet 里的 task/plan 只对少数对象保留全文，其余降 card。
退出条件：task/plan 恢复全文 payload；`promptSelection` 可继续存在，但不再出现 card 化裁剪语义。
验证路径：`tests/prompt-task-content-selection.test.ts`

3. 仅输出侧新方案归档
进入条件：完成代码回滚并拿到最新验证结果。
退出条件：形成可审阅报告，明确符合性、是否过度设计、能力增减与暂不实施边界。
验证路径：`plans/report_input-token-rollback-output-plan-20260331.md`

## 执行步骤

1. 回读当前实现、前序归档与 git 事实，确认只有输入侧裁剪需要回滚。
2. 先改测试，锁定“恢复 maxCount 选择窗”和“恢复 task/plan 全文 payload”的目标行为。
3. 最小改动回滚实现，保留 `promptSections` / `promptSelection` 等诊断链路。
4. 运行定向测试、`pnpm review-code-changes`，并补 code-review 结论。
5. 写回 notes/report，明确输出侧方案与当前 git/merge 边界。

## 风险

- 若误把诊断字段一并删掉，会丢失后续输出侧优化所需的观测基础。
- 若只回滚 state packet 而不回滚窗口选择，input 侧优化仍会继续生效。
- 当前 runtime 写边界仅覆盖 worktree；merge/cleanup 是否可闭环需要最后按 git 真相确认。

## 结果

- ✓ 已回滚 task/plan 选择窗、全文/card 裁剪与 system prompt 任务合同去重。
- ✓ `promptSections` / `promptSelection` 诊断链路已保留，不再承担输入裁剪语义。
- ✓ 定向测试与 `pnpm review-code-changes` 已通过。
- → 输出侧方案与 stopReason 已写入 `plans/report_input-token-rollback-output-plan-20260331.md`。
