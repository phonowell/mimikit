import {
  buildMissingIntentEvidenceHint,
  collectUserIntentTexts,
} from './action-intent-evidence-match.js'
import {
  validateAskUserChoiceIntentEvidence,
  validateEnqueueTaskIntentEvidence,
  validateMutateTaskIntentEvidence,
  validateRememberMemoryIntentEvidence,
  validateRestartRuntimeIntentEvidence,
} from './action-intent-evidence-rules.js'

import type { Task, UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

export type SupplementalEvidenceSource = 'task_result'

type IntentEvidenceContext = {
  inputs?: UserInput[]
  taskById?: Map<string, Task>
  confirmedRunTaskChoiceIds?: Set<string>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}

const INTENT_EVIDENCE_REQUIRED_ACTIONS = new Set([
  'enqueue_task',
  'mutate_task',
  'restart_runtime',
  'ask_user_choice',
  'remember_memory',
])

const requiresDirectUserEvidence = (actionName: Parsed['name']): boolean =>
  actionName === 'restart_runtime'

export const resolveIntentEvidenceRejectionHint = (
  item: Parsed,
  context: IntentEvidenceContext,
): string | undefined => {
  if (!INTENT_EVIDENCE_REQUIRED_ACTIONS.has(item.name)) return undefined
  if (
    !requiresDirectUserEvidence(item.name) &&
    !context.supplementalEvidenceSources?.size
  )
    return undefined

  const inputTexts = collectUserIntentTexts(context.inputs)
  if (inputTexts.length === 0) {
    return buildMissingIntentEvidenceHint({
      actionName: item.name,
      evidenceSources: context.supplementalEvidenceSources,
    })
  }

  if (item.name === 'enqueue_task') {
    return validateEnqueueTaskIntentEvidence({
      item,
      inputTexts,
      ...(context.confirmedRunTaskChoiceIds
        ? { confirmedRunTaskChoiceIds: context.confirmedRunTaskChoiceIds }
        : {}),
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.name === 'mutate_task') {
    return validateMutateTaskIntentEvidence({
      item,
      inputTexts,
      ...(context.inputs ? { inputs: context.inputs } : {}),
      ...(context.taskById ? { taskById: context.taskById } : {}),
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.name === 'restart_runtime') {
    return validateRestartRuntimeIntentEvidence({
      item,
      inputTexts,
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.name === 'ask_user_choice') {
    return validateAskUserChoiceIntentEvidence({
      item,
      inputTexts,
      ...(context.supplementalEvidenceSources
        ? { supplementalEvidenceSources: context.supplementalEvidenceSources }
        : {}),
    })
  }
  if (item.name === 'remember_memory') {
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
