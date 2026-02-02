# Task Plan: teller-inputs-logs-webui

## Goal
Apply the requested behavior changes: teller history limit, start/end logging, thinker status in WebUI, teller-notices semantics, user-inputs draft semantics, and richer environment context for teller.

## Steps
1) Review current data flow for teller/thinker, user-inputs, notices, history, logging, and status to map required code touchpoints.
2) Implement backend changes: new user-input draft upsert, notice schema change, history injection for teller, environment context, logging start/end events, status payload for thinker, and related types.
3) Implement WebUI changes: send client locale/timezone, display thinker status after connection status, and format last thinker metrics.
4) Update prompts and docs to reflect new semantics (record_input draft, notify_teller facts, state directory, lifecycle, interfaces, logging).
5) Sanity scan for type errors and consistency; adjust plan notes.
