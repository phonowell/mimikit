# 工作流：评审与合并

## 目的
- 记录本地评审、提交、同步与合并流程

## 脚本
- 路径：`./scripts/merge-worktree.ts`
- 运行：`pnpm run merge`
- 限制：只能在 `worktree-1/2/3` 执行，禁止在 `main`

## 同步 main → 当前槽位
- 路径：`./scripts/sync-worktree.ts`
- 运行：`pnpm run sync`
- 限制：只能在 `worktree-1/2/3` 执行，禁止在 `main`

## 步骤
1. 运行 `review-code-changes` skill，确保通过
2. 确保 main worktree 干净后运行脚本，完成自动提交、同步 main、squash 合并到 main
3. 脚本优先走纯代码快速路径；若提示冲突，再使用 LLM 处理后重跑
4. 保留当前分支与 worktree

## 脚本行为
- 当前分支：自动提交未提交改动（自动消息）
- 同步：`rebase origin/main`
- main worktree：`merge --squash` 当前分支并提交
- 合并前：自动清空 `plans/` 目录内容

## 快速路径与 LLM
- 快速路径：全部 git 操作可自动完成
- 失败处理：仅在冲突阻塞时提示使用 LLM 介入

## 当前工作状态
- worktree-1/2/3 为本地开发槽位，不推送远端
- 开发完成后运行 `pnpm run merge` 合并到 main
- 脚本会自动将当前槽位 rebase 到 `origin/main`
- 如需与最新远端对齐，先 `git push origin main`

## 禁推送（worktree 槽位）
- 初始化：`git -C <repo-root> config extensions.worktreeConfig true`
- 槽位配置：`git -C <worktree-path> config --worktree remote.origin.pushurl "disabled://no-push"`
- 解除禁推送：`git -C <worktree-path> config --worktree --unset remote.origin.pushurl`

## 禁 publish（可选）
- `package.json` 加 `prepublishOnly`，仅允许在 `main` 执行发布
