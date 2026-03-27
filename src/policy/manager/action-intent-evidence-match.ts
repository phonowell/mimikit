import {
  scoreTextOverlap,
  tokenizeSearchText,
} from '../../foundation/shared/text-search.js'
import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  formatEnqueueTaskIntentEvidenceHint,
  formatRecordTaskGitIntentEvidenceHint,
  formatSetPlanIntentEvidenceHint,
  formatTaskControlIntentEvidenceHint,
} from './action-evidence-hints.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { HistoryMessage, UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const toEvidenceLabel = (source: SupplementalEvidenceSource): string => source
const MAX_RECENT_USER_INTENT_TEXTS = 24

export const formatEvidenceSources = (
  sources: Set<SupplementalEvidenceSource> | undefined,
): string => {
  const labels = [...(sources ?? [])].map(toEvidenceLabel)
  return labels.length > 0 ? labels.join(' / ') : '补充上下文'
}

export const buildMissingIntentEvidenceHint = (params: {
  actionName: Parsed['type']
  evidenceSources: Set<SupplementalEvidenceSource> | undefined
  taskRef?: string
}): string => {
  const evidenceSources = formatEvidenceSources(params.evidenceSources)
  if (
    params.actionName === 'task_control' ||
    params.actionName === 'record_task_git'
  ) {
    const renderHint =
      params.actionName === 'task_control'
        ? formatTaskControlIntentEvidenceHint
        : formatRecordTaskGitIntentEvidenceHint
    return renderHint({
      evidenceSources,
      taskRef: params.taskRef ?? '当前目标 task',
    })
  }
  if (params.actionName === 'set_plan' || params.actionName === 'delete_plan')
    return formatSetPlanIntentEvidenceHint(evidenceSources)
  return formatEnqueueTaskIntentEvidenceHint(evidenceSources)
}

export const collectUserIntentTexts = (
  inputs: UserInput[] | undefined,
): string[] => {
  if (!inputs || inputs.length === 0) return []
  const texts: string[] = []
  for (const input of inputs) {
    const text = normalizeInlineWhitespace(input.text)
    if (!text) continue
    if (input.role === 'user') {
      texts.push(text)
      continue
    }
  }
  return texts
}

export const collectHistoricalUserIntentTexts = (
  history: HistoryMessage[] | undefined,
): string[] => {
  if (!history || history.length === 0) return []
  const texts: string[] = []
  for (const item of history) {
    const text = normalizeInlineWhitespace(item.text)
    if (!text) continue
    if (item.role === 'user') {
      texts.push(text)
      continue
    }
  }
  return texts.slice(Math.max(0, texts.length - MAX_RECENT_USER_INTENT_TEXTS))
}

const hasDirectTextMatch = (candidate: string, haystack: string): boolean => {
  const left = normalizeInlineWhitespace(candidate).toLowerCase()
  const right = normalizeInlineWhitespace(haystack).toLowerCase()
  if (!left || !right) return false
  return right.includes(left)
}

export const isSupportedByInputs = (params: {
  candidates: string[]
  combinedCandidate?: string
  inputs: string[]
}): boolean => {
  const inputText = params.inputs.join('\n')
  if (!inputText) return false

  for (const rawCandidate of params.candidates) {
    const candidate = normalizeInlineWhitespace(rawCandidate)
    if (!candidate) continue
    if (params.inputs.some((input) => hasDirectTextMatch(candidate, input)))
      return true
    const tokenCount = tokenizeSearchText(candidate).length
    if (tokenCount === 0) continue
    const threshold = tokenCount <= 2 ? 0.8 : 0.45
    if (scoreTextOverlap(candidate, inputText) >= threshold) return true
  }

  const combinedCandidate = normalizeInlineWhitespace(
    params.combinedCandidate ?? '',
  )
  if (!combinedCandidate) return false
  return scoreTextOverlap(combinedCandidate, inputText) >= 0.35
}
