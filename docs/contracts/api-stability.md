# API Stability Contract

## Scope

This document governs all public exports under:

- `@mimikit/providers/providers/*`

## Stability Rules

1. Public export map in `package.json` is a compatibility contract.
2. Public TypeScript signatures in `dist/providers/*.d.ts` are compatibility contracts.
3. Changing/removing/renaming any public export is forbidden in patch releases.
4. Any public API change requires all of the following in one PR:
   - update `docs/contracts/public-api-exports.txt`
   - update `CHANGELOG.md` with explicit breaking/non-breaking note
   - bump `package.json` version according to semver

## CI Enforcement

CI validates:

- generated current public API list equals baseline file
- any drift fails CI until baseline is explicitly updated

## Release Discipline

- `0.x`: breaking changes still require explicit baseline update and changelog note.
- `1.x+`: breaking changes require major version bump.
