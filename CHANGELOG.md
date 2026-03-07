# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-03-07

### Added

- Single-session orchestration layer with manager + worker split
- Built-in WebUI on port 8787 with SSE events
- File-backed runtime state (`.mimikit/`) for reproducible debugging
- Plan triggers: `cron`, `scheduled_at`, `on_worker_slot_freed`
- Telegram channel integration (optional)
- Codex SDK provider support
- OpenCode SDK provider support
- Task panel with live progress streaming

### Architecture

- TypeScript ESM with strict type checking
- `manager` handles dialogue, planning, and orchestration
- `worker` delegates execution to external runtimes (Codex/OpenCode)
- State persisted to disk: `history/`, `tasks/`, `task-progress/`, `runtime-snapshot.json`, `log.jsonl`

### Dependencies

- `@openai/codex-sdk@0.111.0`
- `@opencode-ai/sdk@1.2.20`
- `fastify@5.8.1`
- `telegraf@4.16.3`

### Known Limitations

- Text-only input (images not supported)
- Single session architecture
- No multi-channel beyond WebUI + Telegram

---

For upgrade notes and migration guides, see [docs](./docs/).
