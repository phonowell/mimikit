import { applyAskUserChoiceAction } from './action-apply-choice.js'
import { applyRunTask } from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyUpsertFocusAction,
} from './action-apply-focus.js'
import { applyRememberMemoryAction } from './action-apply-memory.js'
import {
  assignFocusSchema,
  mutateTaskSchema,
  upsertFocusSchema,
} from './action-apply-schema.js'
import { parseActionAttrs } from './action-parse.js'
import { ACTION_PROMPT_SPECS } from './action-prompt-spec.js'
import { PLAN_ACTION_DEFINITIONS } from './action-registry-plan-definitions.js'
import {
  type ApplyContext,
  createContinueAction,
  createNoopAction,
  createStopAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import {
  type FeedbackContext,
  validateAskUserChoice,
  validateMutateTask,
  validateRememberMemory,
  validateRunTask,
  validateSummarizeTaskResult,
  validateWithSchema,
  type ValidationIssue,
} from './action-validation.js'
import {
  cancelTask,
  pauseTask,
  recordTaskGitLifecycle,
  resumeTask,
} from './runtime-adapter.js'

import type { Parsed } from '../actions/model/spec.js'

const applyMutateTaskAction = async (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, mutateTaskSchema)
  if (!parsed) return
  const { id, op, reason, sha } = parsed
  const meta = {
    source: 'deferred',
    ...(reason ? { reason } : {}),
    ...(sha ? { sha } : {}),
  }
  if (op === 'pause') {
    await pauseTask(runtime, id, meta)
    return
  }
  if (op === 'resume') {
    await resumeTask(runtime, id, meta)
    return
  }
  if (op === 'review_passed' || op === 'merged' || op === 'cleaned') {
    await recordTaskGitLifecycle(runtime, id, op, meta)
    return
  }
  await cancelTask(runtime, id, meta)
}

const TASK_ACTION_DEFINITIONS = [
  {
    name: 'enqueue_task',
    domain: 'task',
    prompt: ACTION_PROMPT_SPECS.enqueue_task,
    validate: (item, context) => validateRunTask(item, context),
    apply: (runtime, item, context) =>
      applyRunTask(runtime, item, context.seen, context.options),
  } satisfies ManagerActionDefinition,
  createContinueAction(
    {
      name: 'mutate_task',
      domain: 'task',
      prompt: ACTION_PROMPT_SPECS.mutate_task,
    },
    (item, context) => validateMutateTask(item, context),
    applyMutateTaskAction,
  ),
  createNoopAction(
    {
      name: 'set_task_result_summary',
      domain: 'task',
      prompt: ACTION_PROMPT_SPECS.set_task_result_summary,
    },
    (item, context) => validateSummarizeTaskResult(item, context),
  ),
] satisfies ManagerActionDefinition[]

const DIALOG_ACTION_DEFINITIONS = [
  createStopAction(
    {
      name: 'ask_user_choice',
      domain: 'dialog',
      prompt: ACTION_PROMPT_SPECS.ask_user_choice,
    },
    (item, context) => validateAskUserChoice(item, context),
    (runtime, item) => applyAskUserChoiceAction(runtime, item),
  ),
] satisfies ManagerActionDefinition[]

const FOCUS_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'upsert_focus',
      domain: 'focus',
      prompt: ACTION_PROMPT_SPECS.upsert_focus,
    },
    (item) => validateWithSchema(item, upsertFocusSchema),
    applyUpsertFocusAction,
  ),
  createContinueAction(
    {
      name: 'assign_focus',
      domain: 'focus',
      prompt: ACTION_PROMPT_SPECS.assign_focus,
    },
    (item) => validateWithSchema(item, assignFocusSchema),
    applyAssignFocusAction,
  ),
] satisfies ManagerActionDefinition[]

const MEMORY_ACTION_DEFINITIONS = [
  createContinueAction(
    {
      name: 'remember_memory',
      domain: 'memory',
      prompt: ACTION_PROMPT_SPECS.remember_memory,
    },
    (item, context) => validateRememberMemory(item, context),
    applyRememberMemoryAction,
  ),
] satisfies ManagerActionDefinition[]

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
  actionName: Parsed['name'],
): ManagerActionDefinition | undefined =>
  MANAGER_ACTION_REGISTRY.get(actionName)

export const validateRegisteredManagerAction = (
  item: Parsed,
  context: FeedbackContext = {},
): ValidationIssue[] => {
  const definition = resolveActionDefinition(item.name)
  if (!definition) return []
  return definition.validate(item, context)
}

export const applyRegisteredManagerAction = (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
  context: ApplyContext,
): Promise<'continue' | 'stop'> => {
  const definition = resolveActionDefinition(item.name)
  if (!definition) return Promise.resolve('continue')
  return definition.apply(runtime, item, context)
}
