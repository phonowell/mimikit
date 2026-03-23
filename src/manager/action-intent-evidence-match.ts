import { resolveSystemEvent } from '../shared/system-event.js'
import { scoreTextOverlap, tokenizeSearchText } from '../shared/text-search.js'
import { normalizeInlineWhitespace } from '../shared/text.js'

import {
  formatAskUserChoiceIntentEvidenceHint,
  formatEnqueueTaskIntentEvidenceHint,
  formatMutateTaskIntentEvidenceHint,
  formatRememberMemoryIntentEvidenceHint,
} from './action-evidence-hints.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { Parsed } from '../actions/model/spec.js'
import type { Task, UserInput } from '../types/index.js'

const toEvidenceLabel = (source: SupplementalEvidenceSource): string => source

export const formatEvidenceSources = (
  sources: Set<SupplementalEvidenceSource> | undefined,
): string => {
  const labels = [...(sources ?? [])].map(toEvidenceLabel)
  return labels.length > 0 ? labels.join(' / ') : '补充上下文'
}

export const buildMissingIntentEvidenceHint = (params: {
  actionName: Parsed['name']
  evidenceSources: Set<SupplementalEvidenceSource> | undefined
  taskRef?: string
}): string => {
  const evidenceSources = formatEvidenceSources(params.evidenceSources)
  if (params.actionName === 'mutate_task') {
    return formatMutateTaskIntentEvidenceHint({
      evidenceSources,
      taskRef: params.taskRef ?? '当前目标 task',
    })
  }
  if (params.actionName === 'ask_user_choice')
    return formatAskUserChoiceIntentEvidenceHint(evidenceSources)
  if (params.actionName === 'remember_memory')
    return formatRememberMemoryIntentEvidenceHint(evidenceSources)
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
    const event = resolveSystemEvent(input)
    if (event.name === 'user_choice' && event.payload?.source === 'user')
      texts.push(text)
  }
  return texts
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

type MutateTaskGitOp = 'review_passed' | 'merged' | 'cleaned'

const resolveTaskRef = (task: Task | undefined, taskId: string): string => {
  const title = task?.title.trim()
  if (title) return `${taskId} / ${title}`
  return taskId
}

const resolveGitOpLabel = (op: MutateTaskGitOp): string => {
  if (op === 'review_passed') return 'review passed'
  if (op === 'merged') return 'merged'
  return 'cleaned'
}

export const isMutateTaskGitOp = (op: string): op is MutateTaskGitOp =>
  op === 'review_passed' || op === 'merged' || op === 'cleaned'

export const validateMutateTaskGitIntentEvidence = (params: {
  op: MutateTaskGitOp
  reason?: string | undefined
  task: Task | undefined
  taskId: string
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const reason = params.reason?.trim()
  if (!reason) {
    return formatMutateTaskIntentEvidenceHint({
      evidenceSources: formatEvidenceSources(
        params.supplementalEvidenceSources,
      ),
      taskRef: resolveTaskRef(params.task, params.taskId),
      requiredAction: resolveGitOpLabel(params.op),
    })
  }
  if (
    isSupportedByInputs({
      candidates: [reason],
      combinedCandidate: reason,
      inputs: params.inputTexts,
    })
  )
    return undefined
  return formatMutateTaskIntentEvidenceHint({
    evidenceSources: formatEvidenceSources(params.supplementalEvidenceSources),
    taskRef: resolveTaskRef(params.task, params.taskId),
    requiredAction: resolveGitOpLabel(params.op),
  })
}
