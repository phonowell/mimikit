# Worktree 槽位工作流

> 返回 [Workflow 索引](./task-and-action.md)

## 目标

- 自动管理 `worktree-1/2/3` 槽位占用状态。
- 任务开始时自动占用槽位，并在槽位内执行 `pnpm run wt-rebase`。
- 开发完成后执行 `review-code-changes` 门禁，通过后 `wt-land` 并释放槽位。

## 命令入口

- `pnpm run wt-slot status`
- `pnpm run wt-slot start [--slot worktree-1|worktree-2|worktree-3] [--owner runtime-xxx]`
- `pnpm run wt-slot finish --slot worktree-x --message "..." [--review-cmd review-code-changes]`
- `pnpm run wt-slot release --slot worktree-x [--force]`

## 标准流程

1. 启动任务并占用槽位
   - `pnpm run wt-slot start`
   - 输出 `slot=...` 与 `path=...`
2. 在槽位目录内完成开发
3. 质量门禁 + 落地 + 自动释放
   - `pnpm run wt-slot finish --slot worktree-1 --message "chore: ..."`
   - 内部顺序：`pnpm run review-code-changes` -> `pnpm run wt-land -- --message "..."` -> release lock
   - `wt-land` 内部会在 `main` 落地后自动执行 `git push`（推送到 `main` 默认上游远端）。

## 最小验证步骤

1. 查看初始状态：`pnpm run wt-slot status`
2. 占用槽位并同步：`pnpm run wt-slot start --slot worktree-1`
3. 二次占用同槽位，预期失败：`pnpm run wt-slot start --slot worktree-1`
4. 完成任务后执行：`pnpm run wt-slot finish --slot worktree-1 --message "chore: ..."`
5. 再次查看状态，预期 `worktree-1` 为 `available`：`pnpm run wt-slot status`

## 失败恢复

- `finish` 失败时，槽位会保持 `occupied`，避免并发任务误占。
- 问题修复后可重试 `finish`。
- 需要人工释放时执行：
  - `pnpm run wt-slot release --slot worktree-1`
  - 若锁文件异常丢失/损坏：`pnpm run wt-slot release --slot worktree-1 --force`

## 实现位置

- `scripts/worktree/slot-state.js`：槽位发现与 lock 文件管理
- `scripts/worktree/manage-slot.js`：`start/finish/release/status` 编排入口
- `package.json`：`wt-slot` 与 `review-code-changes` 脚本
