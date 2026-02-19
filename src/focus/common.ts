import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  ConversationFocus,
  TaskResult,
  UserInput,
} from '../types/index.js'

export const FOCUS_SYNC_INTERVAL = 10
export const FOCUS_ROLLBACK_MAX = 6
export const FOCUS_DRIFT_SIMILARITY_THRESHOLD = 0.14

const TOKEN_RE = /[\p{L}\p{N}_-]+/gu

export const tokenize = (value: string): Set<string> =>
  new Set(value.toLowerCase().match(TOKEN_RE) ?? [])

const overlapRatio = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return (2 * shared) / (left.size + right.size)
}

const focusText = (
  focus: Pick<ConversationFocus, 'title' | 'summary'>,
): string => `${focus.title}\n${focus.summary}`

export const focusSimilarity = (
  left: Pick<ConversationFocus, 'title' | 'summary'>,
  right: Pick<ConversationFocus, 'title' | 'summary'>,
): number => overlapRatio(tokenize(focusText(left)), tokenize(focusText(right)))

export const resolveFocusSlots = (runtime: RuntimeState): number =>
  Math.max(1, runtime.config.worker.maxConcurrent)

export const byUpdatedDesc = (
  left: ConversationFocus,
  right: ConversationFocus,
): number => {
  const diff = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  if (diff !== 0) return diff
  return left.id.localeCompare(right.id)
}

export const byLastReferencedDesc = (
  left: ConversationFocus,
  right: ConversationFocus,
): number => {
  const diff =
    Date.parse(right.lastReferencedAt) - Date.parse(left.lastReferencedAt)
  if (diff !== 0) return diff
  return left.id.localeCompare(right.id)
}

export const trimExpiredByLru = (
  expired: ConversationFocus[],
  limit: number,
): ConversationFocus[] =>
  [...expired].sort(byLastReferencedDesc).slice(0, limit)

export const cloneFocuses = (
  focuses: ConversationFocus[],
): ConversationFocus[] =>
  focuses.map((item) => ({ ...item, evidenceIds: [...item.evidenceIds] }))

export const normalizeFocusConfidence = (value?: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

export const normalizeEvidenceIds = (value: string[]): string[] => {
  const seen = new Set<string>()
  const next: string[] = []
  for (const raw of value) {
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}

export const hasEvidenceIntersection = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  if (left.length === 0 || right.length === 0) return false
  const set = new Set(left)
  for (const id of right) if (set.has(id)) return true
  return false
}

export const collectBatchEvidenceIds = (
  inputs: UserInput[],
  results: TaskResult[],
): Set<string> => {
  const ids = new Set<string>()
  for (const input of inputs) ids.add(input.id)
  for (const result of results) ids.add(result.taskId)
  return ids
}
