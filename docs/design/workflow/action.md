# 动作（Action）

> 返回 [Workflow 索引](./task-and-action.md)

## 协议

协议与解析：`src/actions/protocol/*`

- Action 行格式：`<M:name key="value" />`
- 解析链路：`remark-parse` + `unist-util-visit`（无正则主解析）
- 仅解析回复尾部连续 action 区
- 参数在传输层统一字符串，manager 侧 schema 校验后执行

## Manager 消费的编排 Action

实现：`src/manager/action-registrations.ts`、`src/manager/action-validation.ts`、`src/manager/action-apply.ts`、`src/manager/loop-batch-run-manager.ts`、`src/manager/runtime-adapter.ts`、`src/history/query.ts`

### 计划类

- `create_plan`
- `update_plan`
- `delete_plan`

### 任务类

- `run_task`
- `cancel_task`

### 查询类

- `query_history`
- `read_file`

### 状态写入类

- `upsert_focus`
- `assign_focus`
- `compress_context`
- `summarize_task_result`
- `restart_runtime`

补充：
- memory 写入不再通过 action；由后台 memory 刷新子进程负责。

## Prompt 注入标签

- `M:inputs`
- `M:batch_results`
- `M:tasks`
- `M:plans`
- `M:focus_list`
- `M:focus_contexts`
- `M:recent_history`
- `M:history_lookup`
- `M:memory`
- `M:file_lookup`
- `M:action_feedback`
- `M:compressed_context`
