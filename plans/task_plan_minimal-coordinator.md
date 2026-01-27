# Task Plan: Minimal Codex Coordinator

## Goal
Implement the minimal 24x7 coordinator (master/worker + HTTP + resume + persistence) per CLAUDE.md and docs, using tsx + ESM TypeScript with minimal config.

## Scope
- HTTP API for task submit/query/health.
- Master/Worker runtime with per-session serial queue.
- Markdown task ledger + session store + transcript JSONL.
- Memory search with rg/grep fallback and prompt injection.
- CLI entrypoints (serve/ask/task).

## Non-Goals
- Streaming / WebSocket / UI / embeddings.

## Plan (3-8 steps)
1) Bootstrap project skeleton and config
   - Create `package.json` (tsx, typescript), `tsconfig.json` (ESM, strict).
   - Add `src/config.ts` (config load + defaults) and `src/cli.ts` stub (serve/ask/task).
   - Ensure `stateDir` layout and config types are defined.

2) Implement persistence primitives
   - `src/session/store.ts`: JSON session metadata read/write.
   - `src/session/transcript.ts`: JSONL append for user/assistant entries.
   - `src/session/lock.ts`: simple lock with timeout/cleanup.
   - `src/runtime/ledger.ts` (or similar): append-only tasks.md writer + parser for recovery.

3) Implement runtime queue + master
   - `src/runtime/queue.ts`: per-session serial queue.
   - `src/runtime/master.ts`: enqueue, run workers, update ledger, retries, resume policy.

4) Implement worker codex exec wrapper
   - `src/runtime/worker.ts`: spawn `codex exec` or `codex exec resume` with JSONL parsing.
   - Extract `thread.started.thread_id` as codexSessionId; fallback parse output; timeout handling.

5) Implement memory search + prompt assembly
   - `src/memory/files.ts` + `src/memory/search.ts`: discover MEMORY.md + memory/**/*.md; rg/grep search.
   - `src/agent/prompt.ts`: header + memory context + output policy + user message.

6) Implement HTTP server + CLI wiring
   - `src/server/http.ts`: POST /tasks, GET /tasks/:id, GET /health.
   - `src/cli.ts`: serve/ask/task path, instantiate master, route requests.

7) Recovery + validation
   - Recovery on startup from tasks.md; requeue queued/running.
   - Manual checks per docs (serve, submit, kill/restart, resume behavior).

## Files
- New: `package.json`, `tsconfig.json`, `src/cli.ts`, `src/config.ts`
- New: `src/server/http.ts`, `src/runtime/{master.ts,worker.ts,queue.ts,ledger.ts}`
- New: `src/session/{store.ts,transcript.ts,lock.ts}`
- New: `src/memory/{files.ts,search.ts}`
- New: `src/agent/prompt.ts`

## Decisions
- Node.js `http` module for minimal HTTP server.
- `tasks.md` append-only ledger; parse latest status per task at startup.
- JSONL parsing via line-by-line scanner; tolerate invalid lines.

## Risks (assumptions, to confirm)
- Codex JSONL event shape may vary; need fallback parsing (assumption).
- `rg` may not exist; fallback to `grep`.

## Status
- Current: Completed (manual validation pending)
- Completed:
  - Step 1: project skeleton + config stubs (`package.json`, `tsconfig.json`, `src/config.ts`, `src/cli.ts`)
  - Step 2: persistence primitives (`src/session/store.ts`, `src/session/transcript.ts`, `src/session/lock.ts`, `src/runtime/ledger.ts`)
  - Step 3: runtime queue + master (`src/runtime/queue.ts`, `src/runtime/master.ts`)
  - Step 4: worker exec wrapper (`src/runtime/worker.ts`)
  - Step 5: memory search + prompt assembly (`src/memory/files.ts`, `src/memory/search.ts`, `src/agent/prompt.ts`)
  - Step 6: HTTP server + CLI wiring (`src/server/http.ts`, `src/cli.ts`)
  - Step 7: recovery logic implemented in `src/runtime/master.ts` (manual validation not run)
