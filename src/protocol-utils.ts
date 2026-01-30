import type { TaskResult } from './protocol-types.js'

const writeLocks = new Map<string, Promise<void>>()

export const withLock = <T>(path: string, fn: () => Promise<T>): Promise<T> => {
  const prev = writeLocks.get(path) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  writeLocks.set(
    path,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

const MAX_HISTORY_FIELD_CHARS = 1200

const trimField = (value?: string): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed.length <= MAX_HISTORY_FIELD_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_HISTORY_FIELD_CHARS)}...`
}

export const trimTaskResult = (result: TaskResult): TaskResult => {
  const trimmed: TaskResult = {
    id: result.id,
    status: result.status,
    completedAt: result.completedAt,
  }
  if (result.createdAt !== undefined) trimmed.createdAt = result.createdAt
  if (result.origin !== undefined) trimmed.origin = result.origin
  if (result.selfAwakeRunId !== undefined)
    trimmed.selfAwakeRunId = result.selfAwakeRunId
  if (result.usage !== undefined) trimmed.usage = result.usage
  const prompt = trimField(result.prompt)
  if (prompt !== undefined) trimmed.prompt = prompt
  const output = trimField(result.result)
  if (output !== undefined) trimmed.result = output
  const error = trimField(result.error)
  if (error !== undefined) trimmed.error = error
  return trimmed
}
