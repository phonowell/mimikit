# Implementation Plan: 测试 ROI 评分与后 20% 淘汰

- Task: `task-48b80de4a049414893b9dbfaec353418`
- Type: `cleanup`
- Status: `completed`

## Phase 1 Inventory and Rubric
- Entry: 已读取任务合同，当前 worktree 干净。
- Exit: 明确测试入口、评分单位与 ROI rubric，并拿到全量测试文件清单。
- Verification: 记录 `package.json` 测试脚本、`tests/**/*.test.ts` 总量与排除规则。

## Phase 2 ROI Scoring and Cutline
- Entry: 测试清单已固定。
- Exit: 产出全量 ROI 评分表，解释最低约 20% 的共同特征与删除边界。
- Verification: 保留评分工件，能追溯每个被淘汰文件的得分依据。

## Phase 3 Test Pruning
- Entry: 已确定淘汰集合。
- Exit: 删除或停用低 ROI 测试，并完成最小联动修改，保证测试结构仍可运行。
- Verification: `git diff` 仅包含测试相关改动与必要记录文件。

## Phase 4 Validation and Handoff
- Entry: 测试清理已完成。
- Exit: 跑完相关验证，整理淘汰集合、验证结果、残余风险与证据路径。
- Verification: 至少执行针对性测试、全量测试与类型/构建相关校验中的必要集合。

## Progress Log
- 2026-04-16: 已读取任务合同、确认 worktree 干净，并以 `tests/**/*.test.ts` 为评分单位盘点出 `95` 个测试入口。
- 2026-04-16: 已建立四档 ROI rubric，按“关键主链/独特覆盖/维护成本/脆弱度”复核底部候选，并删除 `19` 个 `1/5` 低 ROI 测试入口。
- 2026-04-16: 已产出 `plans/report_roi-test-prune-20260416.md`，记录全量排序、切线与删除依据。
- 2026-04-16: 已执行 `pnpm run lint:changed-tests`、`pnpm run type-check`、`pnpm test`，其中 `pnpm test` 结果为 `76` 个文件、`285` 条测试全部通过。
