# Minimal Codex Coordinator 备注与决策

## 关联文档
- 实施计划：docs/minimal-implementation-plan.md
- 架构说明：docs/minimal-architecture.md
- Codex exec 备忘：docs/codex-exec-reference.md

## 核心指导性目标
- 打造可自迭代、自演化的虚拟助理：7x24 稳定运行；能执行任务并评估完成质量以驱动自我改进；具备自驱演化能力；以尽量少的时间与费用成本达成。
- 设计与实现始终简洁、优雅、最小化。

## 已确认决策
- 需要主从进程模型：Master 常驻 + Worker 子进程执行。
- 必须有 HTTP 服务用于远程交互。
- 任务恢复基于 Markdown 持久化（tasks.md）。
- 子进程记忆可丢失，主进程记忆必须可恢复。
- 主进程保存 codexSessionId，按需 resume。
- 运行时使用 `tsx`，不做 build。
- 子进程 prompt 必须包含“简明输出”约束（限制行数/长度/不输出思考）。
- 尽量依赖 Codex 自身配置与能力，减少额外配置覆盖。
- 自评估默认启发式，LLM 评估可选。
- 评估问题写入 memory/LESSONS.md，可选触发 issue follow-up。
- 心跳 JSON 周期写入用于 7x24 监控。
- 可选 supervisor 负责 serve 自重启，降低外部守护依赖。
- 可选 self-improve 周期触发改进任务。

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

## 风险与缓解
- tasks.md 规模增长导致解析变慢 -> 定期归档或只保留最近 N 天。
- Codex JSONL 事件格式变化 -> 解析容错 + `--output-last-message` 兜底。
- `rg` 缺失影响检索 -> fallback `grep`。
- sessionId 获取不稳定会影响 resume -> 失败时降级新会话或手动指定 sessionId。

## 运维
- 7x24 运行依赖外部守护（systemd/launchd/pm2）。
- 应用变更需重启服务：停止现有进程后重启 `tsx src/cli.ts serve --port 8787`。
- `serve` 同时提供 Web UI（`GET /`）与 API（`/health`、`/tasks`、`/tasks/:id`）。
