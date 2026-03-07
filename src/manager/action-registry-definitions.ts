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
  createContinueAction,
  createNoopAction,
  createStopAction,
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

export const ACTION_DEFINITIONS = [
  createContinueAction(
    'create_plan',
    (item, context) => validateCreatePlan(item, context),
    applyCreatePlan,
  ),
  createContinueAction(
    'update_plan',
    (item, context) => {
      const byIdIssues = validatePlanById(
        'update_plan',
        item,
        updatePlanSchema,
        context,
      )
      if (byIdIssues.length > 0) return byIdIssues
      return validateUpdatePlan(item, context)
    },
    applyUpdatePlan,
  ),
  createContinueAction(
    'delete_plan',
    (item, context) =>
      validatePlanById('delete_plan', item, deletePlanSchema, context),
    applyDeletePlan,
  ),
  createContinueAction(
    'enqueue_task',
    (item, context) => validateRunTask(item, context),
    (runtime, item, context) =>
      applyRunTask(runtime, item, context.seen, context.options),
  ),
  createContinueAction(
    'mutate_task',
    (item, context) => validateMutateTask(item, context),
    applyMutateTaskAction,
  ),
  createStopAction(
    'ask_user_choice',
    (item, context) => validateAskUserChoice(item, context),
    (runtime, item) => applyAskUserChoiceAction(runtime, item),
  ),
  createNoopAction('set_task_result_summary', (item, context) =>
    validateSummarizeTaskResult(item, context),
  ),
  createNoopAction('query_context', validateQueryContext),
  createNoopAction('read_file', validateReadFile),
  createContinueAction(
    'upsert_focus',
    (item) => validateWithSchema(item, upsertFocusSchema),
    applyUpsertFocusAction,
  ),
  createContinueAction(
    'assign_focus',
    (item) => validateWithSchema(item, assignFocusSchema),
    applyAssignFocusAction,
  ),
  createContinueAction(
    'remember_memory',
    (item) => validateRememberMemory(item),
    applyRememberMemoryAction,
  ),
] satisfies ManagerActionDefinition[]
