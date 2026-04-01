# Report: input-token-rollback-output-plan-20260331

## 输入侧回滚结论

- 已按最小范围回滚当前仍在生效的输入侧 token/context 优化。
- 本次确认并回滚的输入侧项只有三类：
  - `src/surface/read-model/plan-select.ts`
    - 回滚 `task/plan` relevance window；不再只补到 `minCount`，恢复按既有排序取 `maxCount`。
  - `src/foundation/prompting/format-task-content.ts`
    - 回滚 task full/card 裁剪；恢复所有已选 task 都输出完整合同。
  - `src/foundation/prompting/format-plan-content.ts`
    - 回滚 plan full/card 裁剪；恢复所有已选 plan 都输出完整 `task_contract`。
  - `prompts/manager/system.md`
    - 回滚任务合同字段去重；恢复显式字段枚举与 `instructions[]` 边界说明。
- 保留项：
  - `promptSections` / `promptSelection` 诊断链路保留；它们只做观测，不再承担输入裁剪行为。

## 直接证据

- `975a2310 feat: tighten manager token prompt budget`
  - 前序归档已将本轮 input token 降幅主因收敛为该提交。
- `plans/report_manager-token-tighten-20260331.md`
  - 明确写明当时的三项输入侧优化：selection window、task/plan full-card、system prompt 去重。
- `/Users/mimiko/Projects/mimikit/.mimikit/tasks/2026-03-31/task-b455b1fc1b9e46db80cf2f41212018c0_mimikit-tokens-output-toke.md`
  - 明确把 input token 下降归因到 manager 上下文裁剪与去重，并指出 output token 并未同步显著下降。

## 输出侧新方案

- 立即可推进：
  - 收紧 `enqueue_task` / `set_plan.plan.task` 的生成预算。
    - 只压 manager 自己产出的 `goal`、`in_scope[]`、`out_of_scope[]`、`done_when[]`、`instructions[]` 文本长度，避免同义重复和多段解释。
    - 配套做法应是提示词约束 + action validation 上限，而不是新增协议别名或隐藏默认值。
  - 优先复用已有任务而不是重发整份新合同。
    - 当同一 focus / cwd / 合同方向明确连续时，优先 `task_control(resume)` 搭配最短 `instructions[]`，避免重复输出整份 `enqueue_task` JSON。
- 需要额外验证：
  - 对 `done_when[]` 与 `instructions[]` 的字数上限要做红线验证，确认不会把验收标准压得过短而损伤可执行性。
  - `resume` 优先策略需要结合 intent-evidence guard 验证，避免把真正的新任务误折叠成旧任务续跑。
- 不建议采用：
  - 新增“短别名字段 / 模板 ID / 哈希引用 / 宏指令”一类压缩协议。
  - 这会把可审计任务合同改成隐式引用，违背文件系统真相源与低心智负担目标。

## 自评审

- 是否符合项目目标：符合。
  - 回滚后主线程不再依赖输入裁剪去省 token；输出侧方案只约束 manager 自己的输出合同，更贴近“极简编排层”。
- 是否过度设计：当前提案不过度设计。
  - 立即可推进项都建立在现有 action schema、validation 与续跑语义上，不需要新增状态层或协议层。
- 对项目能力的增减影响：
  - 增加：恢复默认历史覆盖面与合同全文可见性。
  - 减少：input token 成本会回升到收紧前区间。
  - 输出侧方案若后续落地，预计减少的是 manager 输出 JSON 长度，不应削弱输入上下文或 worker 执行面。

## 验证

- `pnpm vitest run tests/plan-select.test.ts tests/prompt-task-content-selection.test.ts tests/manager-project-profile-prompt.test.ts`
  - passed
- `pnpm review-code-changes`
  - passed
  - 全量结果：149 files / 452 tests passed
- `code-reviewer`
  - 范围：当前 diff
  - 结果：未发现 P0/P1/P2 阻塞问题；仅发现一处测试文件格式 warning，已在本轮修正。

## Git 真相

- 当前分支：`task/mimikit-token-1cdb6fd028`
- stopReason：`main_merge_blocked_by_runtime_boundary`
- 原因：
  - 当前 runtime contract 只允许在当前 `work_dir` 内推进；本轮可在 task worktree 完成回滚与验证，但未继续操作主仓 `main` worktree 与 cleanup。
- 下一步：
  - 在允许写主仓的运行时中，从当前 task branch 做 `main` fast-forward/merge，并执行对应 worktree/branch cleanup。
