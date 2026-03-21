export type TaskGitReviewStatus = 'pending' | 'passed' | 'failed' | 'skipped'
export type TaskGitMergeStatus = 'pending' | 'merged' | 'not_applicable'
export type TaskGitCleanupStatus = 'pending' | 'done' | 'skipped'

export type TaskGitExecution = {
  worktreePath: string
  branch: string
  reviewStatus: TaskGitReviewStatus
  mergeStatus: TaskGitMergeStatus
  cleanupStatus: TaskGitCleanupStatus
}
