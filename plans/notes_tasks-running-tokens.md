# Notes: task running duration + token display

- Running duration should start from startedAt, not createdAt (pending excluded)
- Token usage only available after worker completes; show placeholder when missing
- Task model now carries startedAt/completedAt/durationMs/usage for task list display
- Tokens display format: `tokens <input>/<output>`
