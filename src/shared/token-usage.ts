import type { TokenUsage } from '../types/index.js'

const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const keepMonotonicUsageValue = (
  current: number | undefined,
  next: number | undefined,
): number | undefined => {
  if (next === undefined) return current
  if (current === undefined) return next
  return Math.max(current, next)
}

export const mergeUsageMonotonic = (
  current: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined => {
  const input = keepMonotonicUsageValue(
    asFiniteNumber(current?.input),
    asFiniteNumber(next?.input),
  )
  const output = keepMonotonicUsageValue(
    asFiniteNumber(current?.output),
    asFiniteNumber(next?.output),
  )
  const total = keepMonotonicUsageValue(
    asFiniteNumber(current?.total),
    asFiniteNumber(next?.total),
  )
  const sessionTotal = keepMonotonicUsageValue(
    asFiniteNumber(current?.sessionTotal),
    asFiniteNumber(next?.sessionTotal),
  )
  if (
    input === undefined &&
    output === undefined &&
    total === undefined &&
    sessionTotal === undefined
  )
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(sessionTotal !== undefined ? { sessionTotal } : {}),
  }
}

export const isSameUsage = (
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total &&
  left?.sessionTotal === right?.sessionTotal
