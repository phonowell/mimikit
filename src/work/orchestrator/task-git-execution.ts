import type { TaskGitExecution } from '../../foundation/types/index.js'

export const buildTaskGitExecution = (
  cwd: string,
  branch?: string,
  useWorktree?: boolean,
): TaskGitExecution | undefined => {
  if (useWorktree !== true) return undefined
  const normalizedBranch = branch?.trim()
  if (!normalizedBranch) return undefined
  return {
    worktreePath: cwd,
    branch: normalizedBranch,
  }
}
