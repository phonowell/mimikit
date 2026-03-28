# Task Plan: coding-agent-optimization-20260328

类型：implementation + tdd
当前状态：验证中

## 目标

- 基于 2026-03-28 coding agent 调研结论，收敛一轮不过度设计的最小优化。
- 先完成简明自评审，再只实现一个高 ROI、边界清晰、不会明显削弱现有能力的改动。

## 候选收敛

1. worker prompt 增加显式 runtime 合同
进入条件：确认当前 worker prompt 尚未明确暴露 `resource_mode` / worktree / branch / 写边界。
退出条件：worker prompt 明确展示当前执行边界；测试覆盖 read/write 关键分支。
验证路径：`tests/worker-build-prompt-resume-instruction.test.ts`

2. manager task schema 扩展自治级别枚举
进入条件：确认现有 `read|write` 无法表达本轮最小需求。
退出条件：若进入则 schema / docs / prompt / validation 全链路一致。
验证路径：`tests/manager-task-contract-validation.test.ts` + 相关 action tests

3. review gate read model/UI 收紧
进入条件：确认当前主要风险在审阅面，而非执行合同不清。
退出条件：若进入则只展示 artifact / verification / evidence，不扩成任务板。
验证路径：task read-model / webui tests

## 本轮选择

- 选择项：1. worker prompt 增加显式 runtime 合同。
- 原因：
  - 与调研中的“显式 runtime 权限合同”直接对齐。
  - 复用现有 `resourceMode`、`Task.git`、`workspaceDir`，不新增用户面协议。
  - 只收紧执行边界表达，不改变 manager/worker 主流程，不会削弱现有能力。
- 暂不做：
  - 2 会扩展 manager 协议面；当前缺少真正消费新枚举的运行时能力，ROI 不够高。
  - 3 会跨 read-model / WebUI，边界更大，容易扩成产品面重构。

## 执行步骤

1. 先补 worker prompt 的失败测试，锁定 runtime 合同输出。
2. 实现 runtime 合同格式化与 worker system prompt 注入。
3. 同步最小文档/归档说明本轮选择与自评审。
4. 跑针对性测试，再跑 `pnpm review-code-changes`。
5. 做代码复盘；若门禁通过则提交、merge 回 `main`、清理 worktree/分支。

## 当前进展

- ✓ 已补失败测试并验证红绿转换。
- ✓ 已完成 runtime 合同注入与最小文档同步。
- ✓ `pnpm review-code-changes` 已通过。
- → 待提交、merge back 与清理 worktree/分支。

## 风险

- prompt 文案若散回 TS，可能违反 prompt 治理约束。
- runtime 合同若与真实执行目录不一致，会制造新的误导，需直接复用运行时现有字段。
