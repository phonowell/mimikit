# Minimal Codex Coordinator 备注与决策

## 已确认决策
- 需要主从进程模型：Master 常驻 + Worker 子进程执行。
- 必须有 HTTP 服务用于远程交互。
- 任务恢复基于 Markdown 持久化（tasks.md）。
- 子进程记忆可丢失，主进程记忆必须可恢复。
- 主进程保存 codexSessionId，按需 resume。
- 运行时使用 `tsx`，不做 build。
- 子进程 prompt 必须包含“简明输出”约束（限制行数/长度/不输出思考）。

## 约束与取舍
- 无流式输出：实现更简单，但不支持中途插话/打断。
- 记忆检索用 `rg`：语义召回弱，但快速落地。

## 验证记录（本地测试）
- 执行 `codex exec --json -`，输入 prompt 后立即 Ctrl+C：
  - 仅看到 `^C`，未输出 sessionId。
- 等待 ~2 秒再 Ctrl+C：
  - 仍无 sessionId 输出，未看到 JSON 事件。
- 正常执行 `codex exec --json "ping"`：
  - JSON 中出现 `thread.started`，包含 `thread_id`。
  - 该 `thread_id` 可作为 codexSessionId 使用。
- 结论：**不能依赖“立即中断”来获取 sessionId**；需要让 run 正常结束或使用其他途径恢复。

## 潜在风险
- tasks.md 规模增长导致解析变慢。
- Codex JSONL 事件格式变化。
- `rg` 缺失影响检索。
- sessionId 获取不稳定会影响 resume。

## 缓解策略
- tasks.md 定期归档；或只保留最近 N 天。
- JSONL 解析容错 + `--output-last-message` 兜底。
- `rg` 不可用时 fallback `grep`。
- resume 失败时降级新会话；必要时提供手动指定 sessionId。
