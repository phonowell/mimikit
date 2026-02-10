# Action 协议与执行（当前实现）

> 返回 [系统设计总览](./README.md)

## 范围与依据
- 协议解析：`src/actions/protocol/*`
- 可执行 action：`src/actions/defs/*` + `src/actions/registry/index.ts`
- manager 编排 action：`src/manager/action-apply.ts`

## Action 名称集合
来源：`src/actions/model/names.ts`

- 文件类：`read_file` `search_files` `write_file` `edit_file` `patch_file`
- 进程类：`exec_shell` `run_browser`
- 编排类：`create_task` `cancel_task` `summarize_task_result`

## 协议格式
- Action 块：`<MIMIKIT:actions> ... </MIMIKIT:actions>`
- 每行一条：`@name key="value"`
- 参数传输层统一字符串，执行前做 schema 校验

## 可执行 action（registry）
- 已注册：`read_file` `search_files` `write_file` `edit_file` `patch_file` `exec_shell` `run_browser`
- `invokeAction()`：查 spec → 校验参数 → 执行 → `safeRun` 包装异常
- 未注册 action 返回：`unknown_action:{name}`

## manager 消费的编排 action
来源：`src/manager/action-apply.ts`

### `create_task`
- 入参：`prompt` `title` `profile`
- 约束：`profile ∈ {standard, specialist}`
- 去重：`prompt + title + profile`

### `cancel_task`
- 入参：`task_id`
- 行为：`cancelTask(..., { source: 'manager' })`

### `summarize_task_result`
- 入参：`task_id` `summary`
- 行为：汇总为 `Map<taskId, summary>`，用于结果写入 `history` 时压缩输出

## worker-standard 结束规则
- 来源：`src/worker/standard-step.ts`
- 规则：
  - 未完成时输出一条可执行 action。
  - 完成时输出纯文本最终结果（不输出 action 块）。
