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
  const inputCacheRead = keepMonotonicUsageValue(
    asFiniteNumber(current?.inputCacheRead),
    asFiniteNumber(next?.inputCacheRead),
  )
  const inputCacheWrite = keepMonotonicUsageValue(
    asFiniteNumber(current?.inputCacheWrite),
    asFiniteNumber(next?.inputCacheWrite),
  )
  const outputCache = keepMonotonicUsageValue(
    asFiniteNumber(current?.outputCache),
    asFiniteNumber(next?.outputCache),
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
    inputCacheRead === undefined &&
    inputCacheWrite === undefined &&
    outputCache === undefined &&
    total === undefined &&
    sessionTotal === undefined
  )
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(inputCacheRead !== undefined ? { inputCacheRead } : {}),
    ...(inputCacheWrite !== undefined ? { inputCacheWrite } : {}),
    ...(outputCache !== undefined ? { outputCache } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(sessionTotal !== undefined ? { sessionTotal } : {}),
  }
}

const sumUsageValue = (
  current: number | undefined,
  next: number | undefined,
): number | undefined => {
  if (next === undefined) return current
  return (current ?? 0) + next
}

export const mergeUsageAdditive = (
  current: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined => {
  if (!next) return current
  const input = sumUsageValue(
    asFiniteNumber(current?.input),
    asFiniteNumber(next.input),
  )
  const output = sumUsageValue(
    asFiniteNumber(current?.output),
    asFiniteNumber(next.output),
  )
  const inputCacheRead = sumUsageValue(
    asFiniteNumber(current?.inputCacheRead),
    asFiniteNumber(next.inputCacheRead),
  )
  const inputCacheWrite = sumUsageValue(
    asFiniteNumber(current?.inputCacheWrite),
    asFiniteNumber(next.inputCacheWrite),
  )
  const outputCache = sumUsageValue(
    asFiniteNumber(current?.outputCache),
    asFiniteNumber(next.outputCache),
  )
  const total = sumUsageValue(
    asFiniteNumber(current?.total),
    asFiniteNumber(next.total),
  )
  const sessionTotal = sumUsageValue(
    asFiniteNumber(current?.sessionTotal),
    asFiniteNumber(next.sessionTotal),
  )
  if (
    input === undefined &&
    output === undefined &&
    inputCacheRead === undefined &&
    inputCacheWrite === undefined &&
    outputCache === undefined &&
    total === undefined &&
    sessionTotal === undefined
  )
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(inputCacheRead !== undefined ? { inputCacheRead } : {}),
    ...(inputCacheWrite !== undefined ? { inputCacheWrite } : {}),
    ...(outputCache !== undefined ? { outputCache } : {}),
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
  left?.inputCacheRead === right?.inputCacheRead &&
  left?.inputCacheWrite === right?.inputCacheWrite &&
  left?.outputCache === right?.outputCache &&
  left?.total === right?.total &&
  left?.sessionTotal === right?.sessionTotal
