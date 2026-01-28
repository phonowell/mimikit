# Notes: session-fixes

- Decision: transcript filenames use sanitize + sha256 suffix (12 hex) to avoid collisions.
- Decision: session updatedAt is touched after transcript writes and on failure path; flush persists.
- Test: runTaskLoop uses mocked runWorker to avoid spawning codex exec.
