import type { HistoryMessage, Task } from '../types/index.js'

const TAG_PREFIX = 'MIMIKIT:'

export const escapeCdata = (value: string): string =>
  value.replaceAll(']]>', ']]]]><![CDATA[>')

export const normalizeTagName = (tag: string): string => {
  const trimmed = tag.trim()
  if (!trimmed) return TAG_PREFIX
  return trimmed.startsWith(TAG_PREFIX) ? trimmed : `${TAG_PREFIX}${trimmed}`
}

export const parseIsoToMs = (value: string): number => {
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

export const resolveTaskChangedAt = (task: Task): string =>
  task.completedAt ?? task.startedAt ?? task.createdAt

export const mapHistoryRole = (role: HistoryMessage['role']): string => {
  switch (role) {
    case 'user':
      return 'user'
    case 'manager':
      return 'agent'
    case 'system':
      return 'system'
    default:
      return 'unknown'
  }
}

export const yamlIndent = (level: number): string => '  '.repeat(level)

export const yamlScalar = (value: string | number | boolean): string => {
  if (typeof value === 'number')
    return Number.isFinite(value) ? `${value}` : '0'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return JSON.stringify(value)
}

export const appendYamlLine = (
  lines: string[],
  level: number,
  key: string,
  value: string | number | boolean,
): void => {
  lines.push(`${yamlIndent(level)}${key}: ${yamlScalar(value)}`)
}

export const appendYamlUsage = (
  lines: string[],
  level: number,
  usage?: Task['usage'],
): void => {
  if (!usage) return
  const entries: Array<[string, number]> = []
  if (typeof usage.input === 'number') entries.push(['input', usage.input])
  if (typeof usage.output === 'number') entries.push(['output', usage.output])
  if (typeof usage.total === 'number') entries.push(['total', usage.total])
  if (entries.length === 0) return
  lines.push(`${yamlIndent(level)}usage:`)
  for (const [key, val] of entries)
    lines.push(`${yamlIndent(level + 1)}${key}: ${val}`)
}
