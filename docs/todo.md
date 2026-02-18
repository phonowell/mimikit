# TODO：JSON 持久化迁移方案（待实现）

## 目标

- 在不引入在线服务的前提下，用本地第三方库替换高维护成本实现。
- 保留 `.mimikit` 可直接删除重置的工作流。
- 保持现有任务语义：queue/cursor、取消、恢复、归档行为不变。

## 范围与约束

- 范围：仅替换持久化与基础设施层，不改产品交互语义。
- 约束：状态文件继续落在 `.mimikit/` 下，保持 IDE 可直接查看。
- 非目标：不替换 orchestrator/manager/worker 的核心状态机逻辑。

## P0：本地持久化底座

- 目标文件：
  - `src/storage/jsonl.ts`
  - `src/storage/serialized-lock.ts`
  - `src/storage/history-jsonl.ts`
  - `src/storage/task-progress.ts`
  - `src/streams/queue-primitives.ts`
- 建议库：
  - `proper-lockfile`
  - `write-file-atomic`
  - `stream-json`
  - `lowdb`（仅用于小状态对象）
- 结果：
  - 用库替代手写锁与部分文件读写流程。
  - 保留现有 queue/cursor 消费语义与压缩策略。

## P0：历史检索

- 目标文件：
  - `src/manager/history-query.ts`
- 建议库：
  - `flexsearch`（索引可落盘到 `.mimikit`）
- 结果：
  - 替换 BM25 手写拼装与回退检索逻辑。
  - 保持 `query_history` action 协议不变。

## P1：HTTP 校验与路由 schema

- 目标文件：
  - `src/http/helpers.ts`
  - `src/http/routes-api.ts`
  - `src/http/routes-api-sections.ts`
- 建议库：
  - `fastify-type-provider-zod`
- 结果：
  - 路由参数与 body 校验声明化。
  - 减少手写 parse/guard 分支与重复错误处理。

## P1：日志与错误包装

- 目标文件：
  - `src/log/append.ts`
  - `src/log/safe.ts`
- 建议库：
  - `pino`
  - `pino-roll`（或保留现有轮转，仅替换 logger）
- 结果：
  - 统一结构化日志。
  - 减少日志管线样板代码。

## P2：归档解析（可选）

- 目标文件：
  - `src/storage/task-results-read.ts`
  - `src/storage/archive-format.ts`
- 建议库：
  - `gray-matter`
- 结果：
  - 归档头元数据标准化。
  - 减少手写 header/section 解析代码。

## 实施顺序

1. P0 持久化底座
2. P0 历史检索
3. P1 HTTP schema
4. P1 日志层
5. P2 归档解析

## 验收标准

- 重启后 `tasks/cursor/plannerSessionId` 恢复行为不变。
- `inputs/results` 队列无重复消费、无漏消费。
- `query_history` 输出结构与现有协议兼容。
- `/api/messages`、`/api/tasks`、`/api/tasks/:id/progress` 行为一致。
- 删除 `.mimikit` 后可完整重置并重新启动。

## 风险与缓解

- 风险：JSON 文件规模增长导致读取变慢。
- 缓解：引入流式读取与按需归档；必要时增加定期 compact。
- 风险：替换锁机制后出现并发竞态。
- 缓解：先替换单点写入路径并补回归测试，再扩面。

## 备注

- 本方案优先“轻量与可读性”，先不引入 SQLite。
- 若后续出现并发/检索瓶颈，再评估局部升级（JSON 真相源 + 索引层单独演进）。
