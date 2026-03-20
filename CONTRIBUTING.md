# Contributing to Mimikit

## First Read

- Developer handbook: `docs/BOOTSTRAP.md`
- Docs index: `docs/README.md`
- Architecture source of truth: `docs/design/architecture/system-architecture.md`

## Quick Start

```bash
git clone https://github.com/phonowell/mimikit.git
cd mimikit
pnpm i
pnpm run lint
pnpm run typecheck
pnpm run test
```

## Development Workflow

1. Create a topic worktree: `git fetch origin && git worktree add ../mimikit-<topic> -b <topic> origin/main`
2. Make changes in that worktree and commit on the topic branch
3. Keep it current: `git fetch origin && git rebase origin/main`
4. Run quality checks: `pnpm run review-code-changes`
5. Merge through the normal PR / branch flow, then clean up with `git worktree remove ../mimikit-<topic>`

## Code Standards

- TypeScript ESM with strict mode; avoid `any`
- Files over 200 lines must be split into stable modules
- IDs must include type prefixes such as `task-` / `plan-` / `input-`
- Prompts stay in `prompts/`, injected via builders
- No keyword-driven core features; prefer structural signals or model judgment

## Pull Request Guidelines

1. Run `pnpm run review-code-changes` before opening or merging a PR
2. Keep changes minimal and traceable to facts
3. Update docs when user-facing or contributor-facing behavior changes
4. Ensure no secrets or keys land in commits

## License

MIT. See `LICENSE`.
