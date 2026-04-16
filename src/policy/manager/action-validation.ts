import { renderActionFeedbackHint } from './action-feedback-hint-renderer.js'
import {
  formatTaskControlAlreadyCanceledHint,
  formatTaskControlAlreadyDoneHint,
  formatTaskControlAlreadyPausedHint,
  formatTaskControlNotFoundHint,
  formatTaskControlNotPausedHint,
} from './action-feedback-hints-basic.js'
import { validateEnqueueTaskManagerRules } from './action-validation-enqueue-task.js'
import { rejected, type ValidationIssue } from './action-validation-helpers.js'
import {
  validateDeletePlan,
  validateSetPlan,
} from './action-validation-plan.js'
import { validateRememberMemoryAction } from './action-validation-remember-memory.js'
import { validateWithSchema } from './action-validation-shared.js'
import {
  enqueueTaskActionSchema,
  rememberMemoryActionSchema,
  taskControlActionSchema,
} from './manager-turn-schema.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from './task-contract.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'

export type { FeedbackContext } from './action-validation-context.js'
export type { ValidationIssue } from './action-validation-helpers.js'
export { validateDeletePlan, validateSetPlan, validateWithSchema }

const formatEnqueueTaskContractMissingHint = (): string =>
  renderActionFeedbackHint('enqueue_task_contract_missing')

export const validateRunTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const schemaIssues = validateWithSchema(item, enqueueTaskActionSchema)
  if (schemaIssues.length > 0) return schemaIssues
  if (item.type !== 'enqueue_task') return schemaIssues
  const contract = buildTaskContractFromDraft(item.task)
  const workerPrompt = resolveWorkerPromptFromDraft(item.task)
  if (!contract || !workerPrompt) {
    return rejected(formatEnqueueTaskContractMissingHint(), {
      code: 'task_contract_missing',
    })
  }
  const managerRuleIssues = validateEnqueueTaskManagerRules(item, context)
  if (managerRuleIssues.length > 0) return managerRuleIssues
  return []
}

export const validateTaskControl = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const schemaIssues = validateWithSchema(item, taskControlActionSchema)
  if (schemaIssues.length > 0) return schemaIssues
  if (item.type !== 'task_control') return schemaIssues
  const task = context.taskById?.get(item.task_id)
  const taskStatus = task?.status ?? context.taskStatusById?.get(item.task_id)
  const taskTarget = {
    taskId: item.task_id,
    ...(task?.title ? { taskTitle: task.title } : {}),
  }
  if (!taskStatus) return rejected(formatTaskControlNotFoundHint(taskTarget))

  if (item.action === 'pause') {
    if (taskStatus === 'paused')
      return rejected(formatTaskControlAlreadyPausedHint(taskTarget))
    if (taskStatus !== 'pending' && taskStatus !== 'running')
      return rejected(formatTaskControlAlreadyDoneHint('pause', taskTarget))
  }
  if (item.action === 'resume') {
    if (taskStatus === 'pending' || taskStatus === 'running')
      return rejected(formatTaskControlNotPausedHint(taskTarget))

    if (taskStatus !== 'paused')
      return rejected(formatTaskControlAlreadyDoneHint('resume', taskTarget))
  }
  if (item.action === 'cancel') {
    if (taskStatus === 'canceled')
      return rejected(formatTaskControlAlreadyCanceledHint(taskTarget))
    if (
      taskStatus !== 'pending' &&
      taskStatus !== 'paused' &&
      taskStatus !== 'running'
    )
      return rejected(formatTaskControlAlreadyDoneHint('cancel', taskTarget))
  }
  return []
}

export const validateRememberMemory = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const schemaIssues = validateWithSchema(item, rememberMemoryActionSchema)
  if (schemaIssues.length > 0) return schemaIssues
  if (item.type !== 'remember_memory') return schemaIssues
  return validateRememberMemoryAction(item, context)
}
