import { renderActionFeedbackHint } from './action-feedback-hint-renderer.js'
import { createMutateTaskGitHintFormatters } from './action-feedback-mutate-task-git-hints.js'

export * from './action-feedback-hints-basic.js'

const {
  formatMutateTaskGitReasonRequiredHint,
  formatMutateTaskNotDoneForGitHint,
  formatMutateTaskNotGitHint,
  formatMutateTaskReviewRequiredHint,
  formatMutateTaskMergeRequiredHint,
} = createMutateTaskGitHintFormatters(renderActionFeedbackHint)

export const formatEnqueueTaskContractMissingHint = (): string =>
  renderActionFeedbackHint('enqueue_task_contract_missing')

export {
  formatMutateTaskGitReasonRequiredHint,
  formatMutateTaskMergeRequiredHint,
  formatMutateTaskNotDoneForGitHint,
  formatMutateTaskNotGitHint,
  formatMutateTaskReviewRequiredHint,
}
