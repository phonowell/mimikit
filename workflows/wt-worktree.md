# 工作流：评审与合并（worktree）

## 目的

- 记录本地评审、同步 main、合并到 main 的标准流程。

## 脚本入口

- 合并脚本：`./scripts/worktree/land-worktree.js`（命令：`pnpm run wt-land`）
- 同步脚本：`./scripts/worktree/rebase-worktree.js`（命令：`pnpm run wt-rebase`）
- 限制：仅在 `worktree-1/2/3` 执行，禁止在 `main` 直接执行。

## 标准步骤

1. 先完成代码复审（建议运行 `review-code-changes`）。
2. 在当前 worktree 运行 `pnpm run wt-rebase`，确保基于最新 `origin/main`。
3. 在当前 worktree 运行 `pnpm run wt-land`，执行自动提交、squash 合并到 `main`。
4. 若脚本提示冲突，先解决冲突再重跑。

## 脚本行为摘要

- 当前分支自动提交未提交改动（自动消息）。
- 当前分支执行 `rebase main`。
- main worktree 执行 `merge --squash` 并提交。
- main worktree 在落地后执行 `git push`，将 `main` 推到远端。
- 合并前清空 `plans/` 目录内容。

## 当前协作约定

- `worktree-1/2/3` 作为本地开发槽位，不直接推远端。
- 开发完成后统一通过 `pnpm run wt-land` 汇入 `main`。
- `pnpm run wt-land` 会自动把 `main` 推送到默认上游远端。

## 禁推送（worktree 槽位）

- 初始化：`git -C <repo-root> config extensions.worktreeConfig true`
- 槽位配置：`git -C <worktree-path> config --worktree remote.origin.pushurl "disabled://no-push"`
- 解除禁推送：`git -C <worktree-path> config --worktree --unset remote.origin.pushurl`

## 禁 publish（可选）

- 在 `package.json` 增加 `prepublishOnly`，限制仅 `main` 可发布。
