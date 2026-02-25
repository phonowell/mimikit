import type { TokenUsage } from '../types/index.js'

type UsageKey = keyof TokenUsage

const USAGE_KEYS: UsageKey[] = [
  'input',
  'output',
  'inputCacheRead',
  'inputCacheWrite',
  'outputCache',
  'total',
  'sessionTotal',
]

const fin = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

const toTokenUsage = (
  values: Partial<Record<UsageKey, number | undefined>>,
): TokenUsage | undefined => {
  const result: TokenUsage = {}
  for (const key of USAGE_KEYS) {
    const v = values[key]
    if (v !== undefined) result[key] = v
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export const mergeUsageMonotonic = (
  current: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined => {
  const values: Partial<Record<UsageKey, number | undefined>> = {}
  for (const key of USAGE_KEYS) {
    const c = fin(current?.[key])
    const n = fin(next?.[key])
    if (n === undefined) values[key] = c
    else if (c === undefined) values[key] = n
    else values[key] = Math.max(c, n)
  }
  return toTokenUsage(values)
}

export const mergeUsageAdditive = (
  current: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined => {
  if (!next) return current
  const values: Partial<Record<UsageKey, number | undefined>> = {}
  for (const key of USAGE_KEYS) {
    const c = fin(current?.[key])
    const n = fin(next[key])
    if (n === undefined) values[key] = c
    else values[key] = (c ?? 0) + n
  }
  return toTokenUsage(values)
}

export const isSameUsage = (
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): boolean => USAGE_KEYS.every((key) => left?.[key] === right?.[key])
