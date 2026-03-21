import type { TaskGitExecution } from '../../types/index.js'

export const buildTaskGitExecution = (
  cwd: string,
  branch?: string,
): TaskGitExecution | undefined => {
  const normalizedBranch = branch?.trim()
  if (!normalizedBranch) return undefined
  return {
    worktreePath: cwd,
    branch: normalizedBranch,
  }
}
