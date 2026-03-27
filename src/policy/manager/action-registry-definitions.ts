import { PLAN_ACTION_DEFINITIONS } from './action-registry-plan-definitions.js'
import {
  DIALOG_ACTION_DEFINITIONS,
  FOCUS_ACTION_DEFINITIONS,
  MEMORY_ACTION_DEFINITIONS,
} from './action-registry-support-definitions.js'
import { TASK_ACTION_DEFINITIONS } from './action-registry-task-definitions.js'

import type {
  ApplyContext,
  ManagerActionDefinition,
} from './action-registry-shared.js'
import type { FeedbackContext, ValidationIssue } from './action-validation.js'
import type { Parsed } from '../actions/model/spec.js'

export const ACTION_DEFINITIONS = [
  ...TASK_ACTION_DEFINITIONS,
  ...PLAN_ACTION_DEFINITIONS,
  ...DIALOG_ACTION_DEFINITIONS,
  ...FOCUS_ACTION_DEFINITIONS,
  ...MEMORY_ACTION_DEFINITIONS,
] satisfies ManagerActionDefinition[]

export const MANAGER_ACTION_REGISTRY = new Map(
  ACTION_DEFINITIONS.map((definition) => [definition.name, definition]),
)

export const REGISTERED_MANAGER_ACTIONS = new Set(
  MANAGER_ACTION_REGISTRY.keys(),
)

const resolveActionDefinition = (
  actionName: Parsed['type'],
): ManagerActionDefinition | undefined =>
  MANAGER_ACTION_REGISTRY.get(actionName)

export const validateRegisteredManagerAction = (
  item: Parsed,
  context: FeedbackContext = {},
): ValidationIssue[] => {
  const definition = resolveActionDefinition(item.type)
  if (!definition) return []
  return definition.validate(item, context)
}

export const applyRegisteredManagerAction = (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
  context: ApplyContext,
): Promise<'continue' | 'stop'> => {
  const definition = resolveActionDefinition(item.type)
  if (!definition) return Promise.resolve('continue')
  return definition.apply(runtime, item, context)
}
