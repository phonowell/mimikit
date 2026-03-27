import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import {
  askUserChoiceActionSchema,
  rememberMemoryActionSchema,
  rememberProjectProfileActionSchema,
} from './manager-turn-schema.js'

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
}): string | undefined => {
  const { item, inputs } = params
  if (item.type !== 'remember_memory') return undefined
  const parsed = rememberMemoryActionSchema.safeParse(item)
  if (!parsed.success) return undefined
  const sourceInput = inputs?.find(
    (input) =>
      input.role === 'user' &&
      input.id.trim() === parsed.data.source_input_id.trim(),
  )
  if (!sourceInput)
    return 'remember_memory 执行失败：source_input_id 必须命中当前轮真实用户输入。'
  const sourceText = normalizeInlineWhitespace(sourceInput.text)
  const sourceQuote = normalizeInlineWhitespace(parsed.data.source_quote)
  if (!sourceText || !sourceQuote)
    return 'remember_memory 执行失败：source_quote 必须命中当前轮真实用户输入。'
  if (!sourceText.includes(sourceQuote))
    return 'remember_memory 执行失败：source_quote 必须是当前轮用户输入中的原文片段。'
  return undefined
}

export const validateRememberProjectProfileIntentEvidence = (params: {
  item: Parsed
  inputs?: UserInput[]
}): string | undefined => {
  const { item, inputs } = params
  if (item.type !== 'remember_project_profile') return undefined
  const parsed = rememberProjectProfileActionSchema.safeParse(item)
  if (!parsed.success) return undefined
  const sourceInput = inputs?.find(
    (input) =>
      input.role === 'user' &&
      input.id.trim() === parsed.data.source_input_id.trim(),
  )
  if (!sourceInput)
    return 'remember_project_profile 执行失败：source_input_id 必须命中当前轮真实用户输入。'
  const sourceText = normalizeInlineWhitespace(sourceInput.text)
  const sourceQuote = normalizeInlineWhitespace(parsed.data.source_quote)
  if (!sourceText || !sourceQuote)
    return 'remember_project_profile 执行失败：source_quote 必须命中当前轮真实用户输入。'
  if (!sourceText.includes(sourceQuote))
    return 'remember_project_profile 执行失败：source_quote 必须是当前轮用户输入中的原文片段。'
  return undefined
}
