import { stringify as stringifyYaml } from 'yaml'

import type { Task } from '../types/index.js'

export const escapeCdata = (value: string): string =>
  value.replaceAll(']]>', ']]]]><![CDATA[>')

export const parseIsoToMs = (value: string): number => {
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

export const resolveTaskChangedAt = (task: Task): string =>
  task.completedAt ?? task.startedAt ?? task.createdAt

export const sortTasksByChangedAt = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    const aTs = parseIsoToMs(resolveTaskChangedAt(a))
    const bTs = parseIsoToMs(resolveTaskChangedAt(b))
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })

export const normalizeYamlUsage = (
  usage?: Task['usage'],
): Task['usage'] | undefined => {
  if (!usage) return
  const normalized: Task['usage'] = {}
  if (typeof usage.input === 'number') normalized.input = usage.input
  if (typeof usage.inputCacheRead === 'number')
    normalized.inputCacheRead = usage.inputCacheRead
  if (typeof usage.inputCacheWrite === 'number')
    normalized.inputCacheWrite = usage.inputCacheWrite
  if (typeof usage.output === 'number') normalized.output = usage.output
  if (typeof usage.outputCache === 'number')
    normalized.outputCache = usage.outputCache
  if (typeof usage.total === 'number') normalized.total = usage.total
  if (typeof usage.sessionTotal === 'number')
    normalized.sessionTotal = usage.sessionTotal
  if (Object.keys(normalized).length === 0) return undefined
  return normalized
}

const yamlReplacer = (_key: unknown, value: unknown): unknown => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined
  if (typeof value === 'string' && value === '') return undefined
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined
    return value
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, next]) => next !== undefined,
    )
    if (entries.length === 0) return undefined
    return Object.fromEntries(entries)
  }
  return value
}

export const stringifyPromptYaml = (value: unknown): string =>
  stringifyYaml(value, yamlReplacer, {
    lineWidth: 0,
    indent: 2,
    singleQuote: false,
    blockQuote: false,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  }).trimEnd()
