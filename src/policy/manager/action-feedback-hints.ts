import { renderActionFeedbackHint } from './action-feedback-hint-renderer.js'

export * from './action-feedback-hints-basic.js'

export const formatEnqueueTaskContractMissingHint = (): string =>
  renderActionFeedbackHint('enqueue_task_contract_missing')
