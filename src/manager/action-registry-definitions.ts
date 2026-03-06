import { applyAskUserChoiceAction } from './action-apply-choice.js'
import { applyRunTask } from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyUpsertFocusAction,
} from './action-apply-focus.js'
import { applyRememberMemoryAction } from './action-apply-memory.js'
import {
  applyCreatePlan,
  applyDeletePlan,
  applyUpdatePlan,
} from './action-apply-plan.js'
import {
  assignFocusSchema,
  deletePlanSchema,
  mutateTaskSchema,
  updatePlanSchema,
  upsertFocusSchema,
} from './action-apply-schema.js'
import {
  applyAndContinue,
  continueApply,
  createNoopAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import {
  validateAskUserChoice,
  validateCreatePlan,
  validateMutateTask,
  validatePlanById,
  validateQueryContext,
  validateReadFile,
  validateRememberMemory,
  validateRunTask,
  validateSummarizeTaskResult,
  validateUpdatePlan,
  validateWithSchema,
} from './action-validation.js'
import { cancelTask, pauseTask, resumeTask } from './runtime-adapter.js'

import type { Parsed } from '../actions/model/spec.js'

const applyMutateTaskAction = async (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
): Promise<void> => {
  const parsed = mutateTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const { id, op, reason } = parsed.data
  const meta = {
    source: 'deferred',
    ...(reason ? { reason } : {}),
  }
  if (op === 'pause') {
    await pauseTask(runtime, id, meta)
    return
  }
  if (op === 'resume') {
    await resumeTask(runtime, id, meta)
    return
  }
  await cancelTask(runtime, id, meta)
}

const applyRunTaskAndContinue: ManagerActionDefinition['apply'] = async (
  runtime,
  item,
  context,
) => (
  await applyRunTask(runtime, item, context.seen, context.options),
  'continue'
)

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
    name: 'enqueue_task',
    validate: (item) => validateRunTask(item),
    apply: applyRunTaskAndContinue,
  },
  {
    name: 'mutate_task',
    validate: (item, context) => validateMutateTask(item, context),
    apply: applyAndContinue(applyMutateTaskAction),
  },
  {
    name: 'ask_user_choice',
    validate: (item, context) => validateAskUserChoice(item, context),
    apply: applyAskUserChoiceAndStop,
  },
  {
    name: 'set_task_result_summary',
    validate: (item, context) => validateSummarizeTaskResult(item, context),
    apply: continueApply,
  },
  createNoopAction('query_context', validateQueryContext),
  createNoopAction('read_file', validateReadFile),
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
  {
    name: 'remember_memory',
    validate: (item) => validateRememberMemory(item),
    apply: applyAndContinue(applyRememberMemoryAction),
  },
] satisfies ManagerActionDefinition[]
