import {
  invalidArgsIssue,
  suppressed,
  type ValidationIssue,
} from './action-validation-helpers.js'
import { assignFocusActionSchema } from './manager-turn-schema.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { Parsed } from '../actions/model/spec.js'

const ASSIGN_FOCUS_TARGET_UNAVAILABLE_HINT =
  'assign_focus target not available in current runtime snapshot'

export const validateAssignFocusAction = (
  item: Parsed,
  context: Pick<FeedbackContext, 'taskById' | 'planById'>,
): ValidationIssue[] => {
  if (item.type !== 'assign_focus') return []
  const result = assignFocusActionSchema.safeParse(item)
  if (!result.success) return suppressed(invalidArgsIssue(result.error).hint)

  if (item.target_type === 'task') {
    return context.taskById?.has(item.target_id)
      ? []
      : suppressed(ASSIGN_FOCUS_TARGET_UNAVAILABLE_HINT)
  }

  if (item.target_type === 'plan') {
    return context.planById?.has(item.target_id)
      ? []
      : suppressed(ASSIGN_FOCUS_TARGET_UNAVAILABLE_HINT)
  }

  return []
}
