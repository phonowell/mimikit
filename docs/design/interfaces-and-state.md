# 接口与状态目录（当前实现）
> 返回 [系统设计总览](./README.md)

## HTTP API
- `GET /api/status`
- `POST /api/input`
- `GET /api/messages?limit=...`
- `GET /api/messages/export?limit=...`
- `GET /api/tasks?limit=...`
- `GET /api/tasks/:id/archive`
- `GET /api/tasks/:id/progress`
- `POST /api/tasks/:id/cancel`
- `GET /api/focuses`
- `POST /api/focuses/:id/expire`
- `POST /api/focuses/:id/restore`
- `POST /api/restart`
- `POST /api/reset`

实现：`src/http/index.ts`、`src/http/routes-api.ts`、`src/http/routes-api-sections.ts`

HTTP 路由共享约束：
- ETag 逻辑统一在 `src/http/etag.ts`（`/api/status`、`/api/messages` 同源行为）。
- `POST /api/input` 的 body 校验统一在 `src/http/helpers.ts`（zod `safeParse`）。
- `messages/tasks` 的 `limit` 归一化统一在 `src/http/helpers.ts`（容错回退默认值）。
- `:id` 参数校验与任务存在性校验统一在 `src/http/routes-api-sections.ts` 内部 helper。

## CLI
- `tsx src/cli/index.ts`
- `tsx src/cli/index.ts --port 8787`
- `tsx src/cli/index.ts --work-dir .mimikit`

## 核心环境变量
- `MIMIKIT_MODEL`
- `MIMIKIT_MANAGER_MODEL`
- `MIMIKIT_WORKER_STANDARD_MODEL`
- `MIMIKIT_WORKER_SPECIALIST_MODEL`
- `MIMIKIT_REASONING_EFFORT`
- `MIMIKIT_WORKER_SPECIALIST_REASONING_EFFORT`
- `MIMIKIT_MANAGER_PROMPT_MAX_TOKENS`
- `MIMIKIT_MANAGER_CREATE_TASK_DEBOUNCE_MS`

## 桌面通知（Node）
- 通知实现：`src/notify/node-notifier.ts`
- 触发来源：`src/worker/result-finalize.ts` 与 `src/worker/cancel-task.ts`
- 策略：
  - `failed`/`canceled` 立即通知
  - `succeeded` 仅 `specialist` 或耗时 `>=60s`
  - `deferred` 成功不通知
  - 成功通知 5 秒聚合窗口 + 1.5 秒最小间隔
- 约束：不暴露配置项，运行时始终尝试发送；系统不支持时忽略错误，不影响主流程

## 状态目录
默认目录：`./.mimikit/`

- `history/YYYY-MM-DD.jsonl`
- `log.jsonl`
- `runtime-snapshot.json`
- `inputs/packets.jsonl`
- `results/packets.jsonl`
- `tasks/tasks.jsonl`
- `task-progress/{taskId}.jsonl`
- `tasks/YYYY-MM-DD/*.md`
- `traces/YYYY-MM-DD/<ts36><ra>.txt`（`ts36`=9 位毫秒时间戳 base36；`ra`=`m|w` + `p|f|n`）
- `user_profile.md`
- `agent_persona.md`
- `agent_persona_versions/*.md`

状态写入共享约束：
- JSONL 串行写锁：`src/storage/serialized-lock.ts`（进程内串行 + `proper-lockfile` 文件锁）。
- JSONL 读取：`src/storage/jsonl.ts` 使用 `stream-json` 流式解析。
- 按日期归档写入：`src/storage/archive-write.ts`（`tasks` 与 `traces` 复用）。
- 归档元数据：`src/storage/archive-format.ts` 使用 front matter（`gray-matter`）。

## Manager 唤醒约束
- 唤醒来源仅三类：`user_input`、`task_result`、`cron`
- 三类均为实时 signal（`notifyManagerLoop`）
- manager 推理输入来自 `inputs/results/history`

## Prompt 环境注入
- 位置：`M:environment`（manager/worker 系统提示）
- 字段：
  - `work_dir`：当前工作目录绝对路径
  - `client_time_zone`：客户端时区（若可用）
  - `client_now_iso`：客户端当前时间 ISO 8601（若可用）
- 约束：不再注入 `now_iso`

## Runtime Snapshot 约束
- schema：`src/storage/runtime-snapshot-schema.ts`
- `runtime-snapshot.queues` 仅包含：
  - `inputsCursor`
  - `resultsCursor`
- 对话重心字段：
  - `focuses[]`：`active|expired` 重心集合
  - `managerTurn`：manager 会话轮次计数
- 主会话恢复字段：
  - `plannerSessionId`
- 旧 grouped channel 结构不再兼容解析。
