import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  formatDialogActionSourceInputMissingHint,
  formatDialogActionSourceQuoteMissingHint,
  formatDialogActionSourceQuoteUnanchoredHint,
  formatRecordTaskGitIntentEvidenceHint,
  formatRecordTaskGitSourceQuoteActionMissingHint,
  resolveRecordTaskGitRequiredActionLabel,
} from './action-evidence-hints.js'
import {
  formatEvidenceSources,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import {
  recordTaskGitActionSchema,
  rememberMemoryActionSchema,
  rememberProjectProfileActionSchema,
} from './manager-turn-schema.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { Task, UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

type DialogEvidenceActionName =
  | 'remember_memory'
  | 'remember_project_profile'
  | 'record_task_git'

type DialogActionWithProvenance = {
  source_input_id: string
  source_quote: string
}

const normalizeQuoteToken = (value: string): string =>
  normalizeInlineWhitespace(value).toLowerCase()

const resolveRecordTaskGitStateToken = (
  state: 'review_passed' | 'merged' | 'cleaned',
): string => state.replace(/_/g, ' ')

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
  const sourceQuote = normalizeInlineWhitespace(parsed.data.source_quote)
  if (!sourceText || !sourceQuote)
    return formatDialogActionSourceQuoteMissingHint(params.actionName)
  if (!sourceText.includes(sourceQuote))
    return formatDialogActionSourceQuoteUnanchoredHint(params.actionName)
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

export const validateRecordTaskGitIntentEvidence = (params: {
  item: Parsed
  inputs?: UserInput[]
  taskById?: Map<string, Task>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  if (params.item.type !== 'record_task_git') return undefined
  const hint = validateDialogActionIntentEvidence({
    actionName: 'record_task_git',
    item: params.item,
    ...(params.inputs ? { inputs: params.inputs } : {}),
    parse: (item) => recordTaskGitActionSchema.safeParse(item),
  })
  if (hint) return hint

  const parsed = recordTaskGitActionSchema.safeParse(params.item)
  if (!parsed.success) return undefined
  const task = params.taskById?.get(parsed.data.task_id)
  const candidates = [parsed.data.task_id]
  if (task?.title.trim()) candidates.push(task.title)
  const inputTexts = params.inputs
    ?.filter((input) => input.role === 'user')
    .map((input) => normalizeInlineWhitespace(input.text))
    .filter((text) => text.length > 0)
  if (
    !inputTexts?.length ||
    !isSupportedByInputs({
      candidates,
      combinedCandidate: task?.title.trim()
        ? `${parsed.data.task_id} / ${task.title.trim()}`
        : parsed.data.task_id,
      inputs: inputTexts,
    })
  ) {
    return formatRecordTaskGitIntentEvidenceHint({
      evidenceSources: formatEvidenceSources(
        params.supplementalEvidenceSources,
      ),
      taskRef: task?.title.trim()
        ? `${parsed.data.task_id} / ${task.title.trim()}`
        : parsed.data.task_id,
      requiredAction: resolveRecordTaskGitRequiredActionLabel(
        parsed.data.state,
      ),
    })
  }
  const normalizedQuote = normalizeQuoteToken(parsed.data.source_quote)
  const requiredAction = resolveRecordTaskGitRequiredActionLabel(
    parsed.data.state,
  )
  const normalizedRequiredAction = normalizeQuoteToken(requiredAction)
  const normalizedStateToken = normalizeQuoteToken(
    resolveRecordTaskGitStateToken(parsed.data.state),
  )
  if (
    !normalizedQuote.includes(normalizedRequiredAction) &&
    !normalizedQuote.includes(normalizedStateToken)
  )
    return formatRecordTaskGitSourceQuoteActionMissingHint(parsed.data.state)
  return undefined
}
