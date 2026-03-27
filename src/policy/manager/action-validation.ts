import { resolveTaskGitLifecycle } from '../../work/shared/task-git-lifecycle.js'

import { formatEnqueueTaskContractMissingHint } from './action-feedback-hints.js'
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
  return validateHighRiskActionIntentEvidence(item, context)
}

export const validateTaskControl = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const schemaIssues = validateWithSchema(item, taskControlActionSchema)
  if (schemaIssues.length > 0) return schemaIssues
  if (item.type !== 'task_control') return schemaIssues
  const taskStatus = context.taskStatusById?.get(item.task_id)
  if (!taskStatus) return rejected('task_control 执行失败：未找到 task ID。')
  if (item.action !== 'resume' && item.instructions.length > 0) {
    return rejected(
      'task_control 执行失败：只有 `action="resume"` 才允许附带 `instructions[]`。',
    )
  }
  if (item.action === 'pause') {
    if (taskStatus === 'paused')
      return rejected('task_control 执行失败：任务已是 paused 状态。')
    if (taskStatus !== 'pending' && taskStatus !== 'running')
      return rejected('task_control 执行失败：任务已完成，无法 pause。')
  }
  if (item.action === 'resume') {
    if (taskStatus === 'pending' || taskStatus === 'running') {
      return rejected(
        'task_control 执行失败：任务当前不是 paused 状态，无法 resume。',
      )
    }
    if (taskStatus !== 'paused')
      return rejected('task_control 执行失败：任务已完成，无法 resume。')
  }
  if (item.action === 'cancel') {
    if (taskStatus === 'canceled')
      return rejected('task_control 执行失败：任务已是 canceled 状态。')
    if (
      taskStatus !== 'pending' &&
      taskStatus !== 'paused' &&
      taskStatus !== 'running'
    )
      return rejected('task_control 执行失败：任务已完成，无法 cancel。')
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
  if (!taskStatus) return rejected('record_task_git 执行失败：未找到 task ID。')
  const task = context.taskById?.get(item.task_id)
  if (
    taskStatus !== 'succeeded' &&
    taskStatus !== 'failed' &&
    taskStatus !== 'canceled'
  ) {
    return rejected(
      `record_task_git 执行失败：任务尚未完成，无法写入 ${item.state}。`,
    )
  }
  if (task && !task.git)
    return rejected('record_task_git 执行失败：任务没有 git 执行上下文。')
  const lifecycle = task ? resolveTaskGitLifecycle(task) : undefined
  if (item.state === 'merged' && !lifecycle?.review.passed) {
    return rejected(
      'record_task_git 执行失败：任务尚未记录 review passed，无法写入 merged。',
    )
  }
  if (item.state === 'cleaned' && !lifecycle?.merged) {
    return rejected(
      'record_task_git 执行失败：任务尚未记录 merged，无法写入 cleaned。',
    )
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
