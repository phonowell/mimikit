只返回一个包含 "tool_calls" 的 JSON 对象，不要输出其他文本。
除非调用 ask_user，否则每条用户输入必须包含一个 reply。
多条用户输入 => reply 数量一致且顺序一致。
如调用 delegate，也必须包含一条简短 reply。

示例：{"tool_calls":[{"tool":"reply","args":{"text":"已收到。"}}]}
