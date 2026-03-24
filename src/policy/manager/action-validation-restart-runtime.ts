import { restartRuntimeSchema } from './action-apply-schema.js'
import {
  formatRestartRuntimeAlreadyScheduledHint,
  formatRestartRuntimeBusyHint,
  formatRestartRuntimeUnavailableHint,
} from './action-feedback-hints.js'
import { parseActionAttrs } from './action-parse.js'
import {
  rejected,
  validateItemWithSchema,
  type ValidationIssue,
} from './action-validation-helpers.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { Parsed } from '../actions/model/spec.js'

export const validateRestartRuntimeAction = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, restartRuntimeSchema)
  if (!parsed) return validateItemWithSchema(item, restartRuntimeSchema)
  if (context.restartRuntimeAvailable === false)
    return rejected(formatRestartRuntimeUnavailableHint())
  if (context.restartRuntimeScheduled === true)
    return rejected(formatRestartRuntimeAlreadyScheduledHint())
  if (context.restartRuntimeBusy === true)
    return rejected(formatRestartRuntimeBusyHint())
  return []
}
