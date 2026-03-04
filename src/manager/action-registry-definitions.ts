import { applyAskUserChoiceAction } from './action-apply-choice.js'
import { applyRunTask } from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyUpsertFocusAction,
} from './action-apply-focus.js'
import {
  applyCreatePlan,
  applyDeletePlan,
  applyUpdatePlan,
} from './action-apply-plan.js'
import {
  assignFocusSchema,
  cancelSchema,
  deletePlanSchema,
  restartSchema,
  updatePlanSchema,
  upsertFocusSchema,
} from './action-apply-schema.js'
import {
  applyAndContinue,
  continueApply,
  createNoopAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import { applyCompressContextAction } from './action-runtime-compress.js'
import { applyRestartRuntimeAction } from './action-runtime-restart.js'
import {
  validateAskUserChoice,
  validateCancelTask,
  validateCompressContext,
  validateCreatePlan,
  validatePlanById,
  validateQueryHistory,
  validateReadFile,
  validateRunTask,
  validateSummarizeTaskResult,
  validateUpdatePlan,
  validateWithSchema,
} from './action-validation.js'
import { cancelTask } from './runtime-adapter.js'

import type { Parsed } from '../actions/model/spec.js'

const applyCancelTaskAction = async (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
): Promise<void> => {
  const parsed = cancelSchema.safeParse(item.attrs)
  if (!parsed.success) return
  await cancelTask(runtime, parsed.data.id, { source: 'deferred' })
}

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
    validate: (item, context) => validateAskUserChoice(item, context),
    apply: applyAskUserChoiceAndStop,
  },
  {
    name: 'compress_context',
    validate: (item, context) => validateCompressContext(item, context),
    apply: applyAndContinue(applyCompressContextAction),
  },
  {
    name: 'summarize_task_result',
    validate: (item, context) => validateSummarizeTaskResult(item, context),
    apply: continueApply,
  },
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
