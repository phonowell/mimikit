# task_plan_prompt-file-only.md

## Goal
- All prompt templates come from files under `prompts/` and are read per request (no app cache).
- No hardcoded prompt text remains in code files.
- Missing prompt files are skipped (empty string), no fallback strings.

## Scope
- `src/roles/prompt.ts:23-122` (prompt assembly + file loading)
- `prompts/agents/manager/system.md`
- `prompts/agents/worker/system.md`
- New template files under `prompts/agents/{manager,worker}/`

## Assumptions (verify early)
- "Prompt text" means static template strings; dynamic data formatting may remain in code.
- Fixed paths only (no new config).
- Skipping missing files is acceptable for all prompt parts.

## Plan
1) Inventory & template design (owner: Agent A)
   - List all prompt string literals in `src/roles/prompt.ts:41-122`.
   - Propose template file names and placeholder schema (e.g., `{{system}}`, `{{history}}`).
   - Decide whether to keep `system.md` separate or embed into a single template file.
   - Output: mapping doc in `plans/notes_prompt-file-only.md`.

2) Prompt template files (owner: Agent B)
   - Create `prompts/agents/manager/prompt.md` and `prompts/agents/worker/prompt.md`
     (or alternative decided in step 1).
   - Move static labels/headings from code into these files.
   - Keep content ASCII where possible; ensure UTF-8.
   - Output: new/updated files under `prompts/agents/...`.

3) Prompt builder changes (owner: Agent C)
   - Update `src/roles/prompt.ts` to load template files per request.
   - Replace hardcoded prompt text with template placeholders.
   - Keep ENOENT => empty string; non-ENOENT => log + throw.
   - Ensure no caching and strict types.

4) Quick verification (owner: Agent D, optional)
   - Run `tsx src/cli.ts` and confirm prompts render.
   - Do not add tests unless debugging a regression.

## Risks / Edge cases
- If the template file is missing, output may be empty (behavior change).
- Concurrent edits to prompt files can lead to inconsistent content within a single request.
- Ambiguity: whether list formatting strings must be moved out of code.

## Status
- Step 1: pending
- Step 2: pending
- Step 3: pending
- Step 4: pending

