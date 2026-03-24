# 收敛落地清单

> 返回 [Workflow 索引](./task-and-action.md)

## 用法

- 目标：把“收敛-1~5”从一次性首刀，推进为可持续维护的落地队列。
- 维护规则：每次续刀都回写 `当前已完成 / 剩余 TODO / 下一刀候选`，并在真正落地后更新状态，不保留口头完成。
- 选择原则：优先 `收益高 × 确定性高 × 可回滚 × 验证面清晰` 的切口。

## 清单

### 收敛-1 · 最小必要架构门禁

- done definition：仓库存在可执行的超长文件门禁；新增超限文件默认阻断；历史债有基线台账与消债规则。
- 当前已完成：`scripts/check-file-length.ts`、`scripts/file-length-guard-exemptions.tsv`、`pnpm run guard:file-length` 已落地，并接入 `lint`；最小回归测试与使用文档已补齐。
- 剩余 TODO：按基线台账持续压缩已豁免超长文件，优先处理业务主路径上的超长实现文件。
- 下一刀候选：结合后续功能改动，顺手把命中的豁免文件拆回阈值内，避免单开“纯拆文件”低 ROI 任务。

### 收敛-2 · plan 从语义容器收敛为触发器

- done definition：`TaskPlan` 与对外 API 统一围绕 `trigger + effect`；`Task.cron` / `Task.scheduledAt` 不再作为平行语义源；Plan 文档与实现一致。
- 当前已完成：`docs/design/workflow/minimal-semantics-rfc-2026-03-11.md` 与 `docs/design/workflow/plan.md` 已明确最小语义、触发器模型与迁移方向；设计索引与 Workflow 索引已补入口。
- 当前已完成（2026-03-24 回写）：manager plan action 已统一为 `schedule_type + effect_kind`；plan read-model/payload 只暴露 `trigger + effect + runtime progress`；旧别名 `trigger_mode/task_prompt/task_scope/task_acceptance_*` 已从 schema、prompt payload 与文档主规范移除。
- 剩余 TODO：无。后续只需在历史 RFC / TODO 文档继续清理陈旧示例，避免旧协议回流。
- 下一刀候选：维持文档与测试同步，防止新的计划协议别名再次进入 prompt/schema。

### 收敛-3 · provider 边界收缩

- done definition：provider 只保留请求编排、session 轮询与错误映射；本地 supervisor/server 生命周期职责下沉到独立模块；新增 provider 不需复制共享运行时逻辑。
- 当前已完成：worker provider 已收敛为 `codex-sdk` 单实现，`runWithProvider()` 对外契约保持不变。
- 剩余 TODO：继续压缩 provider 运行时公共层（错误建模、日志、thread id）并减少转发式包装。
- 下一刀候选：优先收敛 provider runtime 公共层，减少 `worker/provider` 链路的重复拼装逻辑。

### 收敛-4 · runtime state/type 单一真相

- done definition：runtime 持久化域遵循 `schema -> types -> parser` 单向派生；归档/快照读取不再手写平行枚举与对象结构；`RuntimeState` 对外暴露继续收缩。
- 当前已完成：`src/foundation/types/runtime-domain.ts` 已从 `src/persistence/storage/runtime-snapshot-schema.ts` 派生状态/provider/outcome/stopReason 等类型；`src/persistence/storage/task-results-read.ts` 的归档读取已复用 schema 派生解析，移除手写状态/provider/outcome/stopReason/handoff/evidence 判断；`src/kernel/orchestrator/runtime-snapshot-persist.ts` 已把 snapshot 写盘字段收为单独 slice builder，`persistRuntimeState()` 不再在写盘时原地过滤 `runtime.focusDigests`；`src/kernel/orchestrator/runtime-snapshot-hydrate.ts` 已把 snapshot→runtime 的 hydrate 赋值集中到单独 slice applier，`hydrateRuntimeState()` 只保留装配/修复顺序；`src/kernel/orchestrator/runtime-queue-reconcile.ts` 已承接 hydrate 后 queue/memory cursor 修复，避免该 repair helper 继续内嵌在 persistence 组合根；manager 已直接依赖 `runtime-state`、signals、task lifecycle 与 worker lifecycle 模块，不再保留旧的 manager runtime adapter 薄壳；已补 `tests/task-results-archive.test.ts`、`tests/runtime-snapshot.test.ts`、`tests/runtime-persistence-queue-reconcile.test.ts` 覆盖归档回读、snapshot schema / hydrate / reconcile 回归。
- 前刀验收（2026-03-11）：验证 `pnpm run review-code-changes`；commit `024337c`；结果：任务归档 `handoff/evidence` 已接入 `runtime-snapshot-schema` 派生链，`391` 个测试通过。
- 前刀验收（2026-03-11）：验证 `pnpm exec vitest run tests/runtime-persistence-queue-reconcile.test.ts tests/runtime-snapshot.test.ts`、`git diff --check`、`pnpm run review-code-changes`；commit `516af5a`；结果：runtime snapshot 写盘已收为 schema 对齐 slice builder，reserved `focusDigests` 仅过滤 snapshot payload，不再改写运行时内存；`114` 个测试文件、`392` 个测试通过。
- 前刀验收（2026-03-11）：验证 `pnpm exec vitest run tests/runtime-persistence-queue-reconcile.test.ts tests/runtime-snapshot.test.ts`、`git diff --check`、`pnpm run review-code-changes`；commit `be001fc`；结果：`hydrateRuntimeState()` 已改为通过 `src/kernel/orchestrator/runtime-snapshot-hydrate.ts` 应用 persisted slices，channel target 回补仅依赖 history 路径，hydrate/seam 回归与全量 `393` 测试均通过。
- 前刀验收（2026-03-11）：验证 `pnpm exec vitest run tests/runtime-persistence-queue-reconcile.test.ts tests/worker-pause-resume.test.ts`、`git diff --check`、`pnpm run review-code-changes`；commit `506d54d`；结果：queue cursor/memory refresh reconcile 已抽到 `src/kernel/orchestrator/runtime-queue-reconcile.ts`，`hydrateRuntimeState()` 只保留 snapshot 装配顺序，paused-task resume 路径与全量 `393` 测试继续通过。
- 本刀验收（2026-03-11）：验证 `pnpm exec tsc -p tsconfig.json --noEmit`、`pnpm exec vitest run tests/manager-action-cli-log-payload.test.ts tests/manager-loop-worker-result-guard.test.ts tests/runtime-persistence-queue-reconcile.test.ts`、`git diff --check`、`pnpm run review-code-changes`；commit `f6577a5`；结果：旧的 manager runtime adapter 薄壳当时已先收窄为显式 `RuntimeState` 契约；后续在 `2026-03-23` 已继续删除并改为 direct imports；全量 `393` 测试继续通过。
- 剩余 TODO：继续收窄 manager 直接消费的 `RuntimeState` 可变字段面，减少 `worker/ui/manager` 子状态整块透传。
- 下一刀候选：把 manager 直接消费的 runtime 读写面继续收成 action/query 所需 slice，或切换到 `收敛-3 session poller 抽离`。

### 收敛-5 · WebUI 最小工程化

- done definition：维持原生 `html/css/js`，控制器只做装配；局部状态有单一 owner；样式遵守 `base/layout/components` 分层；关键交互可做最小回归。
- 当前已完成：消息区 view state 已抽到 `webui/messages/controller-view-state.js`，`webui/messages/controller.js` 已收回 200 行阈值内；最小回归测试已覆盖消息区关键状态切换。
- 剩余 TODO：`webui/layout.css`、`webui/tasks-view-render.js` 等仍混合多类职责；对话框与面板样式重复仍高。
- 下一刀候选：优先抽离共享 dialog/panel 样式或 `tasks-view-render` 的渲染子块，避免重新把消息区 controller 做大。

## 本轮结果

- 本轮范围：连续推进 `收敛-4` 的 hydrate/runtime boundary/queue reconcile 同主题里程碑，不扩展其他收敛项。
- 本轮已完成：`be001fc` 抽出 hydrate seam；`30d7674` 把 hydrate 签名收窄到显式目标 contract；`506d54d` 抽出 queue reconcile slice；`f6577a5` 先把旧的 manager runtime adapter 薄壳收窄为显式 manager-facing `RuntimeState` 契约；`2026-03-23` 已继续删除该薄壳并改为 direct imports；对应 docs 已同步回写。
- 下一刀候选（1-3）：`收敛-4 manager runtime 读写面继续 slice 化`、`收敛-3 session poller 抽离`、`收敛-5 WebUI 共享样式/渲染子块继续收口`。
