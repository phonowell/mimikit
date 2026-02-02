# MIMIKIT 命令协议

> 返回 [系统设计总览](./README.md)

## 何时使用
- Teller/Thinker 需要触发系统动作时输出。
- 由 Supervisor 解析并执行。

## 格式
- 自闭合标签：`<MIMIKIT:command attr="value" />`
- 带内容标签：`<MIMIKIT:command>内容</MIMIKIT:command>`
- 属性仅支持双引号；属性名为字母/数字/下划线。

## 命令列表
### Teller
- `record_input`：记录整理后的输入摘要到 `user-inputs.jsonl`（每轮最多一次，可更新未处理草稿）。
  - 示例：`<MIMIKIT:record_input>关键信息要点...</MIMIKIT:record_input>`
  - 若没有新要点（如寒暄/闲聊），可不输出该命令。

### Thinker
- `dispatch_worker`：派发任务到 `agent-queue/`。
  - attrs：`prompt`(必填) · `priority`(1-10, 默认 5) · `blocked_by`(逗号分隔) · `scheduled_at`(ISO)
  - 示例：`<MIMIKIT:dispatch_worker prompt="整理接口文档" priority="6" blocked_by="id1,id2" scheduled_at="2025-01-01T00:00:00Z" />`
- `cancel_task`：取消任务（`status=cancelled`）。
  - attrs：`id`
  - 示例：`<MIMIKIT:cancel_task id="task-123" />`
- `update_task`：更新任务 `priority` / `blocked_by`。
  - attrs：`id`(必填) · `priority` · `blocked_by`（空字符串用于清空依赖）
  - 示例：`<MIMIKIT:update_task id="task-123" priority="8" blocked_by="" />`
- `notify_teller`：追加事实/重要数据到 `teller-notices.jsonl`。
  - 示例：`<MIMIKIT:notify_teller>- 任务完成\n- 已生成报告</MIMIKIT:notify_teller>`
  - 若没有需要补充的关键信息，可不输出该命令。
- `update_state`：更新 `thinker-state.json`。
  - attrs：`key`（仅支持 `notes`）
  - 示例：`<MIMIKIT:update_state key="notes">等待用户确认。</MIMIKIT:update_state>`

## 解析与执行
- 解析器：`src/commands/parser.ts`
- 执行器：`src/commands/executor.ts`
- 命令会从输出中剥离，剩余文本作为自然回复。
