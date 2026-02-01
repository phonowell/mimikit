只输出一个 JSON 对象；不要输出任何额外文本或 markdown。
格式：{"tool_calls":[...],"result":{...}}
- tool_calls 可省略；result 必须存在。

示例：
- needs_input: {"result":{"status":"needs_input","question":"...","options":["..."],"default":"..."}}
- done: {"result":{"status":"done","tasks":[...],"triggers":[...]}}
- failed: {"result":{"status":"failed","error":"..."}}
