import {
  scoreTextOverlap,
  tokenizeSearchText,
} from '../../foundation/shared/text-search.js'
import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  formatEnqueueTaskIntentEvidenceHint,
  formatSetPlanIntentEvidenceHint,
  formatTaskControlIntentEvidenceHint,
} from './action-evidence-hints.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence-source.js'
import type { HistoryMessage, UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const toEvidenceLabel = (source: SupplementalEvidenceSource): string => source
const MAX_RECENT_USER_INTENT_TEXTS = 24
const SHORT_CANDIDATE_THRESHOLD = 0.8
const MEDIUM_CANDIDATE_THRESHOLD = 0.6
const DEFAULT_CANDIDATE_THRESHOLD = 0.45

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
  if (params.actionName === 'task_control') {
    return formatTaskControlIntentEvidenceHint({
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

const resolveCandidateThreshold = (tokenCount: number): number =>
  tokenCount <= 2
    ? SHORT_CANDIDATE_THRESHOLD
    : tokenCount <= 4
      ? MEDIUM_CANDIDATE_THRESHOLD
      : DEFAULT_CANDIDATE_THRESHOLD

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
    const tokenCount = tokenizeSearchText(candidate).length
    if (tokenCount === 0) continue
    const threshold = resolveCandidateThreshold(tokenCount)
    if (scoreTextOverlap(candidate, inputText) >= threshold) return true
  }

  const combinedCandidate = normalizeInlineWhitespace(
    params.combinedCandidate ?? '',
  )
  if (!combinedCandidate) return false
  return scoreTextOverlap(combinedCandidate, inputText) >= 0.35
}
