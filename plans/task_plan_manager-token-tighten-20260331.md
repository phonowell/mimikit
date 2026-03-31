# Task Plan: manager-token-tighten-20260331

类型：implementation + tdd
当前状态：已完成

## 目标

- 在不削弱高风险门禁、`plan.task_contract`、证据边界与解释可定位性的前提下，最小落地 manager token 收紧版方案。
- 本轮只做三项安全优先改动：分 section 记账、state/task/plan 选择窗收缩、纯提示去重；不扩展成协议重写或无边界性能工程。

## 本轮收敛

1. 分 section 记账与裁剪承载
进入条件：现有 usage ledger 只记录总 `promptBytes`，无法定位具体 section 成本。
退出条件：manager prompt 构建结果可输出 section 级字节统计与 task/plan full-card 命中计数，并写入可追溯位置。
验证路径：`tests/usage-ledger.test.ts`

2. 收缩 state/task/plan 选择窗
进入条件：当前 task/plan 选择固定取窗口上限，缺少“active/latest-result/recent”优先级。
退出条件：manager 仅保留高信号 task/plan 子集：active、latest-result 关联与最小 recent 补位；不退化为只看当前对象。
验证路径：`tests/plan-select.test.ts`、`tests/prompt-task-content.test.ts`

3. 纯提示去重
进入条件：`prompts/manager/system.md` 与 action surface 在任务合同字段上存在重复提示。
退出条件：系统提示只保留边界规则，把具体字段契约统一下沉到 action surface，不改语义。
验证路径：`tests/manager-project-profile-prompt.test.ts`

## 执行步骤

1. 先补失败测试，锁定选择窗、full/card 边界与 section 记账输出。
2. 实现 task/plan relevance window 与 prompt payload full/card 分流。
3. 接入 manager prompt section stats，并写入 usage ledger。
4. 收紧 `prompts/manager/system.md` 的纯提示重复段落。
5. 更新 notes/report，执行定向测试、`code-reviewer` 与 `pnpm review-code-changes`。
6. 若门禁通过，完成 git merge/cleanup；若受边界或门禁阻塞，留在可审阅状态并在归档注明。

## 风险

- 若 full/card 规则过度收缩，会先伤到多 active continuation、set_plan update 与普通消息对象判别。
- 若 section 记账只记总量不记 full/card 命中数，后续无法区分“真的省 token”还是“误删语义”。
- merge/cleanup 可能受当前 worker 写边界或已有 worktree 占用影响，需要最后以 git 事实确认。

## 结果

- ✓ relevance window、task/plan full-card、usage ledger section 记账、系统提示去重已完成。
- ✓ 定向验证、`pnpm lint`、`pnpm type-check`、`pnpm review-code-changes` 已通过。
- ✓ 代码提交 `975a231059503d16cf064600eb1083ceecf66608` 已 fast-forward merge 到 `main`。
- → 剩余动作仅为归档提交同步到 `main` 与 worktree/branch 清理。
