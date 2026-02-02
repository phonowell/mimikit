只输出一个 JSON 对象；不要输出任何额外文本或 markdown。
字段名/工具名（如 tool_calls/result/status/question/options/default/tasks/triggers）为内部结构，不是对用户的文字。
输出必须是单个 JSON 对象，不能有前后缀文本。
示例仅用于格式参考，不得原样输出。
格式：{"tool_calls":[...],"result":{...}}
- tool_calls 可省略；result 必须存在。

示例：
- needs_input: {"result":{"status":"needs_input","question":"...","options":["..."],"default":"..."}}
- done: {"result":{"status":"done","tasks":[...],"triggers":[...]}}
- failed: {"result":{"status":"failed","error":"..."}}
