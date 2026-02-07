# 配置探索与裁剪记录（2026-02-07）

## 目标
- 解释 `src/config.ts` 参数语义。
- 清理“定义存在但运行时未消费”的配置项。

## 第一轮已删除（之前完成）
- `evolve.enabled`
- `evolve.idlePollMs`
- `evolve.feedbackHistoryLimit`
- `evolve.issueMinRoiScore`
- `evolve.issueMaxCountPerRound`

对应移除的环境变量解析：
- `MIMIKIT_EVOLVE_ENABLED`
- `MIMIKIT_EVOLVE_IDLE_POLL_MS`
- `MIMIKIT_EVOLVE_FEEDBACK_HISTORY_LIMIT`
- `MIMIKIT_EVOLVE_ISSUE_MIN_ROI_SCORE`
- `MIMIKIT_EVOLVE_ISSUE_MAX_COUNT_PER_ROUND`

## 第二轮已删除（已完成）
- `tokenBudget.enabled`
- `tokenBudget.dailyTotal`

对应移除的环境变量解析：
- `MIMIKIT_TOKEN_BUDGET_DAILY`
- `MIMIKIT_TOKEN_BUDGET_ENABLED`

## 第三轮收尾（2026-02-07）
- 删除失效测试文件：`test/token-budget.test.ts`
- 删除快照中的 tokenBudget 断言用例：`test/runtime-state.test.ts`
- 原因：`tokenBudget` 已从运行时配置、状态结构与调度路径完全移除，相关测试不再有产品语义

## 第二轮裁剪范围
- 配置层：`src/config.ts`、`src/cli-env.ts`
- 运行时类型：`src/types/index.ts`、`src/supervisor/runtime.ts`
- 状态持久化：`src/supervisor/runtime-persist.ts`、`src/storage/runtime-state.ts`
- 调度与执行：
  - 移除预算检查与预算跳过日志：`src/supervisor/worker.ts`、`src/supervisor/manager-runner-commands.ts`
  - 移除用量累加调用：`src/supervisor/manager-runner.ts`、`src/supervisor/worker-run-task.ts`
  - 删除预算模块文件：`src/supervisor/token-budget.ts`
- 状态接口：`src/supervisor/supervisor.ts` 不再返回 `tokenBudget`

## 仍在生效的关键项（节选）
- `evolve.idleReviewEnabled`
- `evolve.idleReviewIntervalMs`
- `evolve.idleReviewHistoryCount`
- `evolve.runtimeHighLatencyMs`
- `evolve.runtimeHighUsageTotal`
- `manager.*`（轮询、防抖、上下文窗口）
- `worker.*`（并发、超时、重试）

## 文档同步
- `docs/design/interfaces.md` 已移除 token budget 环境变量。
- `docs/design/supervisor.md` 已移除“成本闸门”章节。
- `docs/design/state-directory.md` 已移除 runtime-state 的 tokenBudget 描述。
- `docs/design/config-audit-2026-02-07.md` 已补充第三轮测试收尾记录。

## 备注
- `2026-02-07` 后已移除 `/api/evolve/code` 路由。
