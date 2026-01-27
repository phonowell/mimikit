# Task Plan: verify-functionality

## 目标
- 验证 CLI + HTTP 服务 + 任务账本/会话/Worker/Memory 能正常运行；如失败则修复并复测。

## 范围
- 仅做必要修复以恢复功能，不新增特性。
- 验证以本地 CLI/HTTP 交互为主，必要时进行最小手测。

## 关键参考
- src/cli.ts:28
- src/cli.ts:62
- src/cli.ts:82
- src/config.ts:76
- src/server/http.ts:38
- src/runtime/master.ts:55
- src/runtime/worker.ts:64
- src/runtime/ledger.ts:54
- src/session/store.ts:32
- src/session/lock.ts:35
- src/memory/search.ts:81
- src/agent/prompt.ts:10
- docs/minimal-architecture.md:1
- docs/minimal-implementation-plan.md:1

## 计划步骤
1) 明确验证路径与预期行为：CLI 命令/HTTP 端点/状态目录与账本产物（src/cli.ts:28, src/server/http.ts:38, src/runtime/ledger.ts:54）。
2) 校验运行前置与配置：加载 config、stateDir、memory 搜索路径等（src/config.ts:76, src/memory/search.ts:81）。
3) 执行静态校验（lint/test）并记录失败点与堆栈；如失败，定位至具体文件/函数修复（package.json scripts）。
4) 启动 serve 并验证 HTTP/任务流程：/health -> /tasks -> /tasks/:id；覆盖 worker 与 transcript 产物（src/runtime/master.ts:55, src/runtime/worker.ts:64, src/session/transcript.ts:15）。
5) 若任一阶段失败：记录错误 -> 修复对应文件 -> 复测步骤 3-4，直到通过或出现外部依赖阻塞。

## 交付物
- 终端验证结果与修复说明（对话中交付）。

## 风险/假设（推测，待确认）
- 本机可用 `codex` CLI；否则 worker 运行会失败。
- 端口 8787 可用，`.mimikit` 状态目录可写。
- `pnpm` 可用或至少能直接运行 `tsx`。

## 状态
- [x] Step 1
- [x] Step 2
- [x] Step 3
- [x] Step 4
- [x] Step 5

## 记录
- Step 1: 已核对 CLI 命令（serve/ask/task）、HTTP 端点（/health, /tasks, /tasks/:id）与任务账本写入位置（stateDir/tasks.md）。
- Step 2: 配置加载使用 workspaceRoot=process.cwd()，stateDir 默认 `.mimikit`；memoryPaths 若空则搜索 `MEMORY.md`/`memory/`；codex 相关参数可选。
- Step 3: `pnpm lint` 通过；`pnpm test` 输出 “no tests”。
- Step 4: `pnpm serve -- --port 8787` 启动成功；`/health` 返回 `{\"ok\":true}`；提交任务后 `/tasks/:id` 状态 `done`，result `Hi!`，并生成 `.mimikit/tasks.md` 与 `.mimikit/sessions/smoke.jsonl`。
- Step 5: 未发现失败点，无需修复与复测循环。
