import type { Task, TaskResult, WorkerProfile } from '../types/index.js'

export const SUCCESS_MIN_DURATION_MS = 60_000
export const SUCCESS_MIN_INTERVAL_MS = 1_500
export const SUCCESS_BATCH_WINDOW_MS = 5_000
export const SUCCESS_BATCH_TITLES_LIMIT = 3

export type SuccessItem = {
  title: string
  profile: WorkerProfile
  durationMs: number
}

export const sanitizeLine = (text: string, maxChars = 140): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= maxChars) return oneLine
  return `${oneLine.slice(0, maxChars - 1).trimEnd()}…`
}

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m${seconds}s`
}

export const normalizeTitle = (task: Task): string => {
  const trimmed = task.title.trim()
  if (trimmed.length > 0) return trimmed
  return task.id
}

export const shouldNotifySucceeded = (
  task: Task,
  result: TaskResult,
): boolean => {
  if (task.profile === 'deferred') return false
  if (task.profile === 'specialist') return true
  return result.durationMs >= SUCCESS_MIN_DURATION_MS
}

export const summarizeProfiles = (items: SuccessItem[]): string => {
  const counts: Record<WorkerProfile, number> = {
    deferred: 0,
    specialist: 0,
    standard: 0,
  }
  for (const item of items) counts[item.profile] += 1
  const tokens: string[] = []
  if (counts.standard > 0) tokens.push(`standard:${counts.standard}`)
  if (counts.specialist > 0) tokens.push(`specialist:${counts.specialist}`)
  if (counts.deferred > 0) tokens.push(`deferred:${counts.deferred}`)
  return tokens.join(' ')
}
