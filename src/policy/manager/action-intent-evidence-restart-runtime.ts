import { restartRuntimeSchema } from './action-apply-schema.js'
import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import { parseActionAttrs } from './action-parse.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { Parsed } from '../actions/model/spec.js'

export const validateRestartRuntimeIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { item, inputTexts, supplementalEvidenceSources } = params
  const parsed = parseActionAttrs(item, restartRuntimeSchema)
  if (!parsed) return undefined
  if (
    isSupportedByInputs({
      candidates: [parsed.reason],
      combinedCandidate: parsed.reason,
      inputs: inputTexts,
    })
  )
    return undefined
  return buildMissingIntentEvidenceHint({
    actionName: item.name,
    evidenceSources: supplementalEvidenceSources,
  })
}
