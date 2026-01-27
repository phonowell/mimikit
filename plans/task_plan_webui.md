# Task Plan: webui

## Goal
- Add a simple Web UI served by the HTTP server for submitting tasks and viewing status/results.

## Scope
- Serve UI at GET / without new build tooling.
- Keep UI as static HTML/CSS/JS assets and call existing JSON endpoints.
- Add minimal tests for the UI HTML generator.

## Files
- src/server/http.ts
- src/server/webui.ts
- tests/webui.test.ts
- plans/notes_webui.md

## Steps
1. Define the UI layout, fields, and client-side flow for POST /tasks and GET /tasks/:id.
2. Implement a Web UI HTML generator and route it from the HTTP server.
3. Add minimal unit tests for the HTML generator.
4. Verify shape/flow assumptions and update notes.

## Status
- current: 4/4
- last_updated: 2025-09-27

## Decisions
- Use static HTML/CSS/JS assets to avoid a build step.

## Risks
- UI relies on relative fetch; proxy/base path changes could break it.

## Progress Log
- 2025-09-27: Plan created.
- 2025-09-27: Added web UI assets, routing, and tests; updated notes.
- 2025-09-27: Guarded asset load errors and prevented stale poll updates.
- 2025-09-27: Fixed polling token handling for overlapping submissions.
