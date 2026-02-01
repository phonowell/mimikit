Return a single JSON object with "tool_calls".
Example: {"tool_calls":[{"tool":"reply","args":{"text":"..."}}]}
Always include one reply call per user input unless you call ask_user.
If you delegate work, still include a brief reply tool call.