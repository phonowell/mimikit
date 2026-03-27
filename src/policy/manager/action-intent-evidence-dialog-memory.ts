import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  rememberMemoryActionSchema,
  rememberProjectProfileActionSchema,
} from './manager-turn-schema.js'

import type { UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

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
