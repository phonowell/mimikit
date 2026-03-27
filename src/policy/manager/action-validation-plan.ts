import {
  formatEnqueueTaskContractMissingHint,
  formatPlanNotFoundHint,
  formatSetPlanDoneForbiddenHint,
} from './action-feedback-hints.js'
import {
  rejected,
  validateScheduledAtNotPast,
  type ValidationIssue,
} from './action-validation-helpers.js'
import {
  resolveScheduleNowOption,
  validateHighRiskActionIntentEvidence,
  validateWithSchema,
} from './action-validation-shared.js'
import {
  deletePlanActionSchema,
  setPlanActionSchema,
} from './manager-turn-schema.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from './task-contract.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { Parsed } from '../actions/model/spec.js'

export const validateSetPlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const schemaIssues = validateWithSchema(item, setPlanActionSchema)
  if (schemaIssues.length > 0) return schemaIssues
  if (item.type !== 'set_plan') return schemaIssues
  if (
    item.plan.trigger.type === 'scheduled_at' &&
    item.plan.trigger.scheduled_at.trim()
  ) {
    const issues = validateScheduledAtNotPast({
      action: 'set_plan',
      scheduledAt: item.plan.trigger.scheduled_at,
      ...resolveScheduleNowOption(context),
    })
    if (issues.length > 0) return issues
  }
  const taskContract = buildTaskContractFromDraft(item.plan.task)
  const taskPrompt = resolveWorkerPromptFromDraft(item.plan.task)
  if (!taskContract || !taskPrompt) {
    return rejected(formatEnqueueTaskContractMissingHint(), {
      code: 'task_contract_missing',
    })
  }
  if (item.plan_id !== null) {
    const status = context.planStatusById?.get(item.plan_id)
    if (!status) return rejected(formatPlanNotFoundHint('set_plan'))
    if (status === 'done') return rejected(formatSetPlanDoneForbiddenHint())
  }
  return validateHighRiskActionIntentEvidence(item, context)
}

export const validateDeletePlan = (
  item: Parsed,
  context: FeedbackContext,
): ValidationIssue[] => {
  const schemaIssues = validateWithSchema(item, deletePlanActionSchema)
  if (schemaIssues.length > 0) return schemaIssues
  if (item.type !== 'delete_plan') return schemaIssues
  const status = context.planStatusById?.get(item.plan_id)
  if (!status) return rejected(formatPlanNotFoundHint('delete_plan'))
  return validateHighRiskActionIntentEvidence(item, context)
}
