# Contributing to Mimikit

## Quick Start

```bash
git clone https://github.com/phonowell/mimikit.git
cd mimikit
pnpm i
pnpm run guard:file-length
pnpm run lint
pnpm run type-check
pnpm run test
```

## Development Workflow

Mimikit supports the standard `git worktree` workflow for parallel development:

1. **Create a topic worktree**: `git fetch origin && git worktree add ../mimikit-<topic> -b <topic> origin/main`
2. **Make changes** in that worktree and commit normally on the topic branch
3. **Keep it current**: `git fetch origin && git rebase origin/main`
4. **Run quality checks**: `pnpm run review-code-changes`
5. **Merge through the normal PR / branch flow**, then clean up locally with `git worktree remove ../mimikit-<topic>`

## Code Standards

- **TypeScript ESM** with strict mode (no `any`)
- **Files >200 lines**: split into modules; `pnpm run guard:file-length` blocks new oversize files and growth of exempted debt
- **IDs**: must include type prefixes (`task-`, `plan-`, `input-`, etc.)
- **≥5 non-null assertions**: refactor type architecture
- **Prompts**: keep in `prompts/` directory, inject via builders
- **Oversize debt**: track only existing exceptions in `scripts/file-length-guard-exemptions.tsv` with exact current line counts
- **No keyword-driven features**: use structural signals or model judgment

## Pull Request Guidelines

1. Run `pnpm run review-code-changes` before opening or merging a PR
2. Keep changes minimal and traceable to facts
3. Update documentation if needed
4. Ensure no secrets or keys in commits

## License

MIT. See [LICENSE](./LICENSE).
