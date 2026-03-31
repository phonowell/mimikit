# Notes: manager-token-tighten-20260331

## 当前事实

- 前序方案归档已把安全优先项收敛为：分 section 记账、state/task/plan 选择窗收缩、纯提示去重。
- 二次复盘明确两条红线：不能退化为只展开当前对象；不能删除 `plan.task_contract`。
- 当前实现的主要切入点集中在：
  - `src/surface/read-model/plan-select.ts`
  - `src/foundation/prompting/format-task-content.ts`
  - `src/foundation/prompting/format-plan-content.ts`
  - `src/policy/prompts/build-prompts.ts`
  - `src/persistence/storage/usage-ledger.ts`

## 本轮实现策略

- 选择窗先按 relevance 收缩，再用 `minCount` 做下限补位；不再机械填满 `maxCount`。
- task/plan payload 只对 active、latest-result 关联对象保留全文合同；其余保留 card，继续可定位。
- `plan.task_contract` 仅在 plan entry 为 full 时输出；触发规则保证 active / latest-result 关联 plan 不被卡片化。
- section 记账至少覆盖 `system`、`action_surface`、`state_packet`、`event_packet`、`project_profile`、`remembered_memory`、`memory`，并记录 task/plan full-card 命中数。
- 纯提示去重只改文案重复，不改门禁和协议边界。

## 待验证点

- user_input 普通消息仍能看到足够的 active task/plan 候选。
- latest-result 关联 task/plan 仍保持全文语义。
- usage ledger 新字段为纯增量，不破坏现有读路径与评估脚本。

## 实施结果

- `src/surface/read-model/plan-select.ts` 现改为 relevance window：先保 active、latest-result 关联对象，再用 working focus / recent 补到 `minCount`，不再机械填满 `maxCount`。
- `src/foundation/prompting/format-task-content.ts` 与 `src/foundation/prompting/format-plan-content.ts` 增加 full/card 分流：
  - task：active、latest-result 或 working focus 对象保留全文合同，其余降 card。
  - plan：active/blocked、latest-result 关联或 working focus 对象保留全文；其余降 card，但不删除 card 级可定位字段。
- `src/policy/prompts/build-prompts.ts`、`src/persistence/storage/usage-ledger.ts` 与 manager runner 链路已新增 section 级 prompt 记账与 task/plan full-card 计数。
- `prompts/manager/system.md` 已删除与 action surface 重复的任务合同字段枚举，只保留边界规则。
- 为避免新长文件失控，task prompt 选择与 entry 格式拆到了 `src/foundation/prompting/task-prompt-selection.ts`、`src/foundation/prompting/task-prompt-entry-format.ts`。

## 验证结果

- `pnpm vitest run tests/plan-select.test.ts tests/prompt-task-content.test.ts tests/prompt-task-content-selection.test.ts tests/usage-ledger.test.ts tests/manager-project-profile-prompt.test.ts tests/manager-prompt-runtime-demand.test.ts tests/manager-prompt-capacity-demand.test.ts tests/manager-loop-batch-exec-budget.test.ts`
  - 8 files / 19 tests passed
- `pnpm type-check`
  - passed
- `pnpm lint`
  - passed
- `pnpm review-code-changes`
  - passed
  - 全量结果：149 files / 450 tests passed

## 代码复盘

- ✓ 真实性：改动范围仅覆盖 token 收紧主链，未扩展到 WebUI/runtime 其他主题。
- ✓ 正确性：选择窗、full/card、usage ledger 与 prompt 去重均有定向测试与全量门禁覆盖。
- ✓ 优雅性：新增逻辑被拆到 task prompt 专用文件，避免把 `format-task-content.ts` 继续堆到 >200 行。
- ✓ 最小化：未改 provider 协议、guard 规则、`plan.task_contract` 结构或 task/archive 真相源。
- 当前未发现 P0/P1/P2 阻塞问题。
