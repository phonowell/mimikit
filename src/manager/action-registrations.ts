import {
  applyRunTask,
  type ApplyTaskActionsOptions,
} from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyUpsertFocusAction,
} from './action-apply-focus.js'
import {
  applyCreatePlan,
  applyDeletePlan,
  applyUpdatePlan,
} from './action-apply-plan.js'
import { applyCompressContextAction } from './action-runtime-compress.js'
import { applyRestartRuntimeAction } from './action-runtime-restart.js'
import {
  assignFocusSchema,
  cancelSchema,
  deletePlanSchema,
  restartSchema,
  summarizeSchema,
  updatePlanSchema,
  upsertFocusSchema,
} from './action-apply-schema.js'
import { applyAskUserChoiceAction } from './action-apply-choice.js'
import {
  validateAskUserChoice,
  validateCancelTask,
  validateCompressContext,
  validateCreatePlan,
  validatePlanById,
  validateQueryHistory,
  validateReadFile,
  validateRunTask,
  validateUpdatePlan,
  validateWithSchema,
  type FeedbackContext,
  type ValidationIssue,
} from './action-validation.js'

import type { Parsed } from '../actions/model/spec.js'
import { cancelTask, type RuntimeState } from './runtime-adapter.js'

export type ApplyContext = {
  seen: Set<string>
  options?: ApplyTaskActionsOptions
}

export type ApplyResult = 'continue' | 'stop'

export type ManagerActionDefinition = {
  name: string
  validate: (item: Parsed, context: FeedbackContext) => ValidationIssue[]
  apply: (
    runtime: RuntimeState,
    item: Parsed,
    context: ApplyContext,
  ) => Promise<ApplyResult>
}

export const continueApply = (): Promise<ApplyResult> => Promise.resolve('continue')

export type { ApplyTaskActionsOptions } from './action-apply-create.js'
export type { FeedbackContext, ValidationIssue } from './action-validation.js'

const applyCancelTaskAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = cancelSchema.safeParse(item.attrs)
  if (!parsed.success) return
  await cancelTask(runtime, parsed.data.id, { source: 'deferred' })
}

const applyAndContinue = (
  apply: (runtime: RuntimeState, item: Parsed) => Promise<void>,
): ManagerActionDefinition['apply'] =>
  async (runtime, item) => (await apply(runtime, item), 'continue')

const applyRunTaskAndContinue: ManagerActionDefinition['apply'] = async (
  runtime,
  item,
  context,
) => (await applyRunTask(runtime, item, context.seen, context.options), 'continue')

const applyRestartRuntime: ManagerActionDefinition['apply'] = async (
  runtime,
  item,
) => ((await applyRestartRuntimeAction(runtime, item)) ? 'stop' : 'continue')

const applyAskUserChoiceAndStop: ManagerActionDefinition['apply'] = async (
  runtime,
  item,
) => (await applyAskUserChoiceAction(runtime, item), 'stop')

const createNoopAction = (
  name: string,
  validate: (item: Parsed) => ValidationIssue[],
): ManagerActionDefinition => ({
  name,
  validate: (item) => validate(item),
  apply: continueApply,
})

export const ACTION_DEFINITIONS = [
  {
    name: 'create_plan',
    validate: (item, context) => validateCreatePlan(item, context),
    apply: applyAndContinue(applyCreatePlan),
  },
  {
    name: 'update_plan',
    validate: (item, context) => {
      const byIdIssues = validatePlanById(
        'update_plan',
        item,
        updatePlanSchema,
        context,
      )
      if (byIdIssues.length > 0) return byIdIssues
      return validateUpdatePlan(item, context)
    },
    apply: applyAndContinue(applyUpdatePlan),
  },
  {
    name: 'delete_plan',
    validate: (item, context) =>
      validatePlanById('delete_plan', item, deletePlanSchema, context),
    apply: applyAndContinue(applyDeletePlan),
  },
  {
    name: 'run_task',
    validate: (item) => validateRunTask(item),
    apply: applyRunTaskAndContinue,
  },
  {
    name: 'cancel_task',
    validate: (item, context) => validateCancelTask(item, context),
    apply: applyAndContinue(applyCancelTaskAction),
  },
  {
    name: 'ask_user_choice',
    validate: (item) => validateAskUserChoice(item),
    apply: applyAskUserChoiceAndStop,
  },
  {
    name: 'compress_context',
    validate: (item, context) => validateCompressContext(item, context),
    apply: applyAndContinue(applyCompressContextAction),
  },
  createNoopAction('summarize_task_result', (item) =>
    validateWithSchema(item, summarizeSchema),
  ),
  createNoopAction('query_history', validateQueryHistory),
  createNoopAction('read_file', validateReadFile),
  {
    name: 'restart_runtime',
    validate: (item) => validateWithSchema(item, restartSchema),
    apply: applyRestartRuntime,
  },
  {
    name: 'upsert_focus',
    validate: (item) => validateWithSchema(item, upsertFocusSchema),
    apply: applyAndContinue(applyUpsertFocusAction),
  },
  {
    name: 'assign_focus',
    validate: (item) => validateWithSchema(item, assignFocusSchema),
    apply: applyAndContinue(applyAssignFocusAction),
  },
] satisfies ManagerActionDefinition[]

export const MANAGER_ACTION_REGISTRY = new Map(ACTION_DEFINITIONS.map((definition) => [definition.name, definition]))

export const REGISTERED_MANAGER_ACTIONS = new Set(ACTION_DEFINITIONS.map((definition) => definition.name))

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
