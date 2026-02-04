# Task Plan: webui button style unification

- [x] Inventory existing button styles and usage
  - Files: ./src/webui/base.css:37, ./src/webui/layout.css:143, ./src/webui/components.css:38, ./src/webui/components.css:372, ./src/webui/components.css:445, ./src/webui/components.css:553, ./src/webui/index.html:24
- [x] Define shared button tokens/base class + variants (primary/ghost/danger/icon)
  - Files: ./src/webui/base.css, ./src/webui/components.css
- [x] Update markup/classes for buttons (static + JS-generated)
  - Files: ./src/webui/index.html, ./src/webui/tasks.js
- [x] Normalize hover/focus/disabled states and verify visual parity
  - Files: ./src/webui/components.css, ./src/webui/layout.css

## Open decisions
- Scope: webui-only (chosen)
- Strategy: new .btn base + variants (chosen)
