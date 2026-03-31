# task_control 校验失败复盘与修复

## 结论

- 2026-03-29 11:07:15 这次失败不是 worker 执行失败，而是 manager 产出了一个语义非法但当时仍能通过结构化解析的 `task_control(cancel)`；它错误地携带了 `instructions[]`，随后被 task_control 校验拒绝。
- 当前可见证据足以还原到具体任务：`task-5d4d17ff4950445f971baf9225cc5bfa`，标题为 `按整体方案继续推进下一项未完成整改`。
- 用户之所以看不到具体任务，是因为当时用户可见回复只拼接通用 hint，而 task_control 失败 hint 本身没有带 `task_id/title`。

## 根因与失败层级

1. 生成层缺口
   - `task_control` 的“仅 `resume` 允许 `instructions[]`”原先只在后置校验中表达，没有收进 `manager-turn-schema`。
   - 结果是模型能输出“结构上可解析、语义上非法”的 action；校验返回的是 `action_execution_rejected`，纠错回合也拿不到更强的参数修复信号。
2. 可见性缺口
   - task_control 相关 hint 模板没有消费 `task_id/title`。
   - correction fallback reply 只拼接 hint，因此最终对用户可见的报错没有定位信息。

## 证据

- `~/.mimikit/log.jsonl:386`
  - 拒绝事件已记录 `taskId":"task-5d4d17ff4950445f971baf9225cc5bfa"`。
- `~/.mimikit/traces/2026-03-29/0mnbnmzx6mp.txt:959`
  - manager 实际输出了 `task_control(cancel)` 且附带 `instructions[]`。
- `~/.mimikit/results/packets.jsonl:5`
  - 同一 task id 对应标题 `按整体方案继续推进下一项未完成整改`。
- `~/.mimikit/traces/2026-03-31/0mnedzs9lmp.txt:163`
  - 用户看到的旧回复只有“只有 action="resume" 才允许附带 instructions[]”，没有 task 标识。

## 最小修复

- `src/policy/manager/manager-turn-schema.ts`
  - 把“非 `resume` 禁止 `instructions[]`”前移到 schema 级 `superRefine`，让这类错误直接落成 `invalid_action_args`。
- `src/policy/manager/action-validation.ts`
  - task_control 状态校验统一带上 `task_id`，可用时带 `task.title`。
- `src/policy/manager/action-registry-task-definitions.ts`
  - apply 阶段的 task_control 拒绝 hint 同样补充任务标识，避免只在 validation 阶段修好。
- `src/policy/manager/action-feedback-hints-basic.ts`
  - 为 task_control hint 增加统一的任务标识后缀格式。
- `prompts/manager/action-feedback-hints.md`
  - task_control 相关文案模板统一接入 `task_ref_suffix`。

## 测试与守护

- `tests/manager-turn.test.ts`
  - 守护 `parseManagerTurn` 不再接受 `cancel + instructions[]`。
- `tests/manager-task-control-feedback.test.ts`
  - 守护 task_control 失败 hint 会带任务标识。
- `tests/manager-task-control-self-repair.test.ts`
  - 守护这类错误现在会进入 `invalid_action_args` 自修复重试通道，而不是直接退化成通用拒绝。

## 代码复盘

- 范围：仅覆盖 task_control 结构化约束与失败提示链路，没有扩到 task 页面、历史展示或其他 manager action。
- 结果：未发现需要继续修补的 P0-P2 问题；改动维持在现有 manager/action 分层内，没有引入新模块或兼容层。

## 验证

- `pnpm vitest run tests/manager-turn.test.ts tests/manager-task-control-feedback.test.ts tests/manager-task-control-self-repair.test.ts`
- `pnpm review-code-changes`

## 风险与边界

- 本轮让非法 `task_control` 更早以 `invalid_action_args` 失败并进入自修复；它没有让模型“绝不犯错”，但把错误从后置语义拒绝前移到了结构化约束层。
- 非 task_control 的其他 action 若也存在“语义约束只写在后置校验、未写进 schema”的情况，未来仍可能出现类似问题；当前没有证据表明需要扩大修复范围。
