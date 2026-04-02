import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import { formatDialogActionSourceInputMissingHint } from './action-evidence-hints.js'
import {
  rememberMemoryActionSchema,
  rememberProjectProfileActionSchema,
} from './manager-turn-schema.js'

import type { UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

type DialogEvidenceActionName = 'remember_memory' | 'remember_project_profile'

type DialogActionWithProvenance = {
  source_input_id: string
  source_quote?: string | undefined
}

const validateDialogActionIntentEvidence = <
  T extends DialogActionWithProvenance,
>(params: {
  actionName: DialogEvidenceActionName
  item: Parsed
  inputs?: UserInput[]
  parse: (item: Parsed) => { success: true; data: T } | { success: false }
}): string | undefined => {
  const parsed = params.parse(params.item)
  if (!parsed.success) return undefined
  const sourceInput = params.inputs?.find(
    (input) =>
      input.role === 'user' &&
      input.id.trim() === parsed.data.source_input_id.trim(),
  )
  if (!sourceInput)
    return formatDialogActionSourceInputMissingHint(params.actionName)
  const sourceText = normalizeInlineWhitespace(sourceInput.text)
  if (!sourceText)
    return formatDialogActionSourceInputMissingHint(params.actionName)
  return undefined
}

export const validateRememberMemoryIntentEvidence = (params: {
  item: Parsed
  inputs?: UserInput[]
}): string | undefined => {
  if (params.item.type !== 'remember_memory') return undefined
  return validateDialogActionIntentEvidence({
    actionName: 'remember_memory',
    item: params.item,
    ...(params.inputs ? { inputs: params.inputs } : {}),
    parse: (item) => rememberMemoryActionSchema.safeParse(item),
  })
}

export const validateRememberProjectProfileIntentEvidence = (params: {
  item: Parsed
  inputs?: UserInput[]
}): string | undefined => {
  if (params.item.type !== 'remember_project_profile') return undefined
  return validateDialogActionIntentEvidence({
    actionName: 'remember_project_profile',
    item: params.item,
    ...(params.inputs ? { inputs: params.inputs } : {}),
    parse: (item) => rememberProjectProfileActionSchema.safeParse(item),
  })
}
