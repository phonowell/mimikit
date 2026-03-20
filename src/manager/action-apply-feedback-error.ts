import type { ManagerActionFeedback } from '../types/index.js'

const ACTION_APPLY_FEEDBACK_ERROR = 'manager_action_apply_feedback'

export class ActionApplyFeedbackError extends Error {
  readonly feedback: ManagerActionFeedback

  constructor(feedback: ManagerActionFeedback) {
    super(feedback.hint)
    this.name = ACTION_APPLY_FEEDBACK_ERROR
    this.feedback = feedback
  }
}

export const isActionApplyFeedbackError = (
  value: unknown,
): value is ActionApplyFeedbackError =>
  value instanceof ActionApplyFeedbackError ||
  (value instanceof Error &&
    value.name === ACTION_APPLY_FEEDBACK_ERROR &&
    'feedback' in value)
