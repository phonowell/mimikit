import { resolveTaskGitLifecycle } from '../shared/task-git-lifecycle.js'

import {
  formatMutateTaskGitReasonRequiredHint,
  formatMutateTaskMergeRequiredHint,
  formatMutateTaskNotDoneForGitHint,
  formatMutateTaskNotGitHint,
  formatMutateTaskReviewRequiredHint,
} from './action-feedback-hints.js'
import { rejected, type ValidationIssue } from './action-validation-helpers.js'

import type { Task, TaskStatus } from '../types/index.js'

type MutateTaskGitOp = 'review_passed' | 'merged' | 'cleaned'

export const validateMutateTaskGitOp = (params: {
  op: MutateTaskGitOp
  taskStatus: TaskStatus
  task?: Task | undefined
  reason?: string | undefined
}): ValidationIssue[] => {
  const { op, taskStatus, task, reason } = params
  if (!reason?.trim())
    return rejected(formatMutateTaskGitReasonRequiredHint(op))
  if (
    taskStatus !== 'succeeded' &&
    taskStatus !== 'failed' &&
    taskStatus !== 'canceled'
  )
    return rejected(formatMutateTaskNotDoneForGitHint(op))
  if (task && !task.git) return rejected(formatMutateTaskNotGitHint(op))
  const lifecycle = task ? resolveTaskGitLifecycle(task) : undefined
  if (op === 'merged' && !lifecycle?.review.passed)
    return rejected(formatMutateTaskReviewRequiredHint())
  if (op === 'cleaned' && !lifecycle?.merged)
    return rejected(formatMutateTaskMergeRequiredHint())
  return []
}
