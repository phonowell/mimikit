import { scoreTextOverlap, tokenizeSearchText } from '../shared/text-search.js'
import { clipUtf8ByBytes } from '../shared/text.js'
import { computeRecencyWeight, parseIsoToMsOrZero } from '../shared/time.js'

import { type MemoryEntry } from './entry-types.js'

const REDUNDANCY_THRESHOLD = 0.9
const MIN_MENTION_OVERLAP = 0.06
const MAX_MENTION_BOOST = 0.05

export type MemoryScoreContext = {
  queryText: string
  mentionTexts?: string[]
  workingFocusIds?: string[]
}

export type ScoredMemoryEntry = MemoryEntry & {
  score: number
}

const jaccardSimilarity = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) return 0
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  let intersection = 0
  for (const token of leftSet) if (rightSet.has(token)) intersection += 1
  const union = new Set([...leftSet, ...rightSet]).size
  return union > 0 ? intersection / union : 0
}

const normalizeMentionTexts = (value: string[] | undefined): string[] =>
  value?.map((item) => item.trim()).filter((item) => item.length > 0) ?? []

const mentionBoost = (entryText: string, mentionTexts: string[]): number => {
  if (!entryText.trim() || mentionTexts.length === 0) return 0
  let mentionStrength = 0
  for (const text of mentionTexts) {
    const overlap = scoreTextOverlap(text, entryText)
    if (overlap < MIN_MENTION_OVERLAP) continue
    mentionStrength += Math.min(1, overlap / 0.5)
  }
  if (mentionStrength <= 0) return 0
  return Math.min(MAX_MENTION_BOOST, Math.log1p(mentionStrength) * 0.03)
}

const sourceReliability = (entry: MemoryEntry): number => {
  if (entry.source === 'remember') return 1
  if (entry.source === 'refresh') return 0.7
  return 0.5
}

const evidenceReliability = (entry: MemoryEntry): number => {
  const evidenceCount = entry.evidenceIds?.length ?? 0
  return Math.min(1, evidenceCount / 4)
}

const hasFocusHint = (
  entry: MemoryEntry,
  workingFocusIds: string[],
): boolean => {
  const hints =
    entry.focusHints?.map((item) => item.trim()).filter(Boolean) ?? []
  if (hints.length === 0 || workingFocusIds.length === 0) return false
  const focusSet = new Set(workingFocusIds.map((item) => item.trim()))
  return hints.some((item) => focusSet.has(item))
}

export const rankMemoryEntries = (params: {
  entries: MemoryEntry[]
  context: MemoryScoreContext
}): ScoredMemoryEntry[] => {
  const { queryText } = params.context
  const mentionTexts = normalizeMentionTexts(params.context.mentionTexts)
  const workingFocusIds =
    params.context.workingFocusIds
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0) ?? []
  const timestamps = params.entries.map((entry) =>
    parseIsoToMsOrZero(entry.updatedAt),
  )
  const oldest = timestamps.length > 0 ? Math.min(...timestamps) : 0
  const newest = timestamps.length > 0 ? Math.max(...timestamps) : 0

  const ranked = params.entries.map((entry) => {
    const entryText = `${entry.title}\n${entry.content}`
    const relevance =
      queryText.trim().length > 0 ? scoreTextOverlap(queryText, entryText) : 0.5
    const recency = computeRecencyWeight(
      parseIsoToMsOrZero(entry.updatedAt),
      oldest,
      newest,
    )
    const reliability =
      sourceReliability(entry) * 0.7 + evidenceReliability(entry) * 0.3
    const focusMatch = hasFocusHint(entry, workingFocusIds) ? 1 : 0
    const score =
      relevance * 0.5 +
      recency * 0.2 +
      reliability * 0.2 +
      focusMatch * 0.05 +
      mentionBoost(entryText, mentionTexts)
    return {
      ...entry,
      score,
    }
  })

  return ranked.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score
    const leftTs = parseIsoToMsOrZero(left.updatedAt)
    const rightTs = parseIsoToMsOrZero(right.updatedAt)
    if (leftTs !== rightTs) return rightTs - leftTs
    return left.id.localeCompare(right.id)
  })
}

export const selectScoredMemoryEntries = (params: {
  rankedEntries: ScoredMemoryEntry[]
  maxBytes: number
  render: (entry: MemoryEntry) => string
}): MemoryEntry[] => {
  const selected: MemoryEntry[] = []
  const selectedTokens: string[][] = []
  let usedBytes = 0

  for (const entry of params.rankedEntries) {
    const entryTokens = tokenizeSearchText(`${entry.title}\n${entry.content}`)
    if (
      selectedTokens.some(
        (tokens) =>
          jaccardSimilarity(tokens, entryTokens) >= REDUNDANCY_THRESHOLD,
      )
    )
      continue

    const rendered = params.render(entry).trim()
    if (!rendered) continue
    const prefix = selected.length > 0 ? '\n\n' : ''
    const segment = `${prefix}${rendered}`
    const segmentBytes = Buffer.byteLength(segment, 'utf8')
    if (usedBytes + segmentBytes > params.maxBytes) continue

    selected.push(entry)
    selectedTokens.push(entryTokens)
    usedBytes += segmentBytes
  }

  if (selected.length > 0 || params.rankedEntries.length === 0) return selected

  const first = params.rankedEntries[0]
  if (!first) return []
  const clipped = clipUtf8ByBytes(params.render(first), params.maxBytes)
  if (!clipped) return []
  return [{ ...first, content: clipped }]
}

const renderPromptEntry = (entry: MemoryEntry): string =>
  `### ${entry.title} (id:${entry.id})\n${entry.content}`

export const buildScoredMemoryPrompt = (params: {
  entries: MemoryEntry[]
  context: MemoryScoreContext
  maxBytes: number
}): string => {
  const ranked = rankMemoryEntries({
    entries: params.entries,
    context: params.context,
  })
  const selected = selectScoredMemoryEntries({
    rankedEntries: ranked,
    maxBytes: params.maxBytes,
    render: renderPromptEntry,
  })
  return selected
    .map((entry) => renderPromptEntry(entry))
    .join('\n\n')
    .trim()
}
