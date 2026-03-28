# Task Plan: plan-effect-tasktemplate-20260328

类型：implementation + tdd
当前状态：验证中

## 目标

- 基于 `plans/report_f4f34c7a.md` 与前两项已落地整改，继续推进下一项高优先写任务。
- 先完成简明自评审，再只实现一个边界清晰、可独立验收的最小闭环。

## 候选收敛

1. 压缩 `plan.effect.taskTemplate`
进入条件：确认当前 `taskTemplate` 仍持有未被消费或可在触发时重算的重复语义。
退出条件：仅保留 enqueue 必需字段；最小测试覆盖创建、替换、快照持久化。
验证路径：`tests/manager-action-apply/plan-scenarios.ts`、`tests/prompt-task-content.test.ts`、`tests/runtime-snapshot/persistence-scenarios.ts`

2. 只读盘点 projection 边界
进入条件：若 `taskTemplate` 收缩仍依赖未澄清的 SSE/WebUI 投影事实。
退出条件：产出只读归档，不改代码。
验证路径：归档证据，不跑实现门禁

3. 直接进入 SSE/WebUI projection 收窄
进入条件：任务 4 已完成并给出明确分域方案。
退出条件：替换整包 snapshot 去重，并同步收窄至少一处 focus 绑定。
验证路径：events/webui 相关测试

## 本轮选择

- 选择项：1. 压缩 `plan.effect.taskTemplate`。
- 原因：
  - 路线图中的前置依赖已满足，且这是当前剩余高优先写任务里边界最小的一项。
  - 当前代码事实显示 `taskTemplate.semanticKey` 未被任何运行时路径消费，只在持久化与测试夹带，属于高置信重复语义。
  - 保留 `executionSpecId + fingerprint + cwd + 运行时边界字段`，不会削弱 enqueue、plan 去重或 worker 触发能力。
- 暂不做：
  - 2 属于只读任务，不符合本轮“继续落地一项整改”的目标。
  - 3 依赖任务 4 的只读盘点，否则容易扩成多主题并行重构。

## 执行步骤

1. 先补失败测试，锁定 `taskTemplate` 不再持久化 `semanticKey` 的契约。
2. 只改 `TaskPlanEffect` 类型、schema、构建逻辑与相关 helper。
3. 更新最小计划/notes/report，记录选择、自评审与取舍。
4. 跑针对性测试，再跑 `pnpm review-code-changes`。
5. 做代码复盘；若门禁通过，再处理 merge back / 清理结论。

## 当前进展

- ✓ 已回读任务合同、路线图与前两项归档。
- ✓ 已完成本轮选择与简明自评审。
- ✓ 已完成 red-green：针对性测试先失败后通过。
- → 待跑全量质量门禁与代码复盘。

## 风险

- 若 `semanticKey` 在隐藏路径被依赖，删除后可能影响 plan 替换或快照加载。
- 若测试只覆盖 set_plan，不覆盖 snapshot/helper，重复字段可能在 fixture 层残留。
- 当前 worktree 初始缺少依赖，已通过 `pnpm install --frozen-lockfile` 补齐；后续门禁输出需基于本次 fresh 环境。
- 已补 legacy snapshot 兼容守护：旧 runtime snapshot 中残留的 `semanticKey` 现会在解析时被丢弃，不阻塞加载。
