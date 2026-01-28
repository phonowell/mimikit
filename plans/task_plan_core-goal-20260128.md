# task_plan_core-goal-20260128

## 目标
- 补齐“自迭代/自演化/质量评估/7x24 稳定运行”最小闭环

## 范围
- runtime 自评估与最小改进闭环（可选 LLM，自带启发式）
- 运行心跳与健康可观测性
- 记忆检索可用性微调（与自评估日志联动）

## 步骤
1. 复核目标与当前实现差距，记录到 notes
2. 设计最小闭环与配置（self-eval + lessons + heartbeat），列出涉及文件
3. 批量实现：config/runtime/ledger/memory/server/docs
4. 更新计划与验证记录

## 状态
- 进度: 4/4
- 变更: 已完成
- 验证: 未运行（worktree 无 node_modules）
- 风险: 自评估触发额外成本（启发式默认 + LLM 可选）
