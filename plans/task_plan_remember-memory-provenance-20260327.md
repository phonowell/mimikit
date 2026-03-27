# remember_memory / project_profile 收敛计划

## 类型

- implementation

## 目标

- 移除 `remember_memory` 的词面 overlap / 历史重复放行逻辑
- 改为基于当前轮用户输入来源的结构化证据校验
- 在不放松 `remember_memory` 边界的前提下，新增 repo 绑定的 `remember_project_profile`
- 删除 suppress 后覆写正常 reply 的行为，并让纯 profile suppress 同样回落中性回复
- 不留兼容层，同步更新 prompt、文档与最小必要测试

## 步骤

1. 基线与工作区
   - 进入新 git worktree
   - 跑相关测试基线，确认当前分支在目标范围内可验证
   - 退出条件：worktree 可用，相关测试结果已记录

2. RED
   - 先改测试，覆盖：
   - `remember_memory` 仅允许锚定当前轮用户输入
   - 历史重复不再放行
   - suppress 不再覆写正常 reply
   - 退出条件：新旧相关测试出现预期失败

3. GREEN
   - 更新 action schema / prompt / validation / round followup
   - 保留 `remember_memory` 仅收长期稳定跨项目规则
   - 新增 `remember_project_profile(content,source_input_id,source_quote)`，绑定 `runtime.startup.worktree`
   - 保持实现最小，不引入兼容字段或额外流程
   - 退出条件：相关测试转绿

4. 文档与验证
   - 同步 `docs/design/workflow/action.md`、`docs/design/workflow/memory.md` 与必要 prompt 文案
   - 跑最小相关测试、`pnpm lint`、`pnpm type-check`
   - 退出条件：验证结果明确，差异可审计

## 当前状态

- 已完成：步骤 1、2、3、4

## 验证路径

- `pnpm test -- tests/manager-action-apply.test.ts tests/manager-remember-memory-guard.test.ts tests/manager-remember-memory-suppression.test.ts tests/manager-turn.test.ts tests/manager-action-surface-prompt.test.ts tests/manager-project-profile-prompt.test.ts`
- `pnpm lint`
- `pnpm type-check`

## 验证结果

- `pnpm test -- tests/manager-action-apply.test.ts tests/manager-remember-memory-guard.test.ts tests/manager-remember-memory-suppression.test.ts tests/manager-turn.test.ts tests/manager-action-surface-prompt.test.ts tests/manager-project-profile-prompt.test.ts` ✓
- `pnpm lint` ✓
- `pnpm type-check` ✓
