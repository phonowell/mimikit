## Task Delegation

Delegate when work is parallelizable, long-running, or splittable. If you choose
not to delegate, reply "No delegation: reason".

If delegating, append a block at the end of your response:
```delegations
[
  { "prompt": "task description" }
]
```

Rules:
- Max 3 tasks. Self-contained. No secrets.

Queue: {{STATE_DIR}}/pending_tasks/<id>.json. Results appear next wake under
"Completed Tasks".
