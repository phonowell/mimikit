---
name: skills-sh-project-governor
description: "Project-level governance for skills.sh skills: decide if a new skill is needed, score candidates against project constraints, enforce security gates, install/remove only at project scope, and clean one-off skills after completion. ALWAYS use when users discuss adding/removing/replacing/managing skills or ask whether a task needs a new skill."
---
# Skills.sh Project Governor
Use this skill as the single control plane for project skill lifecycle.
## Trigger Policy
- Must trigger:
  - user asks to add/remove/replace/manage skills
  - user asks if a task needs a new skill
  - user asks to search/recommend/install from skills.sh
- Must not trigger:
  - pure business/domain task execution without skill management intent
  - unrelated coding/debugging requests with no skill lifecycle decision
## Non-Negotiables
- Install at project scope only. Do not use `-g`.
- Check existing skills before searching/installing.
- Keep the installed set minimal.
- Remove one-off skills after task completion.
## Inputs
- User task
- Constraints in `AGENTS.md` and `CLAUDE.md`
- Project context from `package.json`, `src/`, `webui/`, `scripts/`
- Existing skill inventory from `.agents/skills` and `npx skills list`
## Workflow
1. Build a task profile
- Extract domain, action, expected output, and reuse horizon.
- Classify reuse horizon as `one-off` or `reusable`.
2. Check existing skill coverage first
- Check local project skills:
```bash
Get-ChildItem -Name .agents/skills
```
- Check installed project skills:
```bash
npx skills list
```
- Reuse existing skills when they cover most of the task.
- Continue only if there is a concrete capability gap.
3. Derive project-aware search terms
- Derive 3 keyword groups: domain, job, outcome.
- Prefer stack-aligned keywords (TypeScript, ESM, Fastify, Vitest, CLI/WebUI).
- Run 2-4 focused searches:
```bash
npx skills find <keyword>
```
4. Rank candidates with project fit
- Score by task fit, stack fit, overlap risk, and trust signals.
- Reject redundant/generic candidates.
- Keep 1-2 primary candidates and 1 fallback.
5. Apply pre-install scoring rubric
- Score each candidate (0-5 per item, total 25):
  - `task_fit`, `stack_fit`, `overlap_risk`, `maintainability`, `one_off_risk`
- Prefer `total >= 18`.
- If all candidates are `< 18`, do not install and suggest reuse or custom local skill.
6. Enforce security gate
- Check skills.sh security audit signals before install.
- Default gate:
  - block if `Fail >= 2`
  - block if `Fail >= 1` and `Pass = 0`
- When blocked, do not install by default. Require explicit user confirmation to override.
- If overridden, install one minimal candidate and mark as `one-off` by default.
7. Install at project scope only
```bash
npx skills add <owner/repo@skill> --yes
```
- Use filters only when needed:
```bash
npx skills add <owner/repo> --agent <agent...> --skill <skill...> --yes
```
- Never run `-g`.
8. Handle one-off lifecycle
- Mark as `one-off` when task is temporary or explicitly one-time.
- Remove one-off skill after completion:
```bash
npx skills remove <skill-name> --yes
```
- Verify cleanup:
```bash
npx skills list
```
- Never remove project-owned local skills under `.agents/skills`.
## Response Template
```text
Task summary: <one line>
Existing-skill check: <reused | gap found>
Scoring: <candidate -> total/25 with brief breakdown>
Security gate: <pass | blocked(reason) | overridden-by-user>
Recommended: <1-2 choices with project-fit reason>
Installed: <command or "none">
Lifecycle: <reusable | one-off; cleanup command if one-off>
Verification: <skills list summary>
```