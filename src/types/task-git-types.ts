export type TaskGitReview = {
  passed: boolean
  at?: string | undefined
  sha?: string | undefined
}

export type TaskGitLifecycle = {
  review: TaskGitReview
  merged: boolean
  mergedAt?: string | undefined
  cleaned: boolean
  cleanedAt?: string | undefined
}

export type TaskGitExecution = {
  worktreePath: string
  branch: string
  lifecycle?: TaskGitLifecycle | undefined
}
