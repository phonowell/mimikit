import type { TaskGitExecution } from '../../foundation/types/index.js'

export const buildTaskGitExecution = (
  cwd: string,
  branch?: string,
  repoKey?: string,
  useWorktree?: boolean,
): TaskGitExecution | undefined => {
  if (useWorktree !== true) return undefined
  const normalizedBranch = branch?.trim()
  if (!normalizedBranch) return undefined
  if (!repoKey?.trim())
    throw new Error('task repoKey is required when useWorktree=true')
  return {
    worktreePath: cwd,
    branch: normalizedBranch,
    closureRequired: true,
  }
}
