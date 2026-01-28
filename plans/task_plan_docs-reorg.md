# Task Plan: docs reorg

## Goal
- Reorganize all docs in ./docs for clearer separation and less duplication; redistribute content appropriately.

## Constraints
- Use optimize-docs workflow; keep each doc <= 200 lines.
- CLAUDE.md only updated when explicitly requested; use optimize-claude-md and keep <=100 lines.
- Do not touch SKILL.md.
- Prefer minimal renames/moves unless approved.
- Keep content accurate; no new test cases.

## Scope
- ./CLAUDE.md
- ./docs/codex-exec-reference.md
- ./docs/minimal-architecture.md
- ./docs/minimal-implementation-plan.md
- ./docs/minimal-notes.md

## Decision
- Thorough reorg within existing filenames; update CLAUDE.md references only when requested.

## Plan
1) Map content to target docs (by section) using current line refs. (done)
2) Reassign sections per doc role; update docs in one batch; add cross-links. (done)
3) Validate: wc -l per doc; check duplicates/omissions. (done)
4) Sync CLAUDE.md doc descriptors after reorg. (done)

## Status
- Decision confirmed; docs reorganized; CLAUDE.md synced; validation complete.
