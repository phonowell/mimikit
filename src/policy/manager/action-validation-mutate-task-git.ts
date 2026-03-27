import { resolveTaskGitLifecycle } from '../../work/shared/task-git-lifecycle.js'

import {
  formatRecordTaskGitMergeRequiredHint,
  formatRecordTaskGitNotDoneHint,
  formatRecordTaskGitNotGitHint,
  formatRecordTaskGitReasonRequiredHint,
  formatRecordTaskGitReviewRequiredHint,
} from './action-feedback-hints.js'
import { rejected, type ValidationIssue } from './action-validation-helpers.js'

import type { Task, TaskStatus } from '../../foundation/types/index.js'

type MutateTaskGitOp = 'review_passed' | 'merged' | 'cleaned'

export const validateMutateTaskGitOp = (params: {
  op: MutateTaskGitOp
  taskStatus: TaskStatus
  task?: Task | undefined
  reason?: string | undefined
}): ValidationIssue[] => {
  const { op, taskStatus, task, reason } = params
  if (!reason?.trim()) return rejected(formatRecordTaskGitReasonRequiredHint())
  if (
    taskStatus !== 'succeeded' &&
    taskStatus !== 'failed' &&
    taskStatus !== 'canceled'
  )
    return rejected(formatRecordTaskGitNotDoneHint(op))
  if (task && !task.git) return rejected(formatRecordTaskGitNotGitHint(op))
  const lifecycle = task ? resolveTaskGitLifecycle(task) : undefined
  if (op === 'merged' && !lifecycle?.review.passed)
    return rejected(formatRecordTaskGitReviewRequiredHint())
  if (op === 'cleaned' && !lifecycle?.merged)
    return rejected(formatRecordTaskGitMergeRequiredHint())
  return []
}
