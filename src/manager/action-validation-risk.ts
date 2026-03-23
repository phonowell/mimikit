import {
  askUserChoiceSchema,
  mutateTaskSchema,
  parseAskUserChoiceAttrs,
  rememberMemorySchema,
  runTaskSchema,
  summarizeSchema,
} from './action-apply-schema.js'
import { buildTaskContractMissingHintFromAction } from './action-feedback-contract-hint.js'
import {
  formatAskUserChoiceChannelUnsupportedHint,
  formatAskUserChoiceInvalidOptionsHint,
  formatEnqueueTaskContractMissingHint,
  formatEnqueueTaskRequiresConfirmationHint,
  formatMutateTaskAlreadyCanceledHint,
  formatMutateTaskAlreadyDoneHint,
  formatMutateTaskAlreadyPausedHint,
  formatMutateTaskNotFoundHint,
  formatMutateTaskNotPausedHint,
  formatSetTaskResultSummaryTaskNotInBatchHint,
} from './action-feedback-hints.js'
import { resolveIntentEvidenceRejectionHint } from './action-intent-evidence.js'
import { parseActionAttrs } from './action-parse.js'
import {
  rejected,
  validateItemWithSchema,
  type ValidationIssue,
} from './action-validation-helpers.js'
import { validateMutateTaskGitOp } from './action-validation-mutate-task-git.js'
import { validateRememberMemoryAction } from './action-validation-remember-memory.js'
import { resolveRunTaskConfirmationRequirement } from './run-task-confirmation.js'
import {
  buildTaskContractFromAttrs,
  resolveWorkerPromptFromAttrs,
} from './task-contract.js'

import type { Parsed } from '../actions/model/spec.js'
import type {
  ManagerWakeProfile,
  Task,
  TaskPlanStatus,
  TaskStatus,
  UserInput,
} from '../types/index.js'

export type FeedbackContext = {
  taskStatusById?: Map<string, TaskStatus>
  taskById?: Map<string, Task>
  planStatusById?: Map<string, TaskPlanStatus>
  resultTaskIds?: Set<string>
  scheduleNowIso?: string
  allowAskUserChoice?: boolean
  confirmedRunTaskChoiceIds?: Set<string>
  wakeProfile?: ManagerWakeProfile
  allowedActions?: Set<string>
  inputs?: UserInput[]
  supplementalEvidenceSources?: Set<'task_result'>
}

const validateWithSchema = validateItemWithSchema

const validateHighRiskActionIntentEvidence = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const hint = resolveIntentEvidenceRejectionHint(item, context)
  return hint ? rejected(hint) : []
}

export const validateRunTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, runTaskSchema)
  if (!parsed) return validateWithSchema(item, runTaskSchema)
  const contract = buildTaskContractFromAttrs(parsed)
  const workerPrompt = resolveWorkerPromptFromAttrs(parsed)
  if (!contract) {
    return rejected(
      buildTaskContractMissingHintFromAction(item) ??
        formatEnqueueTaskContractMissingHint({
          worker_prompt: parsed.worker_prompt,
          title: parsed.title,
          cwd: parsed.cwd,
          goal: parsed.goal,
          in_scope: parsed.in_scope,
          out_of_scope: parsed.out_of_scope,
          done_when_1: parsed.done_when_1,
        }),
    )
  }
  if (!workerPrompt) return rejected(formatEnqueueTaskContractMissingHint())

  const confirmation = resolveRunTaskConfirmationRequirement({
    prompt: workerPrompt,
    title: parsed.title,
    goal: contract.goal,
    scope: contract.scope,
    acceptance: contract.acceptance,
    ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { contextRefs: contract.contextRefs } : {}),
  })
  if (context.confirmedRunTaskChoiceIds?.has(confirmation.choiceId)) return []
  if (confirmation.required)
    return rejected(formatEnqueueTaskRequiresConfirmationHint())
  return validateHighRiskActionIntentEvidence(item, context)
}

export const validateMutateTask = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, mutateTaskSchema)
  if (!parsed) return validateWithSchema(item, mutateTaskSchema)
  const { id, op, reason } = parsed
  const taskStatus = context.taskStatusById?.get(id)
  if (!taskStatus) return rejected(formatMutateTaskNotFoundHint())
  const task = context.taskById?.get(id)

  if (op === 'pause') {
    if (taskStatus !== 'pending' && taskStatus !== 'running') {
      if (taskStatus === 'paused')
        return rejected(formatMutateTaskAlreadyPausedHint())
      return rejected(formatMutateTaskAlreadyDoneHint('pause'))
    }
  } else if (op === 'resume') {
    if (taskStatus !== 'paused') {
      if (
        taskStatus === 'succeeded' ||
        taskStatus === 'failed' ||
        taskStatus === 'canceled'
      )
        return rejected(formatMutateTaskAlreadyDoneHint('resume'))
      return rejected(formatMutateTaskNotPausedHint())
    }
  } else if (op === 'cancel') {
    if (
      taskStatus !== 'pending' &&
      taskStatus !== 'paused' &&
      taskStatus !== 'running'
    ) {
      if (taskStatus === 'canceled')
        return rejected(formatMutateTaskAlreadyCanceledHint())
      return rejected(formatMutateTaskAlreadyDoneHint('cancel'))
    }
  } else {
    const issues = validateMutateTaskGitOp({ op, taskStatus, task, reason })
    if (issues.length > 0) return issues
  }

  return validateHighRiskActionIntentEvidence(item, context)
}

export const validateRememberMemory = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, rememberMemorySchema)
  if (!parsed) return validateWithSchema(item, rememberMemorySchema)
  return validateRememberMemoryAction(item, context)
}

export const validateSummarizeTaskResult = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const parsed = parseActionAttrs(item, summarizeSchema)
  if (!parsed) return validateWithSchema(item, summarizeSchema)
  const { resultTaskIds } = context
  if (!resultTaskIds) return []
  if (resultTaskIds.has(parsed.task_id)) return []
  const available = [...resultTaskIds].slice(0, 3)
  const availableHint =
    available.length > 0
      ? `当前批次可用 task_id: ${available.join(', ')}。`
      : '当前批次无可摘要的 task_result。'
  return rejected(formatSetTaskResultSummaryTaskNotInBatchHint(availableHint))
}

export const validateAskUserChoice = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  if (context.allowAskUserChoice === false)
    return rejected(formatAskUserChoiceChannelUnsupportedHint())

  const issues = validateWithSchema(item, askUserChoiceSchema)
  if (issues.length > 0) return issues
  if (!parseAskUserChoiceAttrs(item.attrs))
    return rejected(formatAskUserChoiceInvalidOptionsHint())
  return validateHighRiskActionIntentEvidence(item, context)
}
