# Minimal Codex Coordinator 实施计划（主从 + HTTP + Resume）

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

## 关键决策
- 7x24 由主进程常驻 + 外部 supervisor 守护（systemd/launchd/pm2）。
- 任务恢复以 Markdown 账本为准；重启后重建队列。
- Worker 只负责单次执行，失败可由 Master 重试。
- 主进程保存 codexSessionId；需要连续对话时使用 resume。
- 尽量依赖 Codex 自身配置与能力，减少额外配置覆盖。

## 目录结构（建议）
- `src/cli.ts` (命令行入口: serve/ask/task)
- `src/config.ts`
- `src/server/http.ts` (HTTP 服务)
- `src/server/webui.ts` (Web UI 资产加载)
- `src/runtime/master.ts` (调度器)
- `src/runtime/worker.ts` (子进程封装)
- `src/runtime/queue.ts` (per-session 串行)
- `src/session/{store.ts, transcript.ts, lock.ts}`
- `src/memory/{files.ts, search.ts}`
- `src/agent/prompt.ts`

## 配置模型 (src/config.ts)
- `workspaceRoot`
- `codexBin` (可选, 默认使用系统 PATH)
- `codexModel` / `codexProfile` (可选, 优先使用 Codex config.toml)
- `codexSandbox` / `codexFullAuto` (可选, 仅在需要时覆盖)
- `timeoutMs`
- `maxWorkers`
- `stateDir` (任务账本 + session store)
- `memoryPaths` / `maxMemoryHits` / `maxMemoryChars`
- `resumePolicy` (`auto` | `always` | `never`)
- `outputPolicy` (简明输出约束, 追加到子进程 prompt)
- `maxIterations` (verifyCommand 重试上限)
- `triggerSessionKey` / `triggerOnFailurePrompt` (失败 follow-up)

## 配置最小化原则
- 仅保留协调器必需配置（stateDir、queue、memory、resume、outputPolicy、maxIterations、trigger）。
- Codex 相关配置优先走 `~/.codex/config.toml`；只有明确需求时才覆盖。
- Worker 调用时避免强行指定 model/profile/sandbox，除非用户显式配置。

## 数据模型
- Session store (JSON):
  - `sessionKey -> { sessionId, updatedAt, transcriptPath, codexSessionId? }`
- Transcript JSONL:
  - `{ type: "message", role: "user"|"assistant", text, ts, sessionId, runId, error? }`
- Task ledger (Markdown):
  - `taskId` 为主键；每次状态变更追加一段记录。

## 任务账本格式（Markdown）
- 文件: `<stateDir>/tasks.md`
- 约定格式（追加写入，允许多段）:

```
## Task <taskId>
- status: queued|running|done|failed
- sessionKey: <key>
- runId: <runId>
- retries: <n>
- attempt: <n>
- createdAt: <iso>
- updatedAt: <iso>
- resume: auto|always|never
- verifyCommand: <cmd?>
- maxIterations: <n?>
- triggeredByTaskId: <id?>
- codexSessionId: <id?>
- prompt: |
  <user prompt...>
- result: |
  <assistant text or error...>
```

## Resume 规则
- `resume=auto`: 有 `codexSessionId` 时使用 `codex exec resume`；没有则新会话。
- `resume=always`: 必须有 `codexSessionId`，否则返回错误或降级新会话（可配置）。
- `resume=never`: 始终新会话。
- 如果 run 被提前中断而未获得 sessionId，下一次应降级新会话或由用户手动指定。

## 恢复规则（启动时）
- 解析 tasks.md 得到最新状态视图。
- `queued` -> 重新入队。
- `running` -> 视为中断，回到 `queued` 并 `retries+1`。
- `failed` -> 可配置是否重试；默认不重试。
- `done` -> 不处理。

## Phase 0: Repo bootstrap
1) 初始化 `package.json` / `tsconfig.json` / `src/cli.ts`；依赖 `tsx`。
2) 配置加载 (env + config file)。

## Phase 1: Master + HTTP 服务
3) HTTP server:
   - `GET /` Web UI。
   - `POST /tasks` 提交任务（含 sessionKey + resume）。
   - `GET /tasks/:id` 查询任务。
   - `GET /health` 健康检查。
4) Master 调度器:
   - 维护任务队列、并发控制 `maxWorkers`。
   - 负责写入/更新 tasks.md。
   - verifyCommand 失败时重试，失败可触发 follow-up。

## Phase 2: Worker 执行
5) Worker 子进程:
   - 若需要 resume：`codex exec resume <id> <prompt>`。
   - 否则：`codex exec <prompt>`。
   - stdin 写入 prompt，解析 JSONL 事件流提取最终回复。
   - 从 JSON 事件 `thread.started.thread_id` 获取 `codexSessionId`，写回 session store。
   - 失败/超时 -> 返回错误给 Master。

## Phase 3: Session 与 Transcript
6) Session store:
   - JSON 文件，自动创建。
7) Transcript:
   - JSONL append-only；每次 run 追加 user/assistant。
8) 文件锁:
   - `<transcript>.lock` + pid + timestamp；超时/僵尸锁回收。

## Phase 4: Memory (rg)
9) 文件发现:
   - MEMORY.md + memory/**/*.md (递归)。
10) `rg` 搜索:
   - `rg -n --no-heading <query> <paths...>`；去重/截断。
11) Prompt 注入:
   - `Memory Context` 块 + `path:line text`；超出 `maxMemoryChars` 截断。
   - `Output Policy` 块：要求最简答复/限制行数与长度。

## Output Policy 模板（追加到子进程 prompt）
- 建议默认文本（可配置）:

```
Output Policy:
- 只输出最终答案，不输出思考过程。
- 尽量简短，最多 6 行；超过则先给摘要。
- 不重复题目，不复述上下文。
```

## Phase 5: CLI 入口
12) `serve`:
   - 启动 HTTP + Master（7x24 运行入口）。
13) `ask`:
   - `ask --session <key> --message "..." [--resume auto|always|never] [--verify "<cmd>"] [--max-iterations <n>]`。
14) `task`:
   - 查询任务状态或重新入队。

## 验收与手测
- `tsx src/cli.ts serve --port 8787` 后提交任务，确认可返回结果。
- 人为 kill 进程后重启，确认 `running` 任务回到队列。
- 同 session 多次任务，确认 resume 生效与 transcript 连续。

## 风险与缓解
- Codex JSONL 格式变化 -> 容错解析 + `--output-last-message` 兜底。
- tasks.md 过大 -> 周期归档（可选）。
- `rg` 不存在 -> fallback `grep`。

## 计划复核（目标与最小化）
- 7x24：主进程常驻 + 外部守护（systemd/launchd/pm2）+ 任务恢复策略，满足持续运行与自动恢复。
- 最小化：仅包含 HTTP/Web UI、Master/Worker、Markdown 持久化、`rg` 检索、verify 重试、`tsx` 直跑；刻意不引入 streaming/向量索引/metrics/lessons/guard/score/构建流程。
