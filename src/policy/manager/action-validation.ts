import { resolveTaskGitLifecycle } from '../../work/shared/task-git-lifecycle.js'

import {
  formatEnqueueTaskContractMissingHint,
  formatRecordTaskGitMergeRequiredHint,
  formatRecordTaskGitNotDoneHint,
  formatRecordTaskGitNotFoundHint,
  formatRecordTaskGitNotGitHint,
  formatRecordTaskGitReviewRequiredHint,
  formatTaskControlAlreadyCanceledHint,
  formatTaskControlAlreadyDoneHint,
  formatTaskControlAlreadyPausedHint,
  formatTaskControlNotFoundHint,
  formatTaskControlNotPausedHint,
} from './action-feedback-hints.js'
import { validateRecordTaskGitIntentEvidence } from './action-intent-evidence-dialog-memory.js'
import { validateEnqueueTaskManagerRules } from './action-validation-enqueue-task.js'
import { rejected, type ValidationIssue } from './action-validation-helpers.js'
import {
  validateDeletePlan,
  validateSetPlan,
} from './action-validation-plan.js'
import { validateRememberMemoryAction } from './action-validation-remember-memory.js'
import { validateRememberProjectProfileAction } from './action-validation-remember-project-profile.js'
import {
  validateHighRiskActionIntentEvidence,
  validateWithSchema,
} from './action-validation-shared.js'
import {
  enqueueTaskActionSchema,
  recordTaskGitActionSchema,
  rememberMemoryActionSchema,
  rememberProjectProfileActionSchema,
  taskControlActionSchema,
} from './manager-turn-schema.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from './task-contract.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { Parsed } from '../actions/model/spec.js'

export type { FeedbackContext } from './action-validation-context.js'
export type { ValidationIssue } from './action-validation-helpers.js'
export { validateDeletePlan, validateSetPlan, validateWithSchema }

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
  return validateHighRiskActionIntentEvidence(item, context)
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
  return validateHighRiskActionIntentEvidence(item, context)
}

export const validateRecordTaskGit = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const schemaIssues = validateWithSchema(item, recordTaskGitActionSchema)
  if (schemaIssues.length > 0) return schemaIssues
  if (item.type !== 'record_task_git') return schemaIssues
  const taskStatus = context.taskStatusById?.get(item.task_id)
  if (!taskStatus) return rejected(formatRecordTaskGitNotFoundHint())
  const task = context.taskById?.get(item.task_id)
  if (
    taskStatus !== 'succeeded' &&
    taskStatus !== 'failed' &&
    taskStatus !== 'canceled'
  )
    return rejected(formatRecordTaskGitNotDoneHint(item.state))

  if (task && !task.git)
    return rejected(formatRecordTaskGitNotGitHint(item.state))
  const lifecycle = task ? resolveTaskGitLifecycle(task) : undefined
  if (item.state === 'merged' && !lifecycle?.review.passed)
    return rejected(formatRecordTaskGitReviewRequiredHint())

  if (item.state === 'cleaned' && !lifecycle?.merged)
    return rejected(formatRecordTaskGitMergeRequiredHint())

  const evidenceHint = validateRecordTaskGitIntentEvidence({
    item,
    ...(context.inputs ? { inputs: context.inputs } : {}),
    ...(context.taskById ? { taskById: context.taskById } : {}),
  })
  if (evidenceHint) {
    return rejected(evidenceHint, {
      code: 'intent_evidence_missing',
    })
  }
  return validateHighRiskActionIntentEvidence(item, context)
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

export const validateRememberProjectProfile = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const schemaIssues = validateWithSchema(
    item,
    rememberProjectProfileActionSchema,
  )
  if (schemaIssues.length > 0) return schemaIssues
  if (item.type !== 'remember_project_profile') return schemaIssues
  return validateRememberProjectProfileAction(item, context)
}
