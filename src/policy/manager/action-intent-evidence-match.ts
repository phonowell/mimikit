import {
  scoreTextOverlap,
  tokenizeSearchText,
} from '../../foundation/shared/text-search.js'
import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  formatDeletePlanIntentEvidenceHint,
  formatEnqueueTaskIntentEvidenceHint,
  formatSetPlanIntentEvidenceHint,
  formatTaskControlIntentEvidenceHint,
} from './action-evidence-hints.js'
import { scoreSemanticAlignment } from './authorization-semantics.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence-source.js'
import type { UserInput } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const toEvidenceLabel = (source: SupplementalEvidenceSource): string => source
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
  if (params.actionName === 'delete_plan')
    return formatDeletePlanIntentEvidenceHint(evidenceSources)
  if (params.actionName === 'set_plan')
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

const resolveCandidateThreshold = (tokenCount: number): number =>
  tokenCount <= 2
    ? SHORT_CANDIDATE_THRESHOLD
    : tokenCount <= 4
      ? MEDIUM_CANDIDATE_THRESHOLD
      : DEFAULT_CANDIDATE_THRESHOLD

const normalizeText = (value: string | undefined): string =>
  normalizeInlineWhitespace(value ?? '')

const scoreCandidateAgainstInput = (
  candidate: string,
  inputText: string,
): number => {
  const normalizedCandidate = normalizeText(candidate)
  if (!normalizedCandidate) return 0
  const overlap = Math.max(
    scoreTextOverlap(normalizedCandidate, inputText),
    scoreTextOverlap(inputText, normalizedCandidate),
  )
  if (inputText.includes(normalizedCandidate)) return Math.max(overlap, 1)
  return Math.max(overlap, scoreSemanticAlignment(normalizedCandidate, inputText))
}

export const buildAmbiguousWorklineHint = (candidateRefs: string[]): string => {
  const refs = candidateRefs.filter(Boolean).slice(0, 3)
  const refText = refs.length > 0 ? `（候选：${refs.join('；')}）` : ''
  return `enqueue_task 执行前还缺一个最小确认：当前可继续的工作线不止一条，请直接说明继续哪一条工作线${refText}。`
}

export const isSupportedByInputs = (params: {
  candidates: string[]
  combinedCandidate?: string
  inputs: string[]
}): boolean => {
  const inputText = params.inputs.join('\n')
  if (!inputText) return false

  for (const rawCandidate of params.candidates) {
    const candidate = normalizeText(rawCandidate)
    if (!candidate) continue
    const tokenCount = tokenizeSearchText(candidate).length
    if (tokenCount === 0) continue
    const threshold = resolveCandidateThreshold(tokenCount)
    if (scoreCandidateAgainstInput(candidate, inputText) >= threshold) return true
  }

  const combinedCandidate = normalizeText(params.combinedCandidate)
  if (!combinedCandidate) return false
  return scoreCandidateAgainstInput(combinedCandidate, inputText) >= 0.35
}
