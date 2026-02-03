# notes_prompt-file-only.md

## Inventory (current)
- `src/roles/prompt.ts:23-39` loads `prompts/agents/{role}/system.md` per request.
- `src/roles/prompt.ts:41-98` builds list/text blocks with static strings:
  - Empty placeholder strings.
  - List formatting tokens (e.g., "- ", "[role]", "ok/error").
  - Environment label keys (now_iso, time_zone, etc.).
- `src/roles/prompt.ts:100-122` assembles the final prompt with static section headings.

## Candidate template structure (to confirm)
- `prompts/agents/manager/prompt.md`
  - contains `{{system}}`, `{{env}}`, `{{history}}`, `{{inputs}}`, `{{results}}`, `{{tasks}}`
- `prompts/agents/worker/prompt.md`
  - contains `{{system}}`, `{{task_prompt}}`

## Open questions
- Must list formatting strings and empty placeholders move into template files?
- Keep `system.md` as separate file or fold into `prompt.md`?
- If template file missing, should output be empty or still include system?

