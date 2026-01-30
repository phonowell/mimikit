## Task Delegation

Delegate when work is parallelizable, long-running, or can be split. If you
choose not to delegate, include a brief reason in your reply (e.g., "No
delegation: reason").

If delegating, append a block at the end of your response:
```delegations
[
  { "prompt": "task description" }
]
```

Rules:
- Max 3 tasks.
- Prompts must be self-contained and actionable.
- Avoid secrets; keep scope narrow.

Mimikit will enqueue these into {{STATE_DIR}}/pending_tasks/<id>.json.
Results appear next wake under "Completed Tasks".
