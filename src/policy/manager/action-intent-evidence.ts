import {
  validateRememberMemoryIntentEvidence,
  validateRememberProjectProfileIntentEvidence,
} from './action-intent-evidence-dialog-memory.js'
import {
  buildMissingIntentEvidenceHint,
  collectUserIntentTexts,
} from './action-intent-evidence-match.js'
import {
  resolveDeletePlanIntentEvidenceHint,
  resolveTaskControlIntentEvidenceHint,
} from './action-intent-evidence-object-control.js'
import {
  resolveEnqueueTaskIntentEvidenceHint,
  resolveSetPlanIntentEvidenceHint,
} from './action-intent-evidence-write-actions.js'

import type { FeedbackContext } from './action-validation-context.js'
import type { Parsed } from '../actions/model/spec.js'

const requiresIntentEvidence = (item: Parsed): boolean => {
  if (item.type === 'delete_plan') return true
  if (item.type === 'remember_memory') return true
  if (item.type === 'remember_project_profile') return true
  if (item.type === 'enqueue_task') return item.task.mode === 'write'
  if (item.type === 'set_plan') return item.plan.task.mode === 'write'
  if (item.type === 'task_control')
    return item.action === 'pause' || item.action === 'cancel'
  return false
}

export const resolveIntentEvidenceRejectionHint = (
  item: Parsed,
  context: Pick<
    FeedbackContext,
    | 'inputs'
    | 'taskById'
    | 'planById'
    | 'resultTaskIds'
    | 'defaultFocusId'
    | 'supplementalEvidenceSources'
  >,
): string | undefined => {
  if (!requiresIntentEvidence(item)) return undefined

  const inputTexts = collectUserIntentTexts(context.inputs)
  if (inputTexts.length === 0 && item.type !== 'enqueue_task') {
    return buildMissingIntentEvidenceHint({
      actionName: item.type,
      evidenceSources: context.supplementalEvidenceSources,
    })
  }

  if (item.type === 'enqueue_task') {
    return resolveEnqueueTaskIntentEvidenceHint({
      item,
      inputTexts,
      ...(context.taskById ? { taskById: context.taskById } : {}),
      ...(context.planById ? { planById: context.planById } : {}),
      ...(context.resultTaskIds
        ? { resultTaskIds: context.resultTaskIds }
        : {}),
      ...(context.defaultFocusId
        ? { defaultFocusId: context.defaultFocusId }
        : {}),
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'task_control') {
    return resolveTaskControlIntentEvidenceHint({
      item,
      inputTexts,
      ...(context.taskById ? { taskById: context.taskById } : {}),
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'set_plan') {
    return resolveSetPlanIntentEvidenceHint({
      item,
      inputTexts,
      ...(context.planById ? { planById: context.planById } : {}),
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'delete_plan') {
    return resolveDeletePlanIntentEvidenceHint({
      item,
      inputTexts,
      ...(context.planById ? { planById: context.planById } : {}),
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'remember_memory') {
    return validateRememberMemoryIntentEvidence({
      item,
      ...(context.inputs ? { inputs: context.inputs } : {}),
    })
  }
  if (item.type === 'remember_project_profile') {
    return validateRememberProjectProfileIntentEvidence({
      item,
      ...(context.inputs ? { inputs: context.inputs } : {}),
    })
  }
  return undefined
}
