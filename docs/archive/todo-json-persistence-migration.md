# JSON 持久化迁移（已完成）

完成日期：2026-02-18

## 目标结论

- ✓ 全量替换已完成；无运行期兼容层。
- ✓ `.mimikit` 目录结构保持可读、可直接删除重置。
- ✓ queue/cursor、取消、恢复、归档语义保持不变。

## 实施结果

### P0：本地持久化底座

- ✓ `src/storage/serialized-lock.ts`
  - 引入 `proper-lockfile`，实现进程内串行 + 文件锁。
- ✓ `src/storage/jsonl.ts`
  - 引入 `stream-json`（JSONL 流式读取）；
  - 保留 `write-file-atomic` 原子写；
  - 追加写改为标准 UTF-8 append。
- ✓ `src/streams/queue-primitives.ts`
  - 删除重复锁实现，统一复用 `serialized-lock`。
- ✓ `src/storage/task-progress.ts`
  - 目录准备统一复用 `src/fs/paths.ts`。
- ✓ `src/storage/history-jsonl.ts`
  - 保持分区与上限策略，复用新锁与新 JSONL I/O。

### P0：历史检索

- ✓ `src/manager/history-query.ts`
  - `wink-bm25-text-search` → `flexsearch`；
  - 删除手写回退检索分支；
  - `query_history` 协议与输出结构保持不变。

### P1：HTTP 输入校验与参数归一化

- ✓ `src/http/helpers.ts`
  - `POST /api/input` 统一 zod `safeParse` 校验与错误语义收敛。
  - `messages/tasks` `limit` 参数统一容错归一化（非法值回退默认值）。
- ✓ `src/http/routes-api.ts`
  - 保留 SSE/ETag 与输入路由语义；
  - 保留原错误语义（`text is required`）。
- ✓ `src/http/routes-api-sections.ts`
  - `:id` 路由参数与任务存在性校验统一内部 helper 处理。

### P1：日志层

- ✓ `src/log/append.ts`
  - 引入 `pino`；
  - 保留现有 `rotating-file-stream` 轮转策略；
  - `safe.ts` 调用接口保持不变。

### P2：归档解析

- ✓ `src/storage/archive-format.ts`
  - 引入 `gray-matter`，归档元数据改为 front matter。
- ✓ `src/storage/task-results-read.ts`
  - 使用新解析接口读取 header/section。

## 模块边界

- ✓ HTTP 路由保持分段注册与职责分层（`helpers`/`routes-api`/`routes-api-sections`）。
- ✓ 路由参数归一化、路由实现、任务段路由职责分层隔离。
- ✓ `queue` 不再维护独立锁逻辑，统一走 `storage` 基础设施。

## 验证

- ✓ `pnpm lint`
- ✓ `pnpm type-check`
- ✓ `pnpm test`（27/27）
