# Notes: task-template-compression-20260328

## 当前事实

- 路线图将 `plan.effect.taskTemplate` 压缩列为 archive/context_refs 收紧之后的下一项高 ROI 写任务。
- 当前 `taskTemplate` 同时保存 `executionSpecId`、`contract`、`fingerprint`、`semanticKey`、`cwd` 等字段；真实 Task 创建时又会基于 spec/prompt/contract 重算同类语义。
- `normalizePlanKey()` 目前直接依赖 `taskTemplate.fingerprint`；如果简单删掉而改用 `executionSpecId`，重复 `set_plan` 会因 spec 每次新建而不再稳定去重。
- manager state packet 仍通过 plan payload 暴露 `task_contract`，这部分不能无证据回退。

## 选择判断

- 本轮目标不是重做 plan 协议，而是把重复字段收敛成：
  - `taskTemplate` 内只保留 enqueue 真正需要的运行字段。
  - effect 根部保留单一稳定 digest，用于计划去重。
  - contract digest 仍可单独暴露给 prompt payload，但不再塞在 `taskTemplate` 里。

## 实施结果

- `TaskPlanEnqueueTaskEffect` 现改为：
  - `taskTemplate`: `title`、`executionSpecId`、`cwd`、`resourceMode`、`useWorktree`、`branch`
  - `taskKey`: 单一稳定 digest，沿用原 fingerprint 语义用于 `normalizePlanKey()`
  - `taskContract`: 供 prompt payload 暴露的合同 digest
- `buildPlanEffectKey()` 不再依赖 `taskTemplate.fingerprint`，而是直接使用 `effect.taskKey`。
- `buildPlanEffectPayload()` 改为从 `effect.taskContract` 输出 `task_contract`，避免把合同语义继续塞进 `taskTemplate`。
- 测试 helper 已同步适配压缩后的 effect 结构，且允许缺省 `effect` 的 runtime fixture 继续工作。
- runtime snapshot 读取链路现在会把旧的 `taskTemplate.contract/fingerprint/semanticKey` 迁移成新的 `taskContract/taskKey` 根字段，避免升级后直接炸旧状态。

## 验证

- `pnpm vitest run tests/manager-action-apply/plan-scenarios.ts tests/manager-plan-update-dedupe.test.ts tests/prompt-task-content.test.ts tests/manager-plan-progress.test.ts tests/manager-plan-use-worktree.test.ts`
  - 4 files / 9 tests passed
- `pnpm review-code-changes`
  - lint、lint:changed-tests、type-check、build:webui、全量 vitest 均通过
  - 全量测试结果：133 files / 408 tests passed

## 代码复盘

- P0/P1：未发现阻塞问题。
- 复盘中修正了一处真实回归风险：测试 helper 对缺省 `effect` 的 plan fixture 处理过于乐观，导致全量测试里 `manager-loop-idle-timeout` 与 `memory-refresh-singleflight` 失败；已改回安全守卫后复验通过。
