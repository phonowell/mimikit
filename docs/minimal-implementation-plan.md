# Minimal Codex Coordinator 实施计划（主从 + HTTP + Resume）

## 关联文档
- 架构说明：docs/minimal-architecture.md
- 决策备注：docs/minimal-notes.md
- Codex exec 备忘：docs/codex-exec-reference.md

## 目标
- 7x24 常驻运行，提供 HTTP 接口接受任务。
- 主进程负责接收/调度/响应；子进程负责执行 (codex exec)。
- 主进程持久化任务与会话；子进程状态可丢失。
- Codex 会话可按需 resume，避免重复塞回历史。
- 运行时使用 `tsx` 直接执行 TypeScript，不做 build。

## 范围（做）
- 常驻 HTTP 服务（任务提交/查询/健康检查）。
- Web UI（`GET /` 静态页面）。
- Master 任务队列 + Worker 子进程执行。
- Markdown 任务账本（持久化 + 恢复）。
- Session JSONL transcript（对话连续性审计）。
- Codex sessionId 持久化 + resume 控制。
- Memory 搜索：`MEMORY.md` + `memory/*.md` + `rg`。
- 可选 verifyCommand 重试 + 失败 follow-up 任务（可配置）。

## 范围（不做）
- 流式输出 / WebSocket / 多渠道适配。
- 向量索引 / embedding。
- 插件系统。
- metrics/lessons/guard/score。

## 阶段与任务
### Phase 0: Repo bootstrap
1) 初始化 `package.json` / `tsconfig.json` / `src/cli.ts`；依赖 `tsx`。
2) 配置加载 (env + config file)。

### Phase 1: Master + HTTP 服务
3) HTTP server:
   - `GET /` Web UI。
   - `POST /tasks` 提交任务（含 sessionKey + resume）。
   - `GET /tasks/:id` 查询任务。
   - `GET /health` 健康检查。
4) Master 调度器:
   - 维护任务队列、并发控制 `maxWorkers`。
   - 负责写入/更新 tasks.md。
   - verifyCommand 失败时重试，失败可触发 follow-up。

### Phase 2: Worker 执行
5) Worker 子进程:
   - 若需要 resume：`codex exec resume <id> <prompt>`。
   - 否则：`codex exec <prompt>`。
   - stdin 写入 prompt，解析 JSONL 事件流提取最终回复。
   - 从 JSON 事件 `thread.started.thread_id` 获取 `codexSessionId`，写回 session store。
   - 失败/超时 -> 返回错误给 Master。

### Phase 3: Session 与 Transcript
6) Session store:
   - JSON 文件，自动创建。
7) Transcript:
   - JSONL append-only；每次 run 追加 user/assistant。
8) 文件锁:
   - `<transcript>.lock` + pid + timestamp；超时/僵尸锁回收。

### Phase 4: Memory 与 Prompt
9) 文件发现:
   - MEMORY.md + memory/**/*.md (递归)。
10) `rg` 搜索:
   - `rg -n --no-heading <query> <paths...>`；去重/截断。
11) Prompt 注入:
   - `Memory Context` 块 + `path:line text`；超出 `maxMemoryChars` 截断。
   - `Output Policy` 块按配置追加。

### Phase 5: CLI 入口
12) `serve`:
   - 启动 HTTP + Master（7x24 运行入口）。
13) `task`:
   - 查询任务状态或重新入队。
14) `compact-tasks`:
   - 压缩 tasks.md，仅保留每个 task 最新记录（需停止服务或 `--force`）。

## 验收与手测
- `tsx src/cli.ts serve --port 8787` 后提交任务，确认可返回结果。
- 人为 kill 进程后重启，确认 `running` 任务回到队列。
- 同 session 多次任务，确认 resume 生效与 transcript 连续。
