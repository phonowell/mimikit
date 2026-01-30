# Notes - Self-Improvement Mechanism

- Source requirements are from the user's "Self-driven improvement" spec (Jan 30, 2026).
- Self-awake only runs when no inputs/results; task results will wake agent in event mode.
- Need a reliable way to map completed task results back to the self-awake run that spawned them.
- Avoid modifying prompts/ except self-awake prompt update; do not touch src/supervisor.ts or src/codex.ts.
- Environment may not allow GitHub; prefer local-only MR stubs.
