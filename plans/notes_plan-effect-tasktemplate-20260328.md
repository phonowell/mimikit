# Notes: plan-effect-tasktemplate-20260328

## 当前事实

- 路线图任务 3 明确要求“压缩 `plan.effect.taskTemplate`，减少 plan/task 合同重复持久化”。
- 当前实现里 `taskTemplate` 包含 `executionSpecId`、`contract`、`fingerprint`、`semanticKey`、`cwd` 及运行时边界字段。
- `taskTemplate.semanticKey` 只出现在类型、schema、fixture 与测试中；运行时执行、prompt payload、plan key、trigger fire 均未消费该字段。
- `fingerprint` 仍被 `buildPlanEffectKey()` 用于 plan 去重键，当前不能一起删除而不扩成更大改动。

## 选择判断

- 本轮最小闭环定为：删除 `taskTemplate.semanticKey` 的持久化与相关测试夹带。
- 暂不触碰 `contract`，因为 plans prompt payload 当前仍用它提供 manager 可见的任务合同摘要；同步重做这条链路会扩大边界。
- 暂不触碰 `fingerprint`，因为 plan 去重键仍直接依赖它。

## TDD 目标

- 新增/调整测试，先证明 set_plan 后的 `taskTemplate` 不再含 `semanticKey`。
- 补一条 snapshot 读写守护，确认新的 plan schema 仍能持久化并加载。

## 实施后检查

- `taskTemplate.semanticKey` 已从类型、schema、构建逻辑与相关 fixture 删除。
- runtime snapshot parser 仍接受旧 plan snapshot 中残留的 `semanticKey`，并在解析时归一化丢弃，避免现网状态文件因本轮收紧而加载失败。
- `fingerprint` 仍保留为 plan effect key 的单一稳定 digest，未扩大去重键改造范围。
- 针对性验证已完成：
  - `pnpm vitest run tests/runtime-snapshot.test.ts tests/manager-action-apply.test.ts tests/prompt-task-content.test.ts tests/manager-plan-progress.test.ts`
  - 结果：4 files / 42 tests passed
