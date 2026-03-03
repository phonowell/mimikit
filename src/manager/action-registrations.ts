import { ACTION_DEFINITIONS } from './action-registry-definitions.js'
import { continueApply } from './action-registry-shared.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from './runtime-adapter.js'
import type {
  FeedbackContext,
  ValidationIssue,
} from './action-validation.js'
import type {
  ApplyContext,
  ApplyResult,
  ManagerActionDefinition,
} from './action-registry-shared.js'
import type { ApplyTaskActionsOptions } from './action-apply-create.js'

export type { ApplyContext, ApplyResult, ManagerActionDefinition }
export type { ApplyTaskActionsOptions }
export type { FeedbackContext, ValidationIssue }
export { ACTION_DEFINITIONS }

export const MANAGER_ACTION_REGISTRY = new Map(
  ACTION_DEFINITIONS.map((definition) => [definition.name, definition]),
)

export const REGISTERED_MANAGER_ACTIONS = new Set(
  ACTION_DEFINITIONS.map((definition) => definition.name),
)

export const validateRegisteredManagerAction = (
  item: Parsed,
  context: FeedbackContext = {},
): ValidationIssue[] => {
  const definition = MANAGER_ACTION_REGISTRY.get(item.name)
  if (!definition) return []
  return definition.validate(item, context)
}

export const applyRegisteredManagerAction = (
  runtime: RuntimeState,
  item: Parsed,
  context: ApplyContext,
): Promise<ApplyResult> => {
  const definition = MANAGER_ACTION_REGISTRY.get(item.name)
  if (!definition) return continueApply()
  return definition.apply(runtime, item, context)
}
