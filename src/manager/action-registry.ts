import {
  applyRunTask,
  applyScheduleTask,
  type ApplyTaskActionsOptions,
} from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyCreateFocusAction,
  applyUpdateFocusAction,
} from './action-apply-focus.js'
import {
  applyCreateIntent,
  applyDeleteIntent,
  applyUpdateIntent,
} from './action-apply-intent.js'
import {
  assignFocusSchema,
  createFocusSchema,
  createIntentSchema,
  deleteIntentSchema,
  restartSchema,
  summarizeSchema,
  updateFocusSchema,
  updateIntentSchema,
} from './action-apply-schema.js'
import {
  applyCancelTaskAction,
  applyCompressContextAction,
  applyRestartRuntimeAction,
} from './action-apply-runtime.js'
import {
  type FeedbackContext,
  type ValidationIssue,
  validateCancelTask,
  validateCompressContext,
  validateIntentById,
  validateQueryHistory,
  validateRunTask,
  validateScheduleTask,
  validateWithSchema,
} from './action-validation.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export type { ApplyTaskActionsOptions } from './action-apply-create.js'
export type { FeedbackContext, ValidationIssue } from './action-validation.js'

export type ApplyContext = {
  seen: Set<string>
  options?: ApplyTaskActionsOptions
}

export type ApplyResult = 'continue' | 'stop'

type ManagerActionDefinition = {
  name: string
  validate: (item: Parsed, context: FeedbackContext) => ValidationIssue[]
  apply: (
    runtime: RuntimeState,
    item: Parsed,
    context: ApplyContext,
  ) => Promise<ApplyResult>
}

const continueApply = async (): Promise<ApplyResult> => 'continue'

const ACTION_DEFINITIONS = [
  {
    name: 'create_intent',
    validate: (item: Parsed) => validateWithSchema(item, createIntentSchema),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyCreateIntent(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'update_intent',
    validate: (item: Parsed, context: FeedbackContext) =>
      validateIntentById('update_intent', item, updateIntentSchema, context),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyUpdateIntent(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'delete_intent',
    validate: (item: Parsed, context: FeedbackContext) =>
      validateIntentById('delete_intent', item, deleteIntentSchema, context),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyDeleteIntent(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'run_task',
    validate: (item: Parsed) => validateRunTask(item),
    apply: async (runtime: RuntimeState, item: Parsed, context: ApplyContext) => {
      await applyRunTask(runtime, item, context.seen, context.options)
      return 'continue'
    },
  },
  {
    name: 'schedule_task',
    validate: (item: Parsed, context: FeedbackContext) =>
      validateScheduleTask(item, context),
    apply: async (runtime: RuntimeState, item: Parsed, context: ApplyContext) => {
      await applyScheduleTask(runtime, item, context.seen)
      return 'continue'
    },
  },
  {
    name: 'cancel_task',
    validate: (item: Parsed, context: FeedbackContext) =>
      validateCancelTask(item, context),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyCancelTaskAction(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'compress_context',
    validate: (item: Parsed, context: FeedbackContext) =>
      validateCompressContext(item, context),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyCompressContextAction(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'summarize_task_result',
    validate: (item: Parsed) => validateWithSchema(item, summarizeSchema),
    apply: continueApply,
  },
  {
    name: 'query_history',
    validate: (item: Parsed) => validateQueryHistory(item),
    apply: continueApply,
  },
  {
    name: 'restart_runtime',
    validate: (item: Parsed) => validateWithSchema(item, restartSchema),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      const shouldStop = await applyRestartRuntimeAction(runtime, item)
      return shouldStop ? 'stop' : 'continue'
    },
  },
  {
    name: 'create_focus',
    validate: (item: Parsed) => validateWithSchema(item, createFocusSchema),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyCreateFocusAction(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'update_focus',
    validate: (item: Parsed) => validateWithSchema(item, updateFocusSchema),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyUpdateFocusAction(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'assign_focus',
    validate: (item: Parsed) => validateWithSchema(item, assignFocusSchema),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyAssignFocusAction(runtime, item)
      return 'continue'
    },
  },
] satisfies ManagerActionDefinition[]

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

export const applyRegisteredManagerAction = async (
  runtime: RuntimeState,
  item: Parsed,
  context: ApplyContext,
): Promise<ApplyResult> => {
  const definition = MANAGER_ACTION_REGISTRY.get(item.name)
  if (!definition) return 'continue'
  return definition.apply(runtime, item, context)
}
