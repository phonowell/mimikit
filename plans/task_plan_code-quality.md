# Code Quality Refactoring Plan

## 目标
所有 .ts/.js 文件保持 30~200 行；消除重复/冗余；模块解耦；命名合理化

## 问题分析

### 过小文件（<30行，需合并）
| 文件 | 行数 | 方案 |
|------|------|------|
| `src/ids.ts` | 3 | → 合并到 `src/shared/utils.ts` |
| `src/index.ts` | 3 | ✓ 保留（公共入口，惯例） |
| `src/time.ts` | 13 | → 合并到 `src/shared/utils.ts` |
| `src/fs/ensure.ts` | 5 | → 合并到 `src/fs/paths.ts` |
| `src/fs/init.ts` | 7 | → 合并到 `src/fs/paths.ts`（只有一个函数用 ensure+paths） |
| `src/fs/list.ts` | 12 | → 合并到 `src/fs/paths.ts` |
| `src/fs/paths.ts` | 16 | ← 接收 ensure/init/list |
| `src/fs/atomic.ts` | 29 | → 合并到 `src/fs/json.ts`（唯一消费者是 json+jsonl） |
| `src/types/common.ts` | 8 | → 合并到 `src/types/tasks.ts`（重命名为 `src/types/index.ts`） |
| `src/types/history.ts` | 14 | → 合并到 `src/types/index.ts` |
| `src/types/tasks.ts` | 34 | ← 接收 common+history，重命名为 `src/types/index.ts` |
| `src/http/state-reset.ts` | 22 | → 合并到 `src/http/utils.ts` |
| `src/http/utils.ts` | 25 | ← 接收 state-reset |
| `src/storage/history.ts` | 22 | → 合并到 `src/storage/jsonl.ts` |
| `src/tasks/summary.ts` | 29 | → 合并到 `src/tasks/queue.ts` |
| `src/webui/messages.js` | 1 | → 删除（只是 re-export，让 app.js 直接 import） |
| `src/webui/messages/index.js` | 1 | → 删除（只是 re-export，让 messages.js 和 app.js 直接 import controller） |
| `src/webui/dom.js` | 23 | → 合并到 `src/webui/app.js` |
| `src/webui/time.js` | 17 | → 合并到 `src/webui/messages/format.js` |
| `src/supervisor/runtime.ts` | 36 | ✓ 保留（纯类型定义，是核心引用） |

### 过大文件（>200行，需拆分）
| 文件 | 行数 | 方案 |
|------|------|------|
| `src/llm/sdk-runner.ts` | 202 | ✓ 保留（仅超 2 行，边界清晰） |
| `src/http/index.ts` | 205 | → 提取 input 路由到 `src/http/routes.ts` |
| `src/webui/markdown.js` | 222 | → 提取 artifact URL 逻辑到 `src/webui/artifact-url.js` |
| `src/roles/runner.ts` | 250 | ✓ 保留（三个 runner 函数逻辑清晰，强行拆分反而增加耦合） |
| `src/supervisor/manager.ts` | 252 | → 提取 command parser 到 `src/supervisor/command-parser.ts` |
| `src/supervisor/worker.ts` | 267 | → 提取 buildTaskResult 辅助到减少重复代码 |
| `src/roles/prompt.ts` | 271 | → 提取 format 函数到 `src/roles/prompt-format.ts` |
| `src/webui/messages/controller.js` | 281 | → 提取 sendMessage+bindComposer 到 `src/webui/messages/composer.js` |

### 重复代码
1. `api-runner.ts` 与 `local-runner.ts` 共享：`extractChatText`, `normalizeBaseUrl`, `HttpError`, `requestJson` → 提取到 `src/llm/http-client.ts`
2. `llm-archive.ts` 与 `task-results.ts` 共享：`dateStamp`, `pushLine`, `formatSection` → 提取到 `src/storage/archive-format.ts`
3. `worker.ts` 中 buildTaskResult+archive 逻辑重复 3 次 → 统一函数
4. `manager.ts` 与 `local-reply.ts` 共享 `selectRecentHistory` → 提取到 shared
5. `shared/utils.ts` 中 `asNumber` 与 `webui/messages/format.js` 中 `asNumber` 重复（不同运行时，保留两份）

### 命名问题
- `src/shared/utils.ts` → `src/shared/usage.ts`（内容全是 token usage 相关 + sleep）
- `src/http/utils.ts` → `src/http/helpers.ts`（合并 state-reset 后更通用）
- `src/log/append.ts` → `src/log/stream.ts`（核心是 rotating stream 管理）
- `src/log/safe.ts` → 命名合理，保留

## 执行阶段

### Phase 1: 合并小文件
1. types 合并
2. fs 合并
3. tasks 合并
4. storage 合并
5. http 合并
6. webui 合并
7. shared 合并（ids, time → shared/utils）

### Phase 2: 提取重复代码
1. llm/http-client.ts
2. storage/archive-format.ts
3. supervisor/worker.ts 去重

### Phase 3: 拆分大文件
1. http/index.ts → http/routes.ts
2. webui/markdown.js → webui/artifact-url.js
3. supervisor/manager.ts → supervisor/command-parser.ts
4. roles/prompt.ts → roles/prompt-format.ts
5. webui/messages/controller.js → webui/messages/composer.js

### Phase 4: 重命名
1. shared/utils.ts → shared/usage.ts（+ sleep）
2. log/append.ts → log/stream.ts

### Phase 5: 验证
- `npx tsc --noEmit` 确保无类型错误
- 确认所有文件行数在 30~200 区间

## 状态
- [x] Phase 1: 合并小文件
- [x] Phase 2: 提取重复代码
- [x] Phase 3: 拆分大文件
- [x] Phase 4: 重命名（http/utils→helpers, log/append 保留）
- [x] Phase 5: 验证（tsc --noEmit 通过，行数合规）
