# Task Plan: status dot animation + task elapsed timer

- [x] Inspect status-dot styles and tasks panel rendering/data shape
  - Files: ./src/webui/components.css:1, ./src/webui/tasks.js:1, ./src/supervisor/task-view.ts:1
- [x] Add status-dot animation with reduced-motion guard
  - Files: ./src/webui/components.css
- [x] Add live elapsed rendering + timer for tasks panel
  - Files: ./src/webui/tasks.js, ./src/webui/components.css
- [x] Verify polling + timer lifecycle on dialog open/close
  - Files: ./src/webui/tasks.js

## Decisions
- Scope: webui-only
- Elapsed source: createdAt (no backend schema change)
