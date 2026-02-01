# Task Plan: design-docs-reorg

## Goal
- Remove docs/minimal-architecture.md and consolidate its content into docs/design.
- Reorganize docs/design for progressive disclosure and <=100 lines per doc.
- Update cross-references to the new design docs.

## Scope
- Docs only; no runtime or API behavior changes.

## Plan
1. Audit current design docs and minimal-architecture overlap; confirm line counts and references.
2. Define new design doc structure (overview/state-directory/interfaces/task-data/task-conditions) and update README navigation.
3. Refactor task-system.md into an overview; move schemas and condition rules into new docs.
4. Update existing design docs (supervisor/memory/tools) to point at the new sources.
5. Remove docs/minimal-architecture.md and update other references (dev-conventions, README).
6. Verify line counts and ensure no remaining minimal-architecture references.

## Progress
- [x] Step 1: audited design docs, overlap, and line counts.
- [x] Step 2: added overview/state-directory/interfaces and updated README nav.
- [x] Step 3: split task-system into overview + task-data + task-conditions.
- [x] Step 4: updated supervisor/memory/tools links.
- [x] Step 5: removed minimal-architecture and updated references.
- [x] Step 6: verified line counts and remaining references.

## Files
- docs/design/README.md
- docs/design/overview.md (new)
- docs/design/state-directory.md (new)
- docs/design/interfaces.md (new)
- docs/design/task-system.md
- docs/design/task-data.md (new)
- docs/design/task-conditions.md (new)
- docs/design/memory.md
- docs/design/supervisor.md
- docs/design/tools.md
- docs/dev-conventions.md
- docs/minimal-architecture.md (delete)
- plans/notes_design-docs-reorg.md

## Risks / Decisions
- Keep doc names stable and linkable; avoid breaking internal references.
- Keep each doc within 100 lines by splitting schemas and conditions.
