# Report: manager-token-tighten-20260331

## 方案与自评审

- 本轮只落地二次复盘认可的三项安全优先项：分 section 记账、state/task/plan 选择窗收缩、纯提示去重。
- 未做项：
  - 未改成“只展开当前对象”；active、working focus、latest-result 关联对象仍保留全文语义。
  - 未删除 `plan.task_contract`；只把无关 done/closed plan 降成 card，active/blocked 与 latest-result 关联 plan 仍保留全文。
  - 未动高风险门禁、任务合同字段边界、证据要求、归档链接要求与 worker/runtime 协议。
- 自评审结论：实现范围与前序归档一致，属于最小闭环；新增复杂度主要是 task prompt 的拆分文件，用于守住 200 行治理，不是横向扩张。

## 改动点

- `src/surface/read-model/plan-select.ts`
  - task/plan 选择窗改为 relevance window：优先 active、latest-result 关联对象，再用 working focus / recent 补到 `minCount`。
- `src/foundation/prompting/format-task-content.ts`
  - task state payload 增加 full/card 分流；active、working focus、latest-result 对象保留全文，其他对象降 card。
- `src/foundation/prompting/format-plan-content.ts`
  - plan state payload 增加 full/card 分流；active/blocked、working focus、latest-result 关联 plan 保留全文。
- `src/foundation/prompting/task-prompt-selection.ts`
  - 新增 task prompt relevance/selection 逻辑。
- `src/foundation/prompting/task-prompt-entry-format.ts`
  - 新增 task full/card entry 格式化，避免 `format-task-content.ts` 继续膨胀。
- `src/policy/prompts/build-prompts.ts`
  - manager prompt 返回 section 级字节统计与 task/plan full-card 计数。
- `src/persistence/storage/usage-ledger.ts`
  - usage ledger 写入 `promptSections` 与 `promptSelection`。
- `prompts/manager/system.md`
  - 删除与 action surface 重复的任务合同字段枚举，只保留边界规则。

## 红线核对

- 不走“只展开当前对象”：已用 `tests/plan-select.test.ts` 与 `tests/prompt-task-content-selection.test.ts` 锁定 active + working focus + latest-result 组合。
- 不删除 `plan.task_contract`：已用 `tests/prompt-task-content-selection.test.ts` 锁定 focused/active plan 仍保留 `task_contract`。
- 高风险门禁、证据充分性、解释可定位性：仅改 state payload 与 prompt ledger；`prompts/manager/system.md` 只做去重，不删 guard 规则或归档要求。

## 验证

- `pnpm vitest run tests/plan-select.test.ts tests/prompt-task-content.test.ts tests/prompt-task-content-selection.test.ts tests/usage-ledger.test.ts tests/manager-project-profile-prompt.test.ts tests/manager-prompt-runtime-demand.test.ts tests/manager-prompt-capacity-demand.test.ts tests/manager-loop-batch-exec-budget.test.ts`
  - 8 files / 19 tests passed
- `pnpm type-check`
  - passed
- `pnpm lint`
  - passed
- `pnpm review-code-changes`
  - passed
  - 全量结果：149 files / 451 tests passed
- `code-reviewer`
  - 复盘范围：当前 diff
  - 结果：未发现 P0/P1/P2 阻塞问题

## 能力与成本判断

- token 收缩路径：
  - 选择窗不再默认吃满 `maxCount`
  - task/plan done 历史对象可降为 card
  - prompt 现有 section 字节与 full/card 命中数可直接入 ledger
  - 系统提示去掉重复字段枚举
- 能力未削弱的最小证据：
  - active task/plan、working focus 对象、latest-result 关联对象仍保留全文合同
  - `plan.task_contract` 仅对 card 化的无关 plan 收缩，关键 plan 语义仍可定位
  - 全量门禁 `pnpm review-code-changes` 通过

## 剩余边界

- `promptSections` 当前记录的是 render 后 section 字节，不含 provider 内部 token 细节；这是有意保持可验证、可追溯的仓内真相。
- latest-result 关联仍沿用当前 batch 结果顺序语义；若后续发现结果队列不稳定排序，再独立补“latest result 归一化”任务，不在本轮扩大范围。

## Git 状态

- 代码闭环提交：`975a231059503d16cf064600eb1083ceecf66608`
- 记录本报告时，`main` 已 fast-forward 到上述代码提交；本报告为后续归档补记，不改变代码行为。
