# 任务系统概览

> 返回 [系统设计总览](./README.md)

## Teller 注入（摘要）
- 固定声明 → prompts/agents/teller/identity.md + prompts/agents/teller/voice.md + prompts/agents/teller/tools.md + prompts/agents/teller/output.md → Supervisor 动态上下文（history/memory/输入/结果）
- 仅 Teller 有固定声明，Planner/Worker 无

## PromptMode（注入强度）
- full：注入 identity/tools/rules/output（Teller 额外注入 voice）+ history/memory（有内容时）。
- minimal：只注入 identity/tools/rules/output（Teller 额外注入 voice），不注入 history/memory。
- none：只保留 user_inputs/user_request/task，仅用于测试。
- 运行时策略：Teller/Planner 有 history/memory 时用 full，否则用 minimal；Worker 固定 minimal。

## 生命周期（高层）
```
用户输入
  ↓
inbox.json + history.json（Host 写入）
  ↓
Supervisor 唤醒 Teller
  ↓
Teller 回复用户 + 委派 Planner → 立即休眠
  ↓
planner/queue/ → Planner → planner/results/
  ↓
Supervisor 解析 Planner 结果
  ├─ done → oneshot 子任务写入 worker/queue/
  ├─ needs_input → teller_inbox.json → Teller ask_user → pending_question.json → 用户回复 → Teller → Planner
  └─ failed → Teller 汇报（不自动重试）
  ↓
Worker 执行 → worker/results/
  ↓
Supervisor 更新 task_status.json → 用户可见则唤醒 Teller 汇报

--- 调度/条件触发 ---
triggers/（schedule/conditional）→ Supervisor 评估 → 触发 oneshot 入队
```

## 角色分工
- Teller：回复用户，必要时 delegate Planner
- Planner：拆分任务/触发器并设置优先级/超时
- Worker：执行 oneshot 任务并产出结果

## 关键规则
- Worker 仅执行 `oneshot`；条件触发用 triggers/ 持久化。
- Planner 结果 `needs_input` 仅出现在 planner/results/，不写入 task_status.json。
- `llm_eval` 条件评估结果为内部结果，由 Supervisor 消费不唤醒 Teller。
- 任务执行语义为 **at-least-once**：崩溃/超时可能导致重复执行，任务应尽量幂等。
- 可选重试：Worker 失败可按 `retry.maxAttempts` 重新入队，并通过 `deferUntil` 控制回退。
- `deferUntil` 未到期的任务不会被调度执行。

## 细节文档
- 任务/触发器/结果结构：docs/design/task-data.md
- 条件与时间语义：docs/design/task-conditions.md
- 角色细节：prompts/agents/teller/identity.md / prompts/agents/teller/voice.md / prompts/agents/teller/tools.md / prompts/agents/teller/output.md / prompts/agents/planner/identity.md / prompts/agents/planner/tools.md / prompts/agents/planner/rules.md / prompts/agents/planner/output.md / prompts/agents/worker/identity.md / prompts/agents/worker/tools.md / prompts/agents/worker/rules.md / prompts/agents/worker/output.md
