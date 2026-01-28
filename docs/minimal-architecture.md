# Minimal Codex Coordinator 架构说明（主从 + HTTP + Resume）

## 关联文档
- 实施计划：docs/minimal-implementation-plan.md
- 决策备注：docs/minimal-notes.md
- Codex exec 备忘：docs/codex-exec-reference.md

## 组件
- Master 进程: 常驻运行，提供 HTTP 服务，负责任务调度与持久化。
- Worker 子进程: 由 Master 创建，执行单次 `codex exec` 或 `codex exec resume`。
- Session Store: JSON 存储 session 元数据（含 codexSessionId）。
- Transcript Store: JSONL 对话日志（审计）。
- Task Ledger: Markdown 任务账本（恢复依据）。
- Memory Search: `rg` 全文检索 + 片段注入。
- Verify Loop: 可选 `verifyCommand` 重试。
- Failure Trigger: 失败时可触发 follow-up 任务（可选）。
- Self-Eval: 启发式/可选 LLM 评估，记录 lessons，问题可触发 follow-up。
- Heartbeat: 周期写入运行状态 JSON。
- Web UI: 静态资产页面，用于本地提交任务与查看结果。

## 代码布局（建议）
- `src/cli.ts` (命令行入口: serve/task/compact-tasks)
- `src/config.ts`
- `src/server/http.ts` (HTTP 服务)
- `src/server/webui.ts` (Web UI 资产加载)
- `src/runtime/master.ts` (调度器)
- `src/runtime/worker.ts` (子进程封装)
- `src/runtime/queue.ts` (per-session 串行)
- `src/session/{store.ts, transcript.ts, lock.ts}`
- `src/memory/{files.ts, search.ts}`
- `src/agent/prompt.ts`

## 请求流（HTTP -> 任务）
1) 客户端 `POST /tasks` (含 resume 策略)。
2) Master 写入 tasks.md (status=queued)。
3) Master 调度 Worker。
4) Worker 调用 codex exec/resume -> 返回结果。
5) Master 追加 transcript，更新 codexSessionId；若配置 verifyCommand 则失败重试至 maxIterations。
6) Master 写入 tasks.md (status=done/failed)；失败可触发 follow-up 任务（可选）。

## Worker 执行与 Resume
- `resume=auto`: 有 `codexSessionId` 时使用 `codex exec resume`；没有则新会话。
- `resume=always`: 必须有 `codexSessionId`，否则返回错误或降级新会话（可配置）。
- `resume=never`: 始终新会话。
- 如果 run 被提前中断而未获得 sessionId，下一次应降级新会话或由用户手动指定。
- sessionId 获取优先从 `--json` 的 `thread.started.thread_id` 提取。

## 恢复流（重启）
1) Master 启动读取 tasks.md。
2) 解析最新状态。
3) `running` 任务标记为中断并重新入队（retries+1）。
4) `queued` 任务直接入队。
5) `failed` 默认不重试；`done` 不处理。

## 队列与并发
- per-session 串行队列（避免会话内并发）。
- 全局并发由 `maxWorkers` 控制。

## 存储与数据模型
- 存储布局:
  - `<stateDir>/sessions.json`
  - `<stateDir>/sessions/<sessionId>.jsonl`
  - `<stateDir>/tasks.md`
  - `<workspace>/MEMORY.md`
  - `<workspace>/memory/*.md`
- Session store (JSON):
  - `sessionKey -> { sessionId, updatedAt, transcriptPath, codexSessionId? }`
- Transcript JSONL:
  - `{ type: "message", role: "user"|"assistant", text, ts, sessionId, runId, error? }`
- Task ledger (Markdown): 追加写入，允许多段记录同一 task。

### 任务账本格式（Markdown）
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

## Prompt 与 Memory
- Header: session 信息。
- Memory Context: `path:line text` 命中片段。
- Output Policy: 简明输出约束（限制行数/长度/不输出思考）。
- User message。
- Memory 搜索:
  - `rg -n --no-heading <query> <paths...>`；去重/截断。

### Output Policy 模板（追加到子进程 prompt）
```
Output Policy:
- 只输出最终答案，不输出思考过程。
- 尽量简短，最多 6 行；超过则先给摘要。
- 不重复题目，不复述上下文。
```

## 配置模型 (src/config.ts)
- `workspaceRoot`
- `codexBin` (可选, 默认使用系统 PATH)
- `codexModel` / `codexProfile` (可选, 优先使用 Codex config.toml)
- `codexSandbox` / `codexFullAuto` (可选, 仅在需要时覆盖)
- `timeoutMs`
- `maxWorkers`
- `stateDir` (任务账本 + session store)
- `heartbeatIntervalMs` / `heartbeatPath` (运行心跳)
- `memoryPaths` / `maxMemoryHits` / `maxMemoryChars`
- `resumePolicy` (`auto` | `always` | `never`)
- `outputPolicy` (简明输出约束, 追加到子进程 prompt)
- `selfEvalPrompt` / `selfEvalMaxChars` / `selfEvalMemoryPath` (自评估与 lessons)
- `maxIterations` (verifyCommand 重试上限)
- `triggerSessionKey` / `triggerOnFailurePrompt` (失败 follow-up)
- `triggerOnIssuePrompt` (评估问题 follow-up)

### 配置最小化原则
- 仅保留协调器必需配置（stateDir、queue、memory、resume、outputPolicy、maxIterations、trigger）。
- Codex 相关配置优先走 `~/.codex/config.toml`；只有明确需求时才覆盖。
- Worker 调用时避免强行指定 model/profile/sandbox，除非用户显式配置。

## 失败处理
- 子进程退出码非 0 -> tasks.md 写入 failed。
- 超时 kill -> tasks.md 写入 failed。
- verifyCommand 失败且重试耗尽 -> tasks.md 写入 failed。
- 锁超时 -> 返回 session busy 错误。
- 失败可触发 follow-up 任务（可选）。

## HTTP 接口
- `GET /` Web UI。
- `POST /tasks` 提交任务。
- `GET /tasks/:id` 查询任务。
- `GET /health` 健康检查。

## 依赖
- Node.js 22+ + `tsx`
- Codex CLI
- ripgrep (`rg`) 或 fallback `grep`
