import { z } from 'zod'

export const recordTaskGitHintSchemaShape = {
  record_task_git_not_done: z.string().trim().min(1),
  record_task_git_not_git: z.string().trim().min(1),
  record_task_git_review_required: z.string().trim().min(1),
  record_task_git_merge_required: z.string().trim().min(1),
} as const

export type RecordTaskGitState = 'review_passed' | 'merged' | 'cleaned'

type RecordTaskGitHintKey =
  | 'record_task_git_not_done'
  | 'record_task_git_not_git'
  | 'record_task_git_review_required'
  | 'record_task_git_merge_required'

type RenderHint = (
  key: RecordTaskGitHintKey,
  values?: Record<string, string>,
) => string

export const createRecordTaskGitHintFormatters = (renderHint: RenderHint) => ({
  formatRecordTaskGitNotDoneHint: (state: RecordTaskGitState): string =>
    renderHint('record_task_git_not_done', { state }),
  formatRecordTaskGitNotGitHint: (state: RecordTaskGitState): string =>
    renderHint('record_task_git_not_git', { state }),
  formatRecordTaskGitReviewRequiredHint: (): string =>
    renderHint('record_task_git_review_required'),
  formatRecordTaskGitMergeRequiredHint: (): string =>
    renderHint('record_task_git_merge_required'),
})
