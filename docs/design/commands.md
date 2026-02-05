# MIMIKIT 命令协议

> 返回 [系统设计总览](./README.md)

## 何时使用
- Manager 需要触发系统动作时输出。
- 由 Manager 解析并执行。

## 格式
- 自闭合标签：`<MIMIKIT:command attr="value" />`
- 带内容标签：`<MIMIKIT:command>内容</MIMIKIT:command>`
- 属性仅支持双引号；属性名为字母/数字/下划线。

## 命令列表
- `dispatch_worker`：派发任务到内存队列。
  - attrs：`prompt`(必填)，`title`(可选，任务短标题)
  - 示例：`<MIMIKIT:dispatch_worker prompt="整理接口文档" title="整理文档" />`
  - 也可使用内容体：`<MIMIKIT:dispatch_worker>整理接口文档</MIMIKIT:dispatch_worker>`
- `cancel_task`：取消任务。
  - attrs：`id`(必填)
  - 示例：`<MIMIKIT:cancel_task id="task_123" />`
- `beads_create`：创建 Beads 任务。
  - attrs：`title`(必填)，`type`，`priority`，`labels`，`parent`，`deps`，`assignee`，`spec_id`
  - 内容体：作为 `description`
  - 示例：`<MIMIKIT:beads_create title="登录流程梳理" type="task" priority="1">梳理登录流程与页面清单</MIMIKIT:beads_create>`
- `beads_update`：更新 Beads 任务。
  - attrs：`id`(必填)，`status`，`priority`，`title`，`description`，`notes`，`append_notes`，`acceptance`，`add_labels`，`remove_labels`，`set_labels`，`parent`，`defer`，`due`
  - 内容体：作为 `append_notes`
  - 示例：`<MIMIKIT:beads_update id="bd-a1b2" status="in_progress">已完成接口草案，下一步补测试</MIMIKIT:beads_update>`
- `beads_close`：关闭 Beads 任务。
  - attrs：`id`(必填)，`reason`(可选)
  - 内容体：作为 `reason`
  - 示例：`<MIMIKIT:beads_close id="bd-a1b2">Done</MIMIKIT:beads_close>`
- `beads_reopen`：重新打开 Beads 任务。
  - attrs：`id`(必填)，`reason`(可选)
  - 内容体：作为 `reason`
- `beads_dep_add`：添加依赖关系。
  - attrs：`from`(必填)，`to`(必填)，`type`(可选)
  - 示例：`<MIMIKIT:beads_dep_add from="bd-a1b2.2" to="bd-a1b2.1" type="blocks" />`

## 解析与执行
- 解析器：内联于 `src/supervisor/manager.ts`
- 命令会从输出中剥离，剩余文本作为自然回复。
