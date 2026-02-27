# 代码质量改进清单

更新时间：2026-02-26
范围：`src/`（当前约 `11629` 行）
依据：全量代码审查（`/review-code-changes 审查 src 下的所有代码`）

---

## 优先级排序（高 → 低）

### 1. 文件持久化 → SQLite 【最高 ROI，已在 third-party-replacement-roi.md #1 立项】

见 `docs/todo/third-party-replacement-roi.md` 第 1 项，此处不重复。

---

### 2. 超 200 行文件拆分（CLAUDE.md 硬性规则）【已完成 2026-02-26】

**结果：`src/**/*.ts` 当前最大文件 199 行。**

**本轮关键拆分：**

| 原文件 | 旧行数 | 新行数 | 新增文件 |
| --- | --- | --- | --- |
| `src/orchestrator/core/orchestrator-service.ts` | 403 | 179 | `orchestrator-cron.ts` / `orchestrator-helpers.ts` / `orchestrator-runtime-ops.ts` |
| `src/manager/loop-batch-run-manager.ts` | 302 | 189 | `loop-batch-intent.ts` / `loop-batch-history.ts` / `loop-batch-manager-call.ts` / `loop-batch-stream.ts` |
| `src/providers/codex-sdk-provider.ts` | 232 | 137 | `codex-stream.ts` / `codex-sdk-provider-helpers.ts` |
| `src/http/routes-api-task-routes.ts` | 226 | 2 | `routes-api-task-archive.ts` / `routes-api-task-cancel.ts` |
| `src/manager/loop-batch.ts` | 217 | 187 | `loop-batch-pre.ts` |
| `src/history/manager-events.ts` | 207 | 132 | `history/result-events.ts` |
| `src/worker/profiled-runner.ts` | 205 | 84 | `profiled-runner-loop.ts` |
| `src/history/query.ts` | 204 | 112 | `history/query-score.ts` |
| `src/types/index.ts` | 212 | 134 | 结合 #4 自动降行 |
| `src/storage/runtime-snapshot-schema.ts` | 212 | 192 | 结合 #4 自动降行 |

---

### 3. `Task.cron` 双语义污染【已完成 2026-02-26】

**结果：**
- `Task` 明确双字段语义：`cron` 仅 cron 表达式，`scheduledAt` 仅 ISO 时间。
- 已移除 `scheduledAt -> cron` 映射兼容层（读写侧统一）。
- 关键修复点：`action-apply-create.ts`、`task-view.ts`、`webui/tasks-view.js`。

---

### 4. `types/index.ts` 与 `runtime-snapshot-schema.ts` 双源维护【已完成 2026-02-26】

**结果：**
- 以 `runtime-snapshot-schema.ts` 为单一结构源。
- `types/index.ts` 中任务/焦点/意图等核心结构改为 `z.infer<typeof ...Schema>` 推导。
- `runtime-snapshot-schema.ts` 的 normalize 逻辑改为 `z.infer` 类型闭环，删除跨文件镜像维护。

---

### 5. `MAX_RUN_ROUNDS` 不可配置

**位置：** `src/worker/profiled-runner.ts:69`

**问题：**
Worker 多轮执行上限 `MAX_RUN_ROUNDS = 3` 硬编码，无法通过 `config.ts` 调整，与 `worker.retry.maxAttempts` 配置路径不一致。

**建议修复：**
在 `AppConfig.worker` 中增加 `maxRounds: number`，默认值 `3`，在 `profiled-runner.ts` 读取 `runtime.config.worker.maxRounds`。

---

### 6. 历史检索 → Orama/MiniSearch 【已在 third-party-replacement-roi.md #4 立项】

见 `docs/todo/third-party-replacement-roi.md` 第 4 项。

补充：`src/history/query.ts` 目前使用手写 BM25 + tokenization（204 行），且 `createRequire` CJS interop hack（若存在）脆弱。迁移后可直接删除该文件。

---

## 已完成项（本次审查修复）

- ✓ `src/manager/action-feedback-collect.ts` — 硬编码 action 列表改为从 `REGISTERED_MANAGER_ACTIONS` 动态生成，消除偏移风险。
- ✓ #2 超 200 行文件拆分完成（当前最大 199 行）。
- ✓ #3 `Task.cron` 双语义修复完成，移除兼容映射层。
- ✓ #4 `types/index.ts` 与 `runtime-snapshot-schema.ts` 双源消除完成（`z.infer` 单源）。
