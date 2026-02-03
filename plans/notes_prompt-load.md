# Notes: prompt-load

- User request (2026-02-03): replace hardcoded prompt injection with uncached markdown loading from `prompts/`.
- Must follow AGENTS.md rules: ESM + strict types, avoid any, split >200 lines, minimal tests.
- Decision: add `prompts/agents/{role}/injection.md` and render placeholders like `{环境信息}` / `{任务描述}` at runtime.
