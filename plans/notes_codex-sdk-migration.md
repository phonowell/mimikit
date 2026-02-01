# Notes: Codex SDK Migration

- SDK wraps local `codex` binary and communicates via JSONL (from SDK README).
- SDK supports `runStreamed()` for structured event streaming.
- Repo-level `.codex/skills` was not detected by SDK in local test.
- Need to verify user-level `CODEX_HOME/skills` and `/etc/codex/skills`.
