# Contributing

## Setup

```bash
pnpm i
```

## Validate

```bash
pnpm run ci:verify
```

## Public API Changes

If you intentionally change public API:

```bash
pnpm run build
pnpm run api:baseline:update
```

Then update `CHANGELOG.md` and package version in the same PR.
