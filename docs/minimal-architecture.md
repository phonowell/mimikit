# Minimal Codex Coordinator 架构说明（主从 + HTTP + Resume）

## 组件
- Master 进程: 常驻运行，提供 HTTP 服务，负责任务调度与持久化。
- Worker 子进程: 由 Master 创建，执行单次 `codex exec` 或 `codex exec resume`。
- Session Store: JSON 存储 session 元数据（含 codexSessionId）。
- Transcript Store: JSONL 对话日志（审计）。
- Task Ledger: Markdown 任务账本（恢复依据）。
- Metrics Ledger: JSONL 运行指标（stats 聚合）。
- Lessons Log: Markdown 经验记录（可选写入记忆检索路径）。
- Memory Search: `rg` 全文检索 + 片段注入。
- Guard/Trigger: 可选的变更守卫与失败/低分触发任务。

## 请求流（HTTP -> 任务）
1) 客户端 `POST /tasks` (含 resume 策略)。
2) Master 写入 tasks.md (status=queued)。
3) Master 调度 Worker。
4) Worker 调用 codex exec/resume -> 返回结果。
5) Master 执行 verify/score/guard（可选），写入 tasks.md (status=done/failed)，追加 transcript，并更新 codexSessionId。
6) Master 写入 metrics.jsonl；失败/低分可追加 lessons.md 与触发 follow-up 任务（可选）。

## 恢复流（重启）
1) Master 启动读取 tasks.md。
2) 解析最新状态。
3) `running` 任务标记为中断并重新入队。
4) `queued` 任务直接入队。

## 存储布局
- `<stateDir>/sessions.json`
- `<stateDir>/sessions/<sessionId>.jsonl`
- `<stateDir>/tasks.md`
- `<stateDir>/metrics.jsonl`
- `<stateDir>/lessons.md`
- `<workspace>/MEMORY.md`
- `<workspace>/memory/*.md`

## Prompt 结构
- Header: session 信息。
- Memory Context: `path:line text` 命中片段。
- Output Policy: 简明输出约束（限制行数/长度/不输出思考）。
- User message。

## 队列模型
- per-session 串行队列 (避免会话内并发)。
- 全局并发由 `maxWorkers` 控制。

## 失败处理
- 子进程退出码非 0 -> tasks.md 写入 failed。
- 超时 kill -> tasks.md 写入 failed。
- 锁超时 -> 返回 session busy 错误。
- verify/score/guard 失败 -> tasks.md 写入 failed，必要时追加 lessons。

## HTTP 接口
- `POST /tasks` 提交任务。
- `GET /tasks/:id` 查询任务。
- `GET /stats` 读取聚合指标。
- `GET /health` 健康检查。

## 7x24 运行方式
- `tsx src/cli.ts serve` 常驻。
- 依赖 systemd/launchd/pm2 守护进程。

## 依赖
- Node.js 22+ + `tsx`
- Codex CLI
- ripgrep (`rg`) 或 fallback `grep`
