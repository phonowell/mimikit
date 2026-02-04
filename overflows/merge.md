# 工作流：评审与合并

## 目的
- 记录本地评审、提交、同步与合并流程

## 脚本
- 路径：`./overflows/merge.ts`
- 运行：`tsx overflows/merge.ts [--clean-plans <file...>]`

## 步骤
1. 运行 `review-code-changes` skill，确保通过
2. 确保 main worktree 干净后运行脚本，完成自动提交、同步 main、squash 合并到 main
3. 若脚本提示冲突，在当前分支或 main worktree 处理后重跑脚本
4. 保留当前分支与 worktree

## 脚本行为
- 当前分支：自动提交未提交改动（自动消息）
- 同步：`rebase origin/main`
- main worktree：`merge --squash` 当前分支并提交
- 可选：`--clean-plans <file...>` 删除 `plans/` 下指定文件
