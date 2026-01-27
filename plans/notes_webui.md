# Notes: webui

## Context
- HTTP server lives in src/server/http.ts.
- Existing JSON endpoints: GET /health, POST /tasks, GET /tasks/:id.
- UI assets live in src/server/webui and are served at / with /webui assets.

## Assumptions
- UI can rely on relative fetch to same origin.
- No build tooling; static HTML/CSS/JS assets only.

## Open Questions
- None yet.
