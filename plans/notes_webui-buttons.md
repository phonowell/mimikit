# Notes: webui button style unification

- Existing button classes: .action-btn, .restart-dialog-btn (+ primary/danger), .tasks-close, .task-cancel, .scroll-bottom, .composer button
- JS-generated button: ./src/webui/tasks.js creates .task-cancel
- Base reset in ./src/webui/base.css affects all buttons
- Decisions: scope=webui-only, strategy=add .btn base + variants and apply via class updates
