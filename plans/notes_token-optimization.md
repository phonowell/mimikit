# Notes: token-optimization

Observations
- TASK_DELEGATION_SECTION includes JSON example every session.
- Chat history pulled at 20 then sliced to 8; filtering logic uses keywords directly.
- Keyword extraction is unweighted and includes short/common tokens.
- Memory maxChars default is 4000; trims by total line length.
- Task result truncation (800) can exceed protocol field limit (2000) once aggregated.
- User input is duplicated between Recent Conversation and New User Inputs.
- Resume prompt still includes full task results.

Assumptions
- Token savings should not reduce task success rates.
- Minimal behavior changes; prefer configurability over hard cuts.

Decisions
- MAX_KEYWORDS=6, MAX_HISTORY_MESSAGES=4, MAX_HISTORY_CHARS=300, MAX_TASK_RESULTS=2, MAX_TASK_RESULT_CHARS=400.
- Memory maxChars=1200 and per-hit text truncation to 160 chars.
- Chat history fetch limited to 2x MAX_HISTORY_MESSAGES and only when user inputs exist.
