# MIMIKIT 命令协议

> 返回 [系统设计总览](./README.md)

## 何时使用
- Manager 需要触发系统动作时输出。
- 由 Manager 解析并执行。

## 格式
- 命令块：`<MIMIKIT:commands> ... </MIMIKIT:commands>`
- 行内命令：`@add_task prompt="..." title="..."`
- 每行一个命令，行首 `@` + 命令名；属性仅支持双引号；属性名为字母/数字/下划线。

## 命令列表
- `add_task`：派发任务到内存队列。
  - attrs：`prompt`(必填)，`title`(可选，任务短标题)
  - 示例：`@add_task prompt="整理接口文档" title="整理文档"`（放在 `<MIMIKIT:commands>` 块内）
- `cancel_task`：取消任务。
  - attrs：`id`(必填)
  - 示例：`@cancel_task id="task_123"`（放在 `<MIMIKIT:commands>` 块内）
- `summarize_result`：将指定任务结果写入 tasks 时改写为摘要版本（原始详细版本仍保留在归档）。
  - attrs：`taskId`(必填)，`summary`(必填)
  - 兼容 attrs：`id` 可作为 `taskId` 别名
  - 示例：`@summarize_result taskId="task_123" summary="已完成接口文档整理，新增 3 个端点说明并修复 1 处示例错误。"`
- `capture_feedback`：采集结构化反馈并写入自演进反馈流。
  - content：JSON payload（需包含 `message`）
  - 可选字段：`category` `roiScore` `confidence` `action` `rationale` `fingerprint`
  - 示例：`@capture_feedback {"message":"回答不准确","category":"quality","roiScore":78,"confidence":0.82,"action":"fix"}`

## 解析与执行
- 解析器：`src/supervisor/command-parser.ts`
- 执行器：`src/supervisor/manager-runner.ts`
- 命令会从输出中剥离，剩余文本作为自然回复。
