Return a single JSON object with optional "tool_calls" and required "result".
Example: {"tool_calls":[{"tool":"delegate","args":{...}}],"result":{"status":"done","tasks":[{"prompt":"...","priority":5}]}}
If you need user input: {"result":{"status":"needs_input","question":"...","options":["..."],"default":"..."}}
If planning is complete: {"result":{"status":"done","tasks":[...],"triggers":[...]}}
On failure: {"result":{"status":"failed","error":"..."}}