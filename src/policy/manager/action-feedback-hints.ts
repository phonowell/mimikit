import {
  formatEnqueueTaskContractMissingHint as buildEnqueueTaskContractMissingHint,
  type EnqueueTaskContractHintAttrs,
} from './action-feedback-enqueue-task-contract.js'
import {
  actionFeedbackHintTemplates,
  renderActionFeedbackHint,
} from './action-feedback-hint-renderer.js'
import { createMutateTaskGitHintFormatters } from './action-feedback-mutate-task-git-hints.js'

export * from './action-feedback-hints-basic.js'

const {
  formatMutateTaskGitReasonRequiredHint,
  formatMutateTaskNotDoneForGitHint,
  formatMutateTaskNotGitHint,
  formatMutateTaskReviewRequiredHint,
  formatMutateTaskMergeRequiredHint,
} = createMutateTaskGitHintFormatters(renderActionFeedbackHint)

const FALLBACK_TASK_CONTRACT_HINT_VALUES = {
  worker_prompt:
    actionFeedbackHintTemplates.enqueue_task_contract_missing_default_worker_prompt,
  title:
    actionFeedbackHintTemplates.enqueue_task_contract_missing_default_title,
  cwd: actionFeedbackHintTemplates.enqueue_task_contract_missing_default_cwd,
  goal: actionFeedbackHintTemplates.enqueue_task_contract_missing_default_goal,
  in_scope:
    actionFeedbackHintTemplates.enqueue_task_contract_missing_default_in_scope,
  out_of_scope:
    actionFeedbackHintTemplates.enqueue_task_contract_missing_default_out_of_scope,
  done_when_1:
    actionFeedbackHintTemplates.enqueue_task_contract_missing_default_done_when_1,
} as const

export const formatEnqueueTaskContractMissingHint = (
  attrs?: EnqueueTaskContractHintAttrs,
): string =>
  buildEnqueueTaskContractMissingHint({
    renderHint: renderActionFeedbackHint,
    defaults: FALLBACK_TASK_CONTRACT_HINT_VALUES,
    ...(attrs ? { attrs } : {}),
  })

export {
  formatMutateTaskGitReasonRequiredHint,
  formatMutateTaskMergeRequiredHint,
  formatMutateTaskNotDoneForGitHint,
  formatMutateTaskNotGitHint,
  formatMutateTaskReviewRequiredHint,
}
