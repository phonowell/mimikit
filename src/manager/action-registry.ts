import { applyRunTask, type ApplyTaskActionsOptions } from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyCreateFocusAction,
  applyUpdateFocusAction,
} from './action-apply-focus.js'
import {
  applyCreateTemplate,
  applyDeleteTemplate,
  applyUpdateTemplate,
} from './action-apply-template.js'
import {
  applyCancelTaskAction,
  applyCompressContextAction,
  applyRestartRuntimeAction,
  applyWritePersonaAction,
  applyWriteUserProfileAction,
} from './action-apply-runtime.js'
import {
  assignFocusSchema,
  createFocusSchema,
  deleteTemplateSchema,
  restartSchema,
  summarizeSchema,
  updateFocusSchema,
  updateTemplateSchema,
} from './action-apply-schema.js'
import {
  type FeedbackContext,
  validateCancelTask,
  validateCompressContext,
  validateCreateTemplate,
  validateQueryHistory,
  validateReadFile,
  validateRunTask,
  validateTemplateById,
  validateUpdateTemplate,
  validateWithSchema,
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
    name: 'create_template',
    validate: (item: Parsed, context: FeedbackContext) =>
      validateCreateTemplate(item, context),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyCreateTemplate(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'update_template',
    validate: (item: Parsed, context: FeedbackContext) => {
      const byIdIssues = validateTemplateById(
        'update_template',
        item,
        updateTemplateSchema,
        context,
      )
      if (byIdIssues.length > 0) return byIdIssues
      return validateUpdateTemplate(item, context)
    },
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyUpdateTemplate(runtime, item)
      return 'continue'
    },
  },
  {
    name: 'delete_template',
    validate: (item: Parsed, context: FeedbackContext) =>
      validateTemplateById('delete_template', item, deleteTemplateSchema, context),
    apply: async (runtime: RuntimeState, item: Parsed) => {
      await applyDeleteTemplate(runtime, item)
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
