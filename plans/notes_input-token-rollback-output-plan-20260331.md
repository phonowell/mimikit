# Notes: input-token-rollback-output-plan-20260331

## 当前事实

- 用户最新输入 `input-711b7f9127f5441ab63cb0c84e538fc8` 明确要求“不要动输入侧，只想优化输出侧；先回滚，再出新方案”。
- 前序归档 `task-b455b1fc1b9e46db80cf2f41212018c0` 已把当前 input token 降幅主因收敛为 `975a2310 feat: tighten manager token prompt budget`。
- 该提交里的输入侧优化核心是两类：选择窗收缩、task/plan full-card 裁剪；`promptSections` / `promptSelection` 属于诊断观测，不直接压缩输入。

## 回滚原则

- 只撤销输入侧 token/context 裁剪与去重方向的行为变化，不回滚无关修复。
- 优先恢复既有全文上下文语义，避免引入新的协议层或兼容壳。
- 保留可用于后续输出侧优化的观测字段与记录链路。

## 待完成

- 用失败测试锁定回滚目标。
- 回滚实现后补最小报告，明确输出侧方案只提案、不实施。
- 以 `pnpm review-code-changes` 和 code-review 结果决定是否具备进一步 git 闭环条件。

## 实施结果

- 已用失败测试锁定三处回滚目标：
  - `tests/plan-select.test.ts`
  - `tests/prompt-task-content-selection.test.ts`
  - `tests/manager-project-profile-prompt.test.ts`
- 已删除 `src/foundation/prompting/task-prompt-entry-format.ts` 与 `src/foundation/prompting/task-prompt-selection.ts`，避免继续保留只服务输入裁剪的壳文件。
- `format-task-content.ts` 与 `format-plan-content.ts` 已恢复全文 payload，同时继续输出 `promptSelection` 统计，当前统计语义变为 `full=selected`、`card=0`。
- `plan-select.ts` 已恢复既有排序窗口行为；不再用 active/latest-result/focus 规则主动压缩默认注入集合。
- `prompts/manager/system.md` 已恢复显式任务合同字段列表与 `instructions[]` 边界说明。

## 验证结果

- `pnpm vitest run tests/plan-select.test.ts tests/prompt-task-content-selection.test.ts tests/manager-project-profile-prompt.test.ts`
  - passed
- `pnpm review-code-changes`
  - passed
  - 全量结果：149 files / 452 tests passed

## 复盘

- 本轮删减优先于保留：直接删除两份仅服务 full/card 裁剪的新文件，比在原结构上继续打条件分支更小、更硬。
- 当前未闭环点只剩 `main` merge/cleanup；原因不是代码或门禁失败，而是本任务 runtime 的写边界只覆盖当前 worktree。
