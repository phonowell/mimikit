# notes_subprocess-concurrency

- 用户选择：仅调整默认值为 5，不做硬上限。
- 现有并发控制入口为 `Config.maxWorkers` + `Semaphore`。
- 按项目规则，新功能使用独立 worktree。
- worktree: /tmp/mimikit-maxworkers-default-5 (branch chore-maxworkers-default-5)。
- 新功能需补最小测试；测试套件使用 vitest。
