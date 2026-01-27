# Task Plan: split-large-ts

## Goal
- Split TS files over 200 lines into smaller modules without behavior changes.

## Scope
- ./src/runtime/master.ts
- ./src/runtime/ledger.ts

## Plan
1. [x] Inventory >200-line TS files and identify split seams.
2. [x] Split master utilities and runner logic from ./src/runtime/master.ts:27-67, ./src/runtime/master.ts:166-412; keep class wrapper in ./src/runtime/master.ts:69-165.
3. [x] Split ledger into modules from ./src/runtime/ledger.ts:8-207 (types/format/parse/store); keep ./src/runtime/ledger.ts as barrel.
4. [x] Verify imports and ensure no TS file remains over 200 lines.

## Decisions
- Keep public import paths stable via barrel exports.

## Risks
- Path mistakes in nested runtime modules; re-check with searches.

## Status
- Current: done.
- Progress: 4/4.
