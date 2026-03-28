# Notes: manager 空 reply 噪声修复

## Contract Conflicts Resolved
- 任务合同内 `tasks/2026-03-28/...` 路径在仓库根不存在；真实证据路径位于 `.mimikit/tasks/2026-03-28/task-95ba95fdf9c64e93939102769da21c7b_task.md`。
- 以真实归档与代码现状为准，未发现只读结论与当前主线代码冲突。

## Root Cause
- `processManagerBatch()` 在 manager 返回空 `parsed.text` 时无条件走 `buildFallbackReply()`。
- `buildFallbackReply()` 在无 result summary 时读取 `prompts/manager/fallback-reply.md`，正文为 `继续处理。`。
- 该 fallback 经 `appendManagerReply()` 写成普通 `role:"agent"` 历史消息，因此进入 WebUI 主对话。
- 已证实高频触发源是仅含 `worker_slot_freed` / `trigger_fire` 的 system-only 唤醒批次；trace 末尾输出均为 `{"reply":"","actions":[]}`。

## Minimal Fix Hypothesis
- 仅在以下条件同时满足时 suppress fallback agent reply:
- `normalizedReplyText === ''`
- `results.length === 0`
- `agentInputs.length > 0`
- `agentInputs` 全部为 `worker_slot_freed` 或 `trigger_fire` system input
- 其余路径保持原样，包括 direct task result reply、普通用户输入轮次、manager failure fallback。

## Self Review
- 方案符合项目目标：只收紧 manager 主回复链路，不引入新状态层、不改消息体系、不加配置。
- 方案不过度设计：只对两类已证实噪声触发源开洞，保留现有 fallback 作为其它轮次的兜底。
- 状态反馈评估：不会削弱必要结果反馈，因为 task result 已有 direct reply，plan/task 状态已有 system event；去掉的只是无新信息的普通 agent 填充文案。
- 潜在风险：若未来把 `trigger_fire` / `worker_slot_freed` 用作某些外部通道保活信号，这个 suppress 会让那类场景不再出现普通 agent 文本；当前没有直接证据表明该信号必需。

## Execution Notes
- TDD red: `pnpm vitest run tests/manager-loop-helpers.test.ts tests/manager-trigger-capacity.test.ts` 首轮失败，两个新增断言都捕获到 `继续处理。`
- TDD green: 同一命令在修复后通过；扩展命令 `pnpm vitest run tests/manager-loop-helpers.test.ts tests/manager-trigger-capacity.test.ts tests/manager-task-result-direct-reply.test.ts tests/manager-loop-batch-failure-recovery.test.ts` 也通过。
- Quality gate: `pnpm review-code-changes` 首轮因 worktree 缺少 `node_modules/tsx/dist/cli.mjs` 失败；执行 `pnpm install` 后重跑通过，说明失败为 worktree setup 缺口而非修复回归。
