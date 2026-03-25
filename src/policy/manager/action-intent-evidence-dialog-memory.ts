import {
  askUserChoiceSchema,
  parseAskUserChoiceAttrs,
  rememberMemorySchema,
} from './action-apply-schema.js'
import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import { parseActionAttrs } from './action-parse.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { Parsed } from '../actions/model/spec.js'

export const validateAskUserChoiceIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { item, inputTexts, supplementalEvidenceSources } = params
  if (!askUserChoiceSchema.safeParse(item.attrs).success) return undefined
  const parsed = parseAskUserChoiceAttrs(item.attrs)
  if (!parsed) return undefined

  const candidates = [
    parsed.question,
    ...parsed.options.flatMap((option) => [option.label, option.reason]),
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
    actionName: item.name,
    evidenceSources: supplementalEvidenceSources,
  })
}

export const validateRememberMemoryIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { item, inputTexts, supplementalEvidenceSources } = params
  const parsed = parseActionAttrs(item, rememberMemorySchema)
  if (!parsed) return undefined
  if (
    isSupportedByInputs({
      candidates: [parsed.content],
      combinedCandidate: parsed.content,
      inputs: inputTexts,
    })
  )
    return undefined

  return buildMissingIntentEvidenceHint({
    actionName: item.name,
    evidenceSources: supplementalEvidenceSources,
  })
}
