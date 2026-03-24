import { parseIsoToMs } from '../shared/time.js'

import type { Task } from '../types/index.js'

export { parseIsoToMs }

export const escapeCdata = (value: string): string =>
  value.replaceAll(']]>', ']]]]><![CDATA[>')

export const resolveTaskChangedAt = (task: Task): string =>
  task.completedAt ?? task.startedAt ?? task.createdAt

export const sortTasksByChangedAt = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    const aTs = parseIsoToMs(resolveTaskChangedAt(a))
    const bTs = parseIsoToMs(resolveTaskChangedAt(b))
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })

export const normalizePromptUsage = (
  usage?: Task['usage'],
): Task['usage'] | undefined => {
  if (!usage) return
  const fields = [
    'input',
    'inputCacheRead',
    'inputCacheWrite',
    'output',
    'outputCache',
    'total',
    'sessionTotal',
  ] as const
  const normalized: Task['usage'] = {}
  for (const key of fields) {
    const v = usage[key]
    if (typeof v === 'number') normalized[key] = v
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

const prunePromptValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined
  if (typeof value === 'string' && value === '') return undefined
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => prunePromptValue(item))
      .filter((item) => item !== undefined)
    return normalized.length > 0 ? normalized : undefined
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, next]) => [key, prunePromptValue(next)] as const)
      .filter(([, next]) => next !== undefined)
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
  }
  return value
}

export const stringifyPromptJson = (value: unknown): string => {
  const normalized = prunePromptValue(value)
  if (normalized === undefined) return ''
  return JSON.stringify(normalized, null, 2).trimEnd()
}
