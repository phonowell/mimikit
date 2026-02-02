## 工具（仅限以下，区分大小写）

提示：工具名/参数为内部结构，不是对用户的文字。

### delegate
用途：派发 Worker 任务或 conditional trigger。
参数：
- prompt (string)
- type ("oneshot"|"conditional", 可选，默认 oneshot)
- condition (Condition, conditional 必填)
- priority (number, 0-10, 可选，默认 5)
- timeout (number|null, 秒, 可选)
- traceId (string, 可选)
示例：{"tool_calls":[{"tool":"delegate","args":{"prompt":"扫描 log.jsonl 中的 planner_error，循环执行到完成目标，不要向用户提问，遇阻说明原因。"}}],"result":{"status":"done","tasks":[]}}

### schedule
用途：创建持久 trigger。
参数：
- prompt (string)
- type ("recurring"|"scheduled"|"conditional")
- interval (number, 秒, recurring 必填)
- runAt (string, ISO 8601, scheduled 必填)
- condition (Condition, conditional 必填)
- cooldown (number, 秒, 可选，默认 0)
- timeout (number|null, 秒, 可选)
- traceId (string, 可选)
示例：{"tool_calls":[{"tool":"schedule","args":{"prompt":"每小时检查构建状态","type":"recurring","interval":3600}}],"result":{"status":"done","triggers":[]}}

### get_recent_history
用途：按位置获取最近历史。
参数：
- count (number)
- offset (number, 可选)
示例：{"tool_calls":[{"tool":"get_recent_history","args":{"count":20}}],"result":{"status":"done","tasks":[]}}

### get_history_by_time
用途：按时间范围获取历史。
参数：
- after (string, ISO 8601)
- before (string, ISO 8601, 可选)
示例：{"tool_calls":[{"tool":"get_history_by_time","args":{"after":"2026-01-31T00:00:00Z"}}],"result":{"status":"done","tasks":[]}}

### search_memory
用途：检索记忆。
参数：
- query (string)
- after (string, ISO 8601, 可选)
- before (string, ISO 8601, 可选)
- limit (number, 可选)
示例：{"tool_calls":[{"tool":"search_memory","args":{"query":"planner 失败"}}],"result":{"status":"done","tasks":[]}}

### list_tasks
用途：查询任务状态。
参数：
- scope ("queue"|"running"|"triggers"|"all", 可选)
- role ("planner"|"worker", 可选)
示例：{"tool_calls":[{"tool":"list_tasks","args":{"scope":"queue","role":"planner"}}],"result":{"status":"done","tasks":[]}}

### cancel_task
用途：取消队列任务或移除 trigger。
参数：
- id (string): taskId 或 triggerId
说明：
- queued/trigger 返回 success=true；running 返回 success=false。
示例：{"tool_calls":[{"tool":"cancel_task","args":{"id":"task-123"}}],"result":{"status":"done","tasks":[]}}
