# 修复归档：manager 空 reply 触发的“继续处理。”噪声

## 问题链路
- 已有只读结论确认：`继续处理。` 来自 `prompts/manager/fallback-reply.md`，由 `src/policy/manager/loop-batch.ts` 在空 `parsed.text` 时注入。
- 高风险批次是仅由 `worker_slot_freed` / `trigger_fire` 唤醒的 system-only rounds；这些轮次没有用户问题、没有 result 可转述，却会把空 reply 填成普通 agent 文本。

## 最小方案
- 在 `processManagerBatch()` 中识别“system-only trigger wake + empty reply + no results”条件。
- 命中时仍正常消费 batch、执行 actions、持久化状态，但跳过 `buildFallbackReply()` 与 `appendManagerReply()`。
- 非上述条件保持现状，避免扩散为全面消息链路重写。

## 自评审结论
- 通过。
- 原因 1：修复点与只读证据一致，直接命中根因，不触碰 worker/result/chat-view 等无关层。
- 原因 2：不会引入新的配置、模板或抽象壳，复杂度最低。
- 原因 3：必要状态反馈仍由 task result 直出、task/plan system event 承载；被移除的是无新增信息的兜底噪声。

## Verification Ledger
- Baseline worktree: `task/manager-empty-reply-noise-fix-86b952cfcfe6`
- Baseline command: `pnpm vitest run tests/manager-loop-helpers.test.ts tests/manager-trigger-capacity.test.ts`
- Result: passed on clean branch before edits
- Red command: `pnpm vitest run tests/manager-loop-helpers.test.ts tests/manager-trigger-capacity.test.ts`
- Red result: 新增两条测试先失败，确认当前会写出 `继续处理。`
- Green command: `pnpm vitest run tests/manager-loop-helpers.test.ts tests/manager-trigger-capacity.test.ts tests/manager-task-result-direct-reply.test.ts tests/manager-loop-batch-failure-recovery.test.ts`
- Green result: `4` files `17` tests全部通过
- Quality gate: `pnpm review-code-changes`
- Quality gate result: 通过；期间先暴露出 worktree 缺少 `tsx` 运行时依赖，补 `pnpm install` 后重跑通过

## 实施结果
- `src/policy/manager/loop-batch-reply.ts` 新增单责回复决策层，负责判断是否 suppress 空 reply trigger-wake 噪声，并在需要时再解析 fallback reply。
- `src/policy/manager/loop-batch.ts` 保留批处理主流程，只调用新模块决定是否追加用户可见回复。
- `tests/manager-trigger-capacity/static-scenarios.ts` 新增两条回归测试，分别覆盖 `worker_slot_freed` 与 `trigger_fire` 的空 reply 噪声抑制。
- `tests/manager-trigger-capacity/testkit.ts` 新增 history 读取辅助，供上述回归测试验证是否出现 `继续处理。`

## Code Reviewer
- 结论：未发现 P0-P3 级剩余问题。
- 关注点：确认 suppress 条件只命中已证实的 system-only trigger wake 批次，不影响 direct task result reply 与 manager failure fallback。
