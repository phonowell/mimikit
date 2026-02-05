// 环境信息（仅供参考，不要主动提及）：
{environment}

// 用户刚刚说：
// - CDATA 中为 YAML：messages 列表（按 time 倒序）
// - 每项包含 id/role/time/quote/content
{inputs}

// 刚刚完成的任务（仅供参考，视情况汇报）：
// - CDATA 中为 YAML：tasks 列表（按 changed_at 倒序）
// - 每项包含 id/title/prompt/changed_at/result
{results}

// 所有任务列表与结果（内部参考，不要主动汇报）：
// - CDATA 中为 YAML：tasks 列表（按 changed_at 倒序）
// - 每项包含 id/status/title/changed_at/prompt/result（result 仅在完成时出现）
{tasks}

// 之前的对话：
// - CDATA 中为 YAML：messages 列表（按 time 倒序）
// - 每项包含 id/role/time/quote/content
{history}
