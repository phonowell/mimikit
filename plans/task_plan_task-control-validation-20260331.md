# task_plan_task-control-validation-20260331

- type: tdd
- status: in_progress
- scope: `task_control` 非法参数生成与失败提示缺少任务标识

1. 取证当前失败链路、定位非法 `task_control` 的生成层与缺失任务标识的反馈层
   - entry: 已拿到可复现日志/trace/相关源码
   - exit: 根因、失败层级、可恢复的任务标识证据写入 notes
   - verify: `log.jsonl`、相关 trace、`src/policy/manager/*`
2. 先补最小失败测试
   - entry: 已确定要收敛的行为
   - exit: 至少覆盖“非 resume 不接受 instructions”和“失败提示带 task 标识”
   - verify: 目标测试先失败
3. 实施最小修复
   - entry: failing tests 已确认
   - exit: `task_control` 契约/校验与提示文案收敛，避免同类非法动作继续通过当前结构化约束
   - verify: 目标测试转绿
4. 跑质量门禁并整理归档
   - entry: 代码与测试已稳定
   - exit: 记录验证结果、风险、git 状态与可引用证据
   - verify: `pnpm review-code-changes`
