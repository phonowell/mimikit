# .mimikit 紧急修复清单（对标版 V2）

更新日期：2026-02-28
范围：`.mimikit` 运行日志问题 + 对标 `nanobot / pi-mono / mimiclaw / picoclaw` 的公开原理

## 对标结论（只看公开原理，不看源码）

1) **状态与记忆可见性要“文件化+结构化”**
- `mimiclaw` 明确把 `SOUL.md/USER.md/MEMORY.md/HEARTBEAT.md/cron.json/tg_*.jsonl` 作为运行态事实来源。
- `picoclaw` 明确 workspace 目录结构：`sessions/ memory/ cron/ AGENTS.md/ HEARTBEAT.md`。
- `nanobot` 明确项目结构有 `session/ cron/ heartbeat/ memory`，并提供 `nanobot status`。

2) **上下文切换靠“前置路由规则”而不是临场猜测**
- `pi-mono` 的 AGENTS 规则将 first-message 路由写成显式流程（先读 README，再按模块分流）。

3) **轻量化系统仍保留“可操作状态面板/命令”**
- `nanobot` README 把 `status / gateway / cron / heartbeat` 作为一等能力公开。

## 对我们问题的修订归因

### A. `intent/task` 与删除/取消困难，本质是同一个问题：**可见性缺口**
- 当前 manager 回合里经常看不到可操作对象（`M:tasks/M:intents` 常被裁剪或缺失），所以只能追问 ID。
- 修复方向：
  - 新增只读 action：`query_tasks`、`query_intents`（支持 `id/title/focus/status` 过滤）。
  - 调整 prompt 裁剪策略：保留最小索引快照（id/title/status/focus/updated_at），不优先裁掉。
  - `delete_intent/cancel_task` 支持“标题 + 当前 focus + 最近活跃”匹配，唯一命中直接执行。

### B. `quote` 功能“有传参但弱有效”，本质是：**只有引用 ID，没有引用语义**
- 现在链路主要传 `quote=id`；被引用正文不保证进入同轮上下文。
- 修复方向：
  - 在 `M:inputs` 注入 `quote_ref`：`{id, role, time, content_preview}`。
  - 将被引用消息设为“上下文保留项”，优先级高于普通 recent history 裁剪。
  - 系统提示词加硬规则：有 `quote` 时先围绕 `quote_ref` 回答，再扩展旁路信息。

### C. worktree 误路由不作为通用能力改造重点
- 你说得对，这是项目态约束，不是通用 agent 本质能力。
- 在通用层只保留一条：**主问题优先回复顺序约束**（先执行用户当前指令，再补充旁路信息）。

## 最终优先级（V2）

### P0（立即）
1. `manager_query_history_repeated_without_progress` 导致 `Service unavailable`。
2. `run_task` 路径策略误伤导致 `action_execution_rejected` 风暴。

### P1（本轮）
3. 落地 `query_tasks/query_intents` + 最小状态索引注入（解决可见性根因）。
4. 落地 `quote_ref` 注入与保留策略（让 quote 真正生效）。
5. 回复顺序约束（先主任务、后旁路信息）+ 串行依赖门控（implement -> review -> land）。
6. 同类拒绝熔断（错误阈值后停止重复重试并给替代动作）。

### P2（后续）
7. 长任务预算治理（时间/token/纠错轮次软硬阈值）。
8. 任务语义去重（同 focus + 同目标域复用）。

## 参考来源
- `pi-mono` AGENTS: https://raw.githubusercontent.com/badlogic/pi-mono/main/AGENTS.md
- `nanobot` README: https://raw.githubusercontent.com/HKUDS/nanobot/main/README.md
- `picoclaw` README: https://raw.githubusercontent.com/sipeed/picoclaw/main/README.md
- `mimiclaw` README: https://github.com/memovai/mimiclaw
- `mimiclaw` 结构解读（CNX）：https://www.cnx-software.com/2026/02/13/mimiclaw-is-an-openclaw-like-ai-assistant-for-esp32-s3-boards/
