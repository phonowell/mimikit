import { stringify as stringifyYaml } from 'yaml'

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
    case 'assistant':
      return 'agent'
    case 'system':
      return 'system'
    default:
      return 'unknown'
  }
}

export const normalizeYamlUsage = (
  usage?: Task['usage'],
): Task['usage'] | undefined => {
  if (!usage) return
  const normalized: Task['usage'] = {}
  if (typeof usage.input === 'number') normalized.input = usage.input
  if (typeof usage.output === 'number') normalized.output = usage.output
  if (typeof usage.total === 'number') normalized.total = usage.total
  if (Object.keys(normalized).length === 0) return undefined
  return normalized
}

export const stringifyPromptYaml = (value: unknown): string =>
  stringifyYaml(value, {
    lineWidth: 0,
    indent: 2,
    singleQuote: false,
    blockQuote: false,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  }).trimEnd()
