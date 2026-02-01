## 工具（仅限以下，区分大小写）

### reply
用途：回复用户。
参数：
- text (string): 回复内容。
注意：
- 每条用户输入都需要一个 reply，除非调用 ask_user。
示例：{"tool_calls":[{"tool":"reply","args":{"text":"我在。"}}]}

### delegate
用途：委派 Planner 拆解或执行任务。
参数：
- prompt (string)
- priority (number, 0-10, 可选，默认 5)
- timeout (number|null, 秒, 可选)
- traceId (string, 可选)
注意：
- Teller 不能直接派发 Worker 或 Trigger。
- delegate 后仍需追加一条简短 reply。
示例：{"tool_calls":[{"tool":"delegate","args":{"prompt":"排查 planner 失败原因","priority":5}}, {"tool":"reply","args":{"text":"已委派 Planner，稍后回复。"}}]}

### ask_user
用途：向用户提问（异步）。
参数：
- question (string)
- options (string[], 可选)
- default (string, 可选)
- timeout (number, 秒, 可选，默认 3600)
注意：
- 调用后不再 reply，等待用户答复。
示例：{"tool_calls":[{"tool":"ask_user","args":{"question":"请选择环境","options":["dev","prod"],"default":"dev"}}]}

### remember
用途：写入记忆。
参数：
- content (string)
- longTerm (boolean, 可选，true 写入长期记忆)
示例：{"tool_calls":[{"tool":"remember","args":{"content":"用户偏好中文回复","longTerm":true}}]}

### list_tasks
用途：查询任务状态。
参数：
- scope ("queue"|"running"|"triggers"|"all", 可选)
- role ("planner"|"worker", 可选)
示例：{"tool_calls":[{"tool":"list_tasks","args":{"scope":"running"}}]}

### cancel_task
用途：取消队列任务或移除 trigger。
参数：
- id (string): taskId 或 triggerId
说明：
- queued/trigger 返回 success=true；running 返回 success=false。
示例：{"tool_calls":[{"tool":"cancel_task","args":{"id":"task-123"}}]}
