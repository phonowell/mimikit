# Task Plan: dedupe

## Goal
Find redundant/duplicate parts of the project and remove or merge them safely.

## Scope
- Source code, scripts, tasks, docs, and prompts in this repo.
- Exclude node_modules and build artifacts.

## Plan
- [x] Inventory duplicates (hash scan, spot-check scripts/storage modules).
- [x] Triage findings (shared helpers for JSON lists, text-source globs; keep .mimikit data untouched).
- [x] Implement merges with minimal behavior change; update imports/refs.
- [ ] Run targeted checks/tests or lint/build as appropriate.
- [x] Summarize changes and any follow-ups.

## Progress Notes
- 2026-02-01: merged list-storage logic and shared text source globs; refactored triggers to reuse queue helpers.

## Risks / Assumptions
- Some duplication may be intentional (e.g., snapshots, fixtures, test vectors).
- Removing files may require updating docs or scripts that reference them.
- We'll confirm ambiguous cases before deleting.
