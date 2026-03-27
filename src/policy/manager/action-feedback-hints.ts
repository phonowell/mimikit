import { renderActionFeedbackHint } from './action-feedback-hint-renderer.js'
import { createRecordTaskGitHintFormatters } from './action-feedback-mutate-task-git-hints.js'

export * from './action-feedback-hints-basic.js'

const {
  formatRecordTaskGitNotDoneHint,
  formatRecordTaskGitNotGitHint,
  formatRecordTaskGitReviewRequiredHint,
  formatRecordTaskGitMergeRequiredHint,
} = createRecordTaskGitHintFormatters(renderActionFeedbackHint)

export const formatEnqueueTaskContractMissingHint = (): string =>
  renderActionFeedbackHint('enqueue_task_contract_missing')

export {
  formatRecordTaskGitMergeRequiredHint,
  formatRecordTaskGitNotDoneHint,
  formatRecordTaskGitNotGitHint,
  formatRecordTaskGitReviewRequiredHint,
}
