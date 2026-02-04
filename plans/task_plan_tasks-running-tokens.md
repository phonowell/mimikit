# Task Plan: task running duration + token display

- [x] Inspect task lifecycle data and UI rendering paths
  - Files: ./src/types/tasks.ts, ./src/tasks/queue.ts, ./src/supervisor/worker.ts, ./src/supervisor/cancel.ts, ./src/supervisor/task-view.ts, ./src/webui/tasks-view.js
- [x] Add startedAt/duration/usage to task model and propagate to task view API
  - Files: ./src/types/tasks.ts, ./src/tasks/queue.ts, ./src/supervisor/worker.ts, ./src/supervisor/cancel.ts, ./src/supervisor/task-view.ts
- [x] Update webui task rendering for running-only elapsed + tokens
  - Files: ./src/webui/tasks-view.js, ./src/webui/components.css
- [x] Verify timers/polling still work and update plan notes
  - Files: ./src/webui/tasks.js, ./plans/notes_tasks-running-tokens.md
