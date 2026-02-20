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
  const cacheRead = keepMonotonicUsageValue(
    asFiniteNumber(current?.cacheRead),
    asFiniteNumber(next?.cacheRead),
  )
  const cacheWrite = keepMonotonicUsageValue(
    asFiniteNumber(current?.cacheWrite),
    asFiniteNumber(next?.cacheWrite),
  )
  if (
    input === undefined &&
    output === undefined &&
    total === undefined &&
    sessionTotal === undefined &&
    cacheRead === undefined &&
    cacheWrite === undefined
  )
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(sessionTotal !== undefined ? { sessionTotal } : {}),
    ...(cacheRead !== undefined ? { cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite } : {}),
  }
}

export const isSameUsage = (
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total &&
  left?.sessionTotal === right?.sessionTotal &&
  left?.cacheRead === right?.cacheRead &&
  left?.cacheWrite === right?.cacheWrite
