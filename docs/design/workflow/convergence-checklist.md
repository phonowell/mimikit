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
- 剩余 TODO：把 action/http/read-model 中仍以 `trigger_mode + cron + scheduled_at` 暴露的接口，迁到统一 trigger 载荷；清理 task 上残留 schedule 双写语义。
- 下一刀候选：先收敛 plan payload / view-model 的 trigger 出口，再推进 action 输入面，避免一次横切太宽。

### 收敛-3 · provider 边界收缩

- done definition：provider 只保留请求编排、session 轮询与错误映射；本地 supervisor/server 生命周期职责下沉到独立模块；新增 provider 不需复制共享运行时逻辑。
- 当前已完成：`opencode` provider 的共享 server 池已抽到 `src/providers/opencode/server-pool.ts`，provider 首刀边界已缩小，`runWithProvider()` 对外契约保持不变。
- 剩余 TODO：继续拆出 session 轮询 / preflight / 错误映射中最稳定的独立职责；持续压缩 `src/providers/opencode-sdk-provider.ts`。
- 下一刀候选：优先抽离 session 轮询或响应解析前置逻辑，保持 `runWithProvider()` 契约不变。

### 收敛-4 · runtime state/type 单一真相

- done definition：runtime 持久化域遵循 `schema -> types -> parser` 单向派生；归档/快照读取不再手写平行枚举与对象结构；`RuntimeState` 对外暴露继续收缩。
- 当前已完成：`src/types/runtime-domain.ts` 已从 `src/storage/runtime-snapshot-schema.ts` 派生状态/provider/outcome/stopReason 等类型；`src/storage/task-results-read.ts` 的归档读取已复用 schema 派生解析，移除手写状态/provider/outcome/stopReason/handoff/evidence 判断；`src/orchestrator/core/runtime-snapshot-persist.ts` 已把 snapshot 写盘字段收为单独 slice builder，`persistRuntimeState()` 不再在写盘时原地过滤 `runtime.focusDigests`；已补 `tests/task-results-archive.test.ts` 与 `tests/runtime-persistence-focus-digests.test.ts` 覆盖归档回读与“snapshot 过滤不污染内存态”回归。
- 前刀验收（2026-03-11）：验证 `pnpm run review-code-changes`；commit `024337c`；结果：任务归档 `handoff/evidence` 已接入 `runtime-snapshot-schema` 派生链，`391` 个测试通过。
- 本刀验收（2026-03-11）：验证 `pnpm exec vitest run tests/runtime-persistence-queue-reconcile.test.ts tests/runtime-persistence-focus-digests.test.ts`、`git diff --check`、`pnpm run review-code-changes`；commit `516af5a`；结果：runtime snapshot 写盘已收为 schema 对齐 slice builder，reserved `focusDigests` 仅过滤 snapshot payload，不再改写运行时内存；`114` 个测试文件、`392` 个测试通过。
- 剩余 TODO：继续把 runtime snapshot 持久化字段与 `RuntimeState` slice / adapter API 收回同一派生链，尤其是 hydrate / adapter 侧仍保留的总对象透传。
- 下一刀候选：优先收敛 `hydrateRuntimeState()` / `runtime-adapter` 的相邻 slice 出口，避免 `RuntimeState` 继续作为跨层总对象扩张。

### 收敛-5 · WebUI 最小工程化

- done definition：维持原生 `html/css/js`，控制器只做装配；局部状态有单一 owner；样式遵守 `base/layout/components` 分层；关键交互可做最小回归。
- 当前已完成：消息区 view state 已抽到 `webui/messages/controller-view-state.js`，`webui/messages/controller.js` 已收回 200 行阈值内；最小回归测试已覆盖消息区关键状态切换。
- 剩余 TODO：`webui/layout.css`、`webui/tasks-view-render.js` 等仍混合多类职责；对话框与面板样式重复仍高。
- 下一刀候选：优先抽离共享 dialog/panel 样式或 `tasks-view-render` 的渲染子块，避免重新把消息区 controller 做大。

## 本轮结果

- 本轮范围：仅推进 `收敛-4` 的 runtime snapshot 写盘 slice 化，不扩展其他收敛项。
- 本轮已完成：`persistRuntimeState()` 已改为经 `src/orchestrator/core/runtime-snapshot-persist.ts` 组装 snapshot；新增 `tests/runtime-persistence-focus-digests.test.ts` 锁定“snapshot 过滤不污染内存态”回归；代码提交 `516af5a` 已推送到 `main`。
- 下一刀候选（1-3）：`收敛-4 hydrate/runtime-adapter slice 化`、`收敛-2 plan payload/view trigger 化`、`收敛-3 session poller 抽离`。
