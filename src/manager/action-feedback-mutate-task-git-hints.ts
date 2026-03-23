import { z } from 'zod'

export const mutateTaskGitHintSchemaShape = {
  mutate_task_git_reason_required: z.string().trim().min(1),
  mutate_task_not_done_for_git: z.string().trim().min(1),
  mutate_task_not_git: z.string().trim().min(1),
  mutate_task_review_required: z.string().trim().min(1),
  mutate_task_merge_required: z.string().trim().min(1),
} as const

export type MutateTaskGitOp = 'review_passed' | 'merged' | 'cleaned'

type MutateTaskGitHintKey =
  | 'mutate_task_git_reason_required'
  | 'mutate_task_not_done_for_git'
  | 'mutate_task_not_git'
  | 'mutate_task_review_required'
  | 'mutate_task_merge_required'

type RenderHint = (
  key: MutateTaskGitHintKey,
  values?: Record<string, string>,
) => string

export const createMutateTaskGitHintFormatters = (renderHint: RenderHint) => ({
  formatMutateTaskGitReasonRequiredHint: (op: MutateTaskGitOp): string =>
    renderHint('mutate_task_git_reason_required', {
      op,
    }),
  formatMutateTaskNotDoneForGitHint: (op: MutateTaskGitOp): string =>
    renderHint('mutate_task_not_done_for_git', {
      op,
    }),
  formatMutateTaskNotGitHint: (op: MutateTaskGitOp): string =>
    renderHint('mutate_task_not_git', {
      op,
    }),
  formatMutateTaskReviewRequiredHint: (): string =>
    renderHint('mutate_task_review_required'),
  formatMutateTaskMergeRequiredHint: (): string =>
    renderHint('mutate_task_merge_required'),
})
