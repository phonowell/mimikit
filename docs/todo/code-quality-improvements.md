# 代码质量改进清单

更新时间：2026-02-26
范围：`src/`（当前约 `11182` 行）
依据：全量代码审查（`/review-code-changes 审查 src 下的所有代码`）

---

## 优先级排序（高 → 低）

### 1. 文件持久化 → SQLite 【最高 ROI，已在 third-party-replacement-roi.md #1 立项】

见 `docs/todo/third-party-replacement-roi.md` 第 1 项，此处不重复。

---

### 2. 超 200 行文件拆分（CLAUDE.md 硬性规则）

**违规文件（10 个）：**

| 文件 | 行数 | 建议拆法 |
| --- | --- | --- |
| `src/orchestrator/core/orchestrator-service.ts` | 403 | 抽出 cron 操作（`addCronJob/cancelCronJob/cloneCronJob`）到 `orchestrator-cron.ts`；辅助函数（`computeOrchestratorStatus`/`toUserInputLogMeta`）到 `orchestrator-helpers.ts` |
| `src/manager/loop-batch-run-manager.ts` | 302 | 抽出 intent 触发逻辑到 `loop-batch-intent.ts`；history lookup 调用到 `loop-batch-history.ts` |
| `src/providers/codex-sdk-provider.ts` | 232 | 抽出 Codex 流式处理到 `codex-stream.ts`；工具解析到 `codex-tool-call.ts` |
| `src/http/routes-api-task-routes.ts` | 226 | 抽出归档路由到 `routes-api-task-archive.ts`；取消路由到 `routes-api-task-cancel.ts` |
| `src/manager/loop-batch.ts` | 217 | 抽出 batch 前处理（intent/history 解析）到 `loop-batch-pre.ts` |
| `src/types/index.ts` | 212 | 按领域拆分：`types/task.ts` / `types/focus.ts` / `types/intent.ts` / `types/provider.ts`，再由 `types/index.ts` re-export |
| `src/storage/runtime-snapshot-schema.ts` | 212 | 随 #1 SQLite 迁移一并解决；迁移前可按 task/focus/intent 拆子 schema |
| `src/history/manager-events.ts` | 207 | 抽出 result 历史写入到 `history/result-events.ts` |
| `src/worker/profiled-runner.ts` | 205 | 抽出工具调用循环到 `profiled-runner-loop.ts` |
| `src/history/query.ts` | 204 | 抽出 tokenization/scoring 到 `history/query-score.ts` |

**操作原则：** 仅移动，不改逻辑；每次只拆一个文件并同步更新 imports。

---

### 3. `Task.cron` 双语义污染

**位置：** `src/types/index.ts`、`src/orchestrator/core/task-lifecycle.ts`、`src/manager/action-apply-create.ts:181`

**问题：**
`Task.cron` 字段同时承载两种含义：
- cron 表达式（`* * * * *`）
- `scheduledAt` ISO 字符串（`2026-03-01T09:00:00.000Z`）

`action-apply-create.ts:181` 里 `...(cron ? { cron } : scheduledAt ? { cron: scheduledAt } : {})` 将 scheduledAt 塞入 `cron` 字段，语义混淆，未来调试困难。

**建议修复：**
```ts
// types/index.ts
export type Task = {
  // 改为语义更准确的 schedule 字段，值可为 cron 表达式或 ISO 时间
  schedule?: string
  // 移除 cron
}
```
或拆为两个可选字段 `cronExpr?: string` + `scheduledAt?: string`，在 `task-state.ts`、`loop-cron.ts`、`profiled-runner.ts`、`format-content.ts` 相应处理分支。

---

### 4. `types/index.ts` 与 `runtime-snapshot-schema.ts` 双源维护

**位置：** `src/types/index.ts`（212 行）、`src/storage/runtime-snapshot-schema.ts`（212 行）

**问题：**
两文件结构高度镜像（35 个 TS type vs 30 个 Zod schema），每次新增字段需同步改两处，容易遗漏。

**建议修复（短期）：**
从 Zod schema 自动推导 TS 类型，删除 `types/index.ts` 中重复的手写类型：
```ts
// 以 Zod 为单一源
export type Task = z.infer<typeof taskSchema>
```
中期配合 #1 SQLite 迁移时，schema 改为 SQL DDL + Zod 解析层，彻底消除双源。

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
