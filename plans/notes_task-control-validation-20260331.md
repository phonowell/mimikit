# notes_task-control-validation-20260331

## Evidence

- `2026-03-29 11:07:15` 的拒绝发生在 manager action validation/apply 前，`log.jsonl:386` 已带出 `taskId=task-5d4d17ff4950445f971baf9225cc5bfa`
- 同轮 trace `0mnbnmzx6mp.txt:959` 记录了非法输出：`task_control(cancel)` 带 `instructions[]`
- 同一任务在 `results/packets.jsonl:5` 与 `history/2026-03-29.jsonl:82` 可还原为标题 `按整体方案继续推进下一项未完成整改`
- 当前用户可见回复 `0mnedzs9lmp.txt:163` 只拼接 hint，本身未带 task 标识

## Root Cause Hypothesis

- 一阶根因：`task_control` 的“仅 resume 允许 instructions”只存在于运行时校验，未收进结构化 schema，导致模型仍可产出语法上可解析但语义非法的 action
- 二阶根因：`task_control` 失败 hint 没有使用 `task_id/title` 上下文，`buildCorrectionFallbackReply` 只拼 hint，最终用户看不到具体是哪个任务

## Constraints

- 只做最小修复，不扩到 task 页面或历史展示重构
- 归档需明确能还原到 `task-5d4d17ff4950445f971baf9225cc5bfa`
