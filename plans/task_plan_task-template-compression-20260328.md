# Task Plan: task-template-compression-20260328

类型：implementation + tdd
当前状态：已完成

## 目标

- 按系统性问题路线图继续推进下一项高优先整改，只落地 `plan.effect.taskTemplate` 压缩这一项最小闭环。
- 去掉 plan 对 Task 重复持有的合同语义与衍生 key，保留 enqueue 必需字段，并确保现有计划去重、触发与 manager 可见 contract digest 不回退。

## 候选收敛

1. 压缩 `plan.effect.taskTemplate`
进入条件：已确认前两轮已完成 `runtime_contract` 与 `archive/context_refs` 收紧，当前路线图下一项即 `taskTemplate` 压缩。
退出条件：`taskTemplate` 只保留 enqueue 必需字段；重复合同语义改为 spec 引用或单一 digest 承载；关键测试通过。
验证路径：`tests/manager-action-apply/plan-scenarios.ts`、`tests/manager-plan-update-dedupe.test.ts`、`tests/prompt-task-content.test.ts`

2. 直接进入 SSE / WebUI projection 收窄
进入条件：证明 `taskTemplate` 压缩依赖不足或收益不成立。
退出条件：需要先补只读盘点与更广 UI/SSE 契约改动。
验证路径：SSE / WebUI 相关 tests

3. 直接做 manager 阶段图 / tests 减码
进入条件：证明前置合同边界已稳定且当前主风险在 manager/tests。
退出条件：形成只读阶段图，不改行为。
验证路径：只读归档

## 本轮选择

- 选择项：1. 压缩 `plan.effect.taskTemplate`。
- 原因：
  - 路线图顺序与上轮归档都明确指向该项，依赖已满足。
  - 这是单主题、单链路的合同收紧，写边界明显小于 SSE/WebUI 或 manager 主链整改。
  - 可以直接减少 plan/task 双重持有语义，不需要扩新模块或新协议面。
- 暂不做：
  - 2 依赖更清晰的 projection 只读盘点，当前直接动会跨 WebUI/SSE 多层。
  - 3 属于更后置的只读/重构阶段，当前先收紧合同边界更高 ROI。

## 执行步骤

1. 先补失败测试，锁定压缩后 `taskTemplate` 最小契约与 plan 去重稳定性。
2. 实现 `taskTemplate` 压缩，把重复字段移到 spec 引用或单一 digest。
3. 同步 plan payload / fixture / schema，保持 manager 仍能看到 contract digest。
4. 更新归档与 notes，记录选择判断、边界与风险。
5. 跑针对性测试，再跑 `pnpm review-code-changes`，最后做代码复盘。

## 当前进展

- ✓ 已回读路线图、前两轮整改归档与当前实现。
- ✓ 已用 TDD 固定 `taskTemplate` 最小契约、plan 去重稳定性与 prompt contract digest 输出。
- ✓ 已完成 effect 压缩：`taskTemplate` 仅保留 enqueue 运行字段；稳定 digest 上提为 `effect.taskKey`，contract digest 上提为 `effect.taskContract`。
- ✓ `pnpm review-code-changes` 已通过；全量验证为 133 files / 407 tests passed。
- → 待提交、merge back 到 `main`、清理 worktree/branch。

## 风险

- 若 plan 去重改成依赖 `executionSpecId`，重复 `set_plan` 可能因 spec 每次新建而失效。
- 若完全移除 plan 侧 contract digest，manager packet 可能丢失触发前可见的计划合同摘要。
- 旧 runtime snapshot 若仍持有压缩前的 plan effect 结构，将需要通过本次全量更新后的新写回状态覆盖；本轮未额外增加兼容层。
