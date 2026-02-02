# Notes: teller-inputs-logs-webui

## Decisions
- user-inputs.jsonl uses a single draft updated in-place until Thinker consumes it (Option A).
- teller-notices.jsonl stores facts/important data (multi-line allowed) rather than direct user messages.
- Add explicit start/end log events for teller/thinker/worker; include elapsed on end.
- Inject last 100 history messages into teller prompt.
- WebUI shows thinker status with last elapsed and tokens after connection status.

## Open Questions
- None.
