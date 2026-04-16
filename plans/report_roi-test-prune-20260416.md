# 测试 ROI 评分与后 20% 淘汰报告

## 盘点范围

- 评分单位：`find tests -name '*.test.ts' | sort` 发现的 Vitest 测试入口文件
- 基线总量：`95` 个测试入口
- 淘汰目标：后 `20%`
- 实际淘汰：`19 / 95 = 20.0%`
- 当前剩余：`76` 个测试入口

## ROI rubric

- `5/5`：关键主链回归面，覆盖状态迁移/写入安全/复杂协议，且缺少等价替代
- `4/5`：重要覆盖，或作为 scenario suite 入口的低维护锚点，保留收益明显大于维护成本
- `3/5`：有一定信号，但更偏外围、烟雾、辅助校验；本轮未低到切线
- `2/5`：本轮未使用
- `1/5`：浅层格式/文案/辅助路径/单分支 helper，或与更高价值套件重复，删除收益高于保留收益

补充判定：

- 对 `0` 直接断言的 wrapper 入口不按“空测试”直接判低分；若其主要职责是加载子目录 scenario suite，且维护成本近乎为零，按 `4/5` 保留
- 对底部候选做了人工复核；只删除独立叶子测试入口，不改动业务实现，也不重排现有测试目录结构

## 切线与淘汰集合

以下 `19` 个文件统一落在 `1/5` 切线，已删除：

| Score | File | 删除依据 |
| --- | --- | --- |
| `1/5` | `tests/chat-view-artifacts.test.ts` | 读模型产物链接投影，主要是字符串/路径格式断言，维护脆弱 |
| `1/5` | `tests/chat-view.test.ts` | chat 文本透传校验，行为浅且与上层视图流覆盖重复 |
| `1/5` | `tests/codex-sdk-provider-resource-mode.test.ts` | 两分支映射 helper，回归成本低 |
| `1/5` | `tests/history-result-events.test.ts` | 单一摘要落盘边角，价值低于更高层 result/handoff 套件 |
| `1/5` | `tests/http-events-shared.test.ts` | SSE hint key 辅助函数，属于外围缓存优化 |
| `1/5` | `tests/http-reset-clear-state-dir.test.ts` | 管理态清空目录工具，低频辅助路径 |
| `1/5` | `tests/http-static-root.test.ts` | 静态资源冒烟，已被构建/启动链路部分覆盖 |
| `1/5` | `tests/http-workspace-file-route.test.ts` | workspace 文件查看辅助路由，非主链协议 |
| `1/5` | `tests/loop-signal-options.test.ts` | 两个内存 wake flag 细节，覆盖面窄 |
| `1/5` | `tests/manager-plan-action-registry.test.ts` | barrel import smoke，仅验证模块可加载 |
| `1/5` | `tests/memory-refresh-trigger-policy.test.ts` | 简单阈值谓词，已被更高层 memory refresh 套件覆盖 |
| `1/5` | `tests/rearchitecture-score-runtime-window-eval-context.test.ts` | 重构脚本的遗留评分 helper，非产品主链 |
| `1/5` | `tests/routes-api-events-shared.test.ts` | SSE close handler 辅助分支，外围资源清理细节 |
| `1/5` | `tests/runtime-domain-state.test.ts` | 结构 shape 断言，不验证实际行为 |
| `1/5` | `tests/runtime-snapshot-memory-refresh-schema.test.ts` | 旧 schema 拒绝边角， blast radius 小 |
| `1/5` | `tests/runtime-snapshot-task-git-lifecycle.test.ts` | 快照字段 round-trip，已被更高价值 git lifecycle 套件覆盖 |
| `1/5` | `tests/surface-artifact-link.test.ts` | URL/路径编码格式断言，脆弱且偏展示层 |
| `1/5` | `tests/task-live-output-summary.test.ts` | live output 文案归一化，非关键行为 |
| `1/5` | `tests/task-view-title.test.ts` | title fallback 展示细节，覆盖收益最低 |

## 全量排序

### `1/5` 已淘汰（19）

- `tests/chat-view-artifacts.test.ts`
- `tests/chat-view.test.ts`
- `tests/codex-sdk-provider-resource-mode.test.ts`
- `tests/history-result-events.test.ts`
- `tests/http-events-shared.test.ts`
- `tests/http-reset-clear-state-dir.test.ts`
- `tests/http-static-root.test.ts`
- `tests/http-workspace-file-route.test.ts`
- `tests/loop-signal-options.test.ts`
- `tests/manager-plan-action-registry.test.ts`
- `tests/memory-refresh-trigger-policy.test.ts`
- `tests/rearchitecture-score-runtime-window-eval-context.test.ts`
- `tests/routes-api-events-shared.test.ts`
- `tests/runtime-domain-state.test.ts`
- `tests/runtime-snapshot-memory-refresh-schema.test.ts`
- `tests/runtime-snapshot-task-git-lifecycle.test.ts`
- `tests/surface-artifact-link.test.ts`
- `tests/task-live-output-summary.test.ts`
- `tests/task-view-title.test.ts`

### `3/5` 保留（11）

- `tests/http-webui-build-readiness.test.ts`
- `tests/orchestrator-runtime-ops.test.ts`
- `tests/orchestrator-service-stop.test.ts`
- `tests/path-safety.test.ts`
- `tests/rearchitecture-score-runtime-window.test.ts`
- `tests/runtime-reaper-handle.test.ts`
- `tests/task-handoff-protocol.test.ts`
- `tests/test-cost-guard.test.ts`
- `tests/webui-composer-focus-restore.test.ts`
- `tests/worker-profiled-runner-provider/logging-scenarios.test.ts`
- `tests/worker-run-task-phase-logging.test.ts`

### `4/5` 保留（52）

- `tests/config-default-loader.test.ts`
- `tests/config.test.ts`
- `tests/file-length-guard.test.ts`
- `tests/focus-capacity.test.ts`
- `tests/focus-reserved-policy.test.ts`
- `tests/manager-action-apply.test.ts`
- `tests/manager-action-apply/enqueue-resume-paused.test.ts`
- `tests/manager-action-apply/memory-failsoft.test.ts`
- `tests/manager-llm-call-provider.test.ts`
- `tests/manager-loop-batch-failure-telegram.test.ts`
- `tests/manager-plan-progress.test.ts`
- `tests/manager-task-contract-budget.test.ts`
- `tests/manager-task-contract-no-repair.test.ts`
- `tests/manager-trigger-capacity.test.ts`
- `tests/manager-trigger-slot-budget.test.ts`
- `tests/manager-trigger-slot-edge.test.ts`
- `tests/manager-turn-task-contract-compact.test.ts`
- `tests/manager-turn-task-contract-tail-fields.test.ts`
- `tests/manager-turn-task-control.test.ts`
- `tests/manager-turn.test.ts`
- `tests/memory-refresh-single-call.test.ts`
- `tests/memory-refresh-singleflight.test.ts`
- `tests/messages-route.test.ts`
- `tests/openai-responses-provider.test.ts`
- `tests/openai-responses-provider/provider-structured-optional-scenarios.test.ts`
- `tests/plan-select.test.ts`
- `tests/plan-view.test.ts`
- `tests/queues.test.ts`
- `tests/runtime-domain-boundary.test.ts`
- `tests/runtime-owner-health.test.ts`
- `tests/runtime-persistence-queue-reconcile.test.ts`
- `tests/runtime-snapshot-git-task-shape.test.ts`
- `tests/runtime-snapshot.test.ts`
- `tests/task-execution-target.test.ts`
- `tests/task-git-closure-view.test.ts`
- `tests/task-git-lifecycle-reconcile.test.ts`
- `tests/task-progress-live-output.test.ts`
- `tests/task-route-actions.test.ts`
- `tests/task-view-runtime-status.test.ts`
- `tests/task-worktree-materialize.test.ts`
- `tests/worker-pause-resume.test.ts`
- `tests/worker-profiled-runner-loop-protocol.test.ts`
- `tests/worker-profiled-runner-loop.test.ts`
- `tests/worker-result-finalize-handoff.test.ts`
- `tests/worker-result-finalize.test.ts`
- `tests/worker-resume-instruction-state.test.ts`
- `tests/worker-run-retry-model-resource-mode.test.ts`
- `tests/worker-run-retry-resume-instruction.test.ts`
- `tests/worker-run-retry-session.test.ts`
- `tests/worker-run-task-incomplete-result.test.ts`
- `tests/worker-run-task-resume-instruction.test.ts`
- `tests/worker-task-cwd-preflight.test.ts`

### `5/5` 保留（13）

- `tests/cli-runtime-supervisor.test.ts`
- `tests/codex-stream-output-schema.test.ts`
- `tests/manager-enqueue-task-worktree-safety.test.ts`
- `tests/manager-loop-batch-failure-recovery.test.ts`
- `tests/memory-remember-entry.test.ts`
- `tests/module-boundary.test.ts`
- `tests/orchestrator-task-lifecycle.test.ts`
- `tests/runtime-lock.test.ts`
- `tests/task-git-closure-truth.test.ts`
- `tests/task-worker-run-write.test.ts`
- `tests/worker-cancel-session-policy.test.ts`
- `tests/worker-delete-task.test.ts`
- `tests/worker-dispatch-repo-branch-lock.test.ts`

## 验证

- `pnpm run lint:changed-tests` → `lint-changed-tests: no changed test files`
- `pnpm run type-check` → 退出码 `0`
- `pnpm test` → `76` 个文件、`285` 条测试全部通过
