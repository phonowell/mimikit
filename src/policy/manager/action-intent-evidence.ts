import {
  validateAskUserChoiceIntentEvidence,
  validateRememberMemoryIntentEvidence,
} from './action-intent-evidence-dialog-memory.js'
import {
  buildMissingIntentEvidenceHint,
  collectUserIntentTexts,
} from './action-intent-evidence-match.js'
import {
  validateEnqueueTaskIntentEvidence,
  validateRecordTaskGitIntentEvidence,
  validateSetPlanIntentEvidence,
  validateTaskControlIntentEvidence,
} from './action-intent-evidence-rules.js'

import type { Task, UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

export type SupplementalEvidenceSource = 'task_result'

type IntentEvidenceContext = {
  inputs?: UserInput[]
  taskById?: Map<string, Task>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
  currentActions?: Parsed[]
  defaultFocusId?: string
}

const INTENT_EVIDENCE_REQUIRED_ACTIONS = new Set([
  'enqueue_task',
  'task_control',
  'record_task_git',
  'set_plan',
  'delete_plan',
  'ask_user_choice',
  'remember_memory',
])

const requiresDirectUserEvidence = (actionName: Parsed['type']): boolean =>
  actionName === 'delete_plan'

export const resolveIntentEvidenceRejectionHint = (
  item: Parsed,
  context: IntentEvidenceContext,
): string | undefined => {
  if (!INTENT_EVIDENCE_REQUIRED_ACTIONS.has(item.type)) return undefined
  if (
    !requiresDirectUserEvidence(item.type) &&
    !context.supplementalEvidenceSources?.size
  )
    return undefined

  const inputTexts = collectUserIntentTexts(context.inputs)
  if (inputTexts.length === 0) {
    return buildMissingIntentEvidenceHint({
      actionName: item.type,
      evidenceSources: context.supplementalEvidenceSources,
    })
  }

  if (item.type === 'enqueue_task') {
    return validateEnqueueTaskIntentEvidence({
      item,
      inputTexts,
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'task_control') {
    return validateTaskControlIntentEvidence({
      item,
      inputTexts,
      ...(context.taskById ? { taskById: context.taskById } : {}),
      ...(context.currentActions
        ? { currentActions: context.currentActions }
        : {}),
      ...(context.defaultFocusId
        ? { defaultFocusId: context.defaultFocusId }
        : {}),
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'record_task_git') {
    return validateRecordTaskGitIntentEvidence({
      item,
      inputTexts,
      ...(context.taskById ? { taskById: context.taskById } : {}),
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'set_plan') {
    return validateSetPlanIntentEvidence({
      item,
      inputTexts,
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'ask_user_choice') {
    return validateAskUserChoiceIntentEvidence({
      item,
      inputTexts,
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.type === 'remember_memory') {
    return validateRememberMemoryIntentEvidence({
      item,
      inputTexts,
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  return undefined
}
