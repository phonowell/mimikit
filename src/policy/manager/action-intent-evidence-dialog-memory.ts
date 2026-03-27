import { rememberMemorySchema } from './action-apply-schema.js'
import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { Parsed } from '../actions/model/spec.js'

export const validateAskUserChoiceIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { item, inputTexts, supplementalEvidenceSources } = params
  if (item.type !== 'ask_user_choice') return undefined

  const candidates = [
    item.question,
    ...item.options.flatMap((option) => [option.label, option.reason]),
  ]
  if (
    isSupportedByInputs({
      candidates,
      combinedCandidate: candidates.join('\n'),
      inputs: inputTexts,
    })
  )
    return undefined

  return buildMissingIntentEvidenceHint({
    actionName: item.type,
    evidenceSources: supplementalEvidenceSources,
  })
}

export const validateRememberMemoryIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  recentUserIntentTexts?: string[]
}): 'allowed' | 'suppressed' => {
  const { item, inputTexts, recentUserIntentTexts } = params
  if (item.type !== 'remember_memory') return 'allowed'
  const parsed = rememberMemorySchema.safeParse({ content: item.content })
  if (!parsed.success) return 'allowed'
  if (
    isSupportedByInputs({
      candidates: [parsed.data.content],
      combinedCandidate: parsed.data.content,
      inputs: inputTexts,
    })
  )
    return 'allowed'

  const repeatedSupportCount = (recentUserIntentTexts ?? []).reduce(
    (count, text) =>
      count +
      (isSupportedByInputs({
        candidates: [parsed.data.content],
        combinedCandidate: parsed.data.content,
        inputs: [text],
      })
        ? 1
        : 0),
    0,
  )
  return repeatedSupportCount >= 2 ? 'allowed' : 'suppressed'
}
