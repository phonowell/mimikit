import { applyRunTask, type ApplyTaskActionsOptions } from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyCreateFocusAction,
  applyUpdateFocusAction,
} from './action-apply-focus.js'
import {
  applyCreatePlan,
  applyDeletePlan,
  applyUpdatePlan,
} from './action-apply-plan.js'
import {
  applyCancelTaskAction,
  applyCompressContextAction,
  applyRestartRuntimeAction,
  applyWriteMemoryAction,
  applyWritePersonaAction,
  applyWriteUserProfileAction,
} from './action-apply-runtime.js'
import {
  assignFocusSchema,
  createFocusSchema,
  deletePlanSchema,
  restartSchema,
  summarizeSchema,
  updateFocusSchema,
  updatePlanSchema,
} from './action-apply-schema.js'
import {
  type FeedbackContext,
  validateCancelTask,
  validateCompressContext,
  validateCreatePlan,
  validateQueryHistory,
  validateQueryMemory,
  validateReadFile,
  validateRunTask,
  validatePlanById,
  validateUpdatePlan,
  validateWithSchema,
  validateWriteMemory,
  validateWritePersona,
  validateWriteUserProfile,
  type ValidationIssue,
} from './action-validation.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from './runtime-adapter.js'

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

const continueApply = (): Promise<ApplyResult> => Promise.resolve('continue')

const ACTION_DEFINITIONS = [
  {
    name: 'create_plan',
    validate: (item: Parsed, context: FeedbackContext) =>
      validateCreatePlan(item, context),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyCreatePlan(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'update_plan',
    validate: (item: Parsed, context: FeedbackContext) => {
      const byIdIssues = validatePlanById(
        'update_plan',
        item,
        updatePlanSchema,
        context,
      )
      if (byIdIssues.length > 0) return byIdIssues
      return validateUpdatePlan(item, context)
    },
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyUpdatePlan(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'delete_plan',
    validate: (item: Parsed, context: FeedbackContext) =>
      validatePlanById('delete_plan', item, deletePlanSchema, context),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyDeletePlan(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'run_task',
    validate: (item: Parsed) => validateRunTask(item),
    apply: async (
      runtime: RuntimeState,
      item: Parsed,
      context: ApplyContext,
    ) => {
      await applyRunTask(runtime, item, context.seen, context.options)
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
    name: 'query_memory',
    validate: (item: Parsed) => validateQueryMemory(item),
    apply: continueApply,
  },
  {
    name: 'read_file',
    validate: (item: Parsed) => validateReadFile(item),
    apply: continueApply,
  },
  {
    name: 'write_persona',
    validate: (item: Parsed) => validateWritePersona(item),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyWritePersonaAction(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'write_user_profile',
    validate: (item: Parsed) => validateWriteUserProfile(item),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyWriteUserProfileAction(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'write_memory',
    validate: (item: Parsed) => validateWriteMemory(item),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyWriteMemoryAction(runtime, item)
      return 'continue'
    },
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

export const applyRegisteredManagerAction = (
  runtime: RuntimeState,
  item: Parsed,
  context: ApplyContext,
): Promise<ApplyResult> => {
  const definition = MANAGER_ACTION_REGISTRY.get(item.name)
  if (!definition) return continueApply()
  return definition.apply(runtime, item, context)
}
