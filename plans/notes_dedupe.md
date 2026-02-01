# Notes: dedupe

- Date: 2026-02-01
- Initial request: "寻找项目里冗余重复的地方，做移除或合并"

## Findings
- Identical files: `.mimikit/inbox.json` and `.mimikit/teller_inbox.json` (same SHA256); left untouched since they are state data.
- Code duplication: list JSON read/write/remove in `src/storage/inbox.ts` and `src/storage/teller-inbox.ts`.
- Code duplication: trigger storage helpers mirrored `src/storage/queue.ts`.
- Script duplication: identical text file globs in `scripts/remove-bom.ts` and `scripts/fix-crlf.ts`.
