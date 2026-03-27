import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  askUserChoiceActionSchema,
  rememberMemoryActionSchema,
  rememberProjectProfileActionSchema,
} from './manager-turn-schema.js'
import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

export const validateAskUserChoiceIntentEvidence = (params: {
  item: Parsed
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { item, inputTexts, supplementalEvidenceSources } = params
  if (item.type !== 'ask_user_choice') return undefined
  const parsed = askUserChoiceActionSchema.safeParse(item)
  if (!parsed.success) return undefined

  const candidates = [
    parsed.data.question,
    ...parsed.data.options.flatMap((option) => [option.label, option.reason]),
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
  inputs?: UserInput[]
}): 'allowed' | 'suppressed' => {
  const { item, inputs } = params
  if (item.type !== 'remember_memory') return 'allowed'
  const parsed = rememberMemoryActionSchema.safeParse(item)
  if (!parsed.success) return 'allowed'
  const sourceInput = inputs?.find(
    (input) =>
      input.role === 'user' &&
      input.id.trim() === parsed.data.source_input_id.trim(),
  )
  if (!sourceInput) return 'suppressed'
  const sourceText = normalizeInlineWhitespace(sourceInput.text)
  const content = normalizeInlineWhitespace(parsed.data.content)
  const sourceQuote = normalizeInlineWhitespace(parsed.data.source_quote)
  if (!sourceText || !content || !sourceQuote) return 'suppressed'
  if (!sourceText.includes(sourceQuote)) return 'suppressed'
  return sourceText.includes(content) ? 'allowed' : 'suppressed'
}

export const validateRememberProjectProfileIntentEvidence = (params: {
  item: Parsed
  inputs?: UserInput[]
}): 'allowed' | 'suppressed' => {
  const { item, inputs } = params
  if (item.type !== 'remember_project_profile') return 'allowed'
  const parsed = rememberProjectProfileActionSchema.safeParse(item)
  if (!parsed.success) return 'allowed'
  const sourceInput = inputs?.find(
    (input) =>
      input.role === 'user' &&
      input.id.trim() === parsed.data.source_input_id.trim(),
  )
  if (!sourceInput) return 'suppressed'
  const sourceText = normalizeInlineWhitespace(sourceInput.text)
  const content = normalizeInlineWhitespace(parsed.data.content)
  const sourceQuote = normalizeInlineWhitespace(parsed.data.source_quote)
  if (!sourceText || !content || !sourceQuote) return 'suppressed'
  if (!sourceText.includes(sourceQuote)) return 'suppressed'
  return isSupportedByInputs({
    candidates: [content],
    combinedCandidate: content,
    inputs: [sourceText],
  })
    ? 'allowed'
    : 'suppressed'
}
