import {
  buildMissingIntentEvidenceHint,
  collectUserIntentTexts,
} from './action-intent-evidence-match.js'
import {
  validateAskUserChoiceIntentEvidence,
  validateEnqueueTaskIntentEvidence,
  validateMutateTaskIntentEvidence,
  validateRememberMemoryIntentEvidence,
} from './action-intent-evidence-rules.js'

import type { Parsed } from '../actions/model/spec.js'
import type { Task, UserInput } from '../types/index.js'

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
  'ask_user_choice',
  'remember_memory',
])

export const resolveIntentEvidenceRejectionHint = (
  item: Parsed,
  context: IntentEvidenceContext,
): string | undefined => {
  if (!INTENT_EVIDENCE_REQUIRED_ACTIONS.has(item.name)) return undefined
  if (!context.supplementalEvidenceSources?.size) return undefined

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
      supplementalEvidenceSources: context.supplementalEvidenceSources,
    })
  }
  if (item.name === 'mutate_task') {
    return validateMutateTaskIntentEvidence({
      item,
      inputTexts,
      ...(context.inputs ? { inputs: context.inputs } : {}),
      ...(context.taskById ? { taskById: context.taskById } : {}),
      supplementalEvidenceSources: context.supplementalEvidenceSources,
    })
  }
  if (item.name === 'ask_user_choice') {
    return validateAskUserChoiceIntentEvidence({
      item,
      inputTexts,
      supplementalEvidenceSources: context.supplementalEvidenceSources,
    })
  }
  if (item.name === 'remember_memory') {
    return validateRememberMemoryIntentEvidence({
      item,
      inputTexts,
      supplementalEvidenceSources: context.supplementalEvidenceSources,
    })
  }
  return undefined
}
