# Notes: split-large-ts

- Assumption: maintain existing import paths by re-exporting from ./src/runtime/master.ts and ./src/runtime/ledger.ts.
- Risk: nested module relative paths need careful adjustment.
