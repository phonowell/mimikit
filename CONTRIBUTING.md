# Contributing to Mimikit

## Quick Start

```bash
git clone https://github.com/phonowell/mimikit.git
cd mimikit
pnpm i
pnpm run lint
pnpm run type-check
pnpm run test
```

## Development Workflow

Mimikit uses a worktree-based workflow for parallel development:

1. **Allocate slot**: `pnpm run wt-slot start` (creates `worktree-1/2/3`)
2. **Rebase on main**: `pnpm run wt-rebase`
3. **Make changes** in the allocated worktree
4. **Review before landing**: `pnpm run review-code-changes`
5. **Land changes**: `pnpm run wt-land` (runs review, commits, rebases main, squash merges)

See [Worktree Workflow](./docs/design/workflow/worktree.md) for details.

## Code Standards

- **TypeScript ESM** with strict mode (no `any`)
- **Files >200 lines**: split into modules
- **IDs**: must include type prefixes (`task-`, `plan-`, `input-`, etc.)
- **≥5 non-null assertions**: refactor type architecture
- **Prompts**: keep in `prompts/` directory, inject via builders
- **No keyword-driven features**: use structural signals or model judgment

## Pull Request Guidelines

1. Run `pnpm run review-code-changes` before landing
2. Keep changes minimal and traceable to facts
3. Update documentation if needed
4. Ensure no secrets or keys in commits

## License

MIT. See [LICENSE](./LICENSE).
