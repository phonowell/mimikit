import { renderPromptTemplate } from '../prompts/format.js'

import type { TokenUsage } from '../types/index.js'

export const DONE_MARKER = '<M:task_done/>'
export const MAX_RUN_ROUNDS = 3

export const hasDoneMarker = (output: string): boolean =>
  output.includes(DONE_MARKER)

export const stripDoneMarker = (output: string): string =>
  output.replaceAll(DONE_MARKER, '').trim()

export const mergeUsage = (
  current: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined => {
  if (!next) return current
  const input =
    next.input !== undefined
      ? (current?.input ?? 0) + next.input
      : current?.input
  const output =
    next.output !== undefined
      ? (current?.output ?? 0) + next.output
      : current?.output
  const total =
    next.total !== undefined
      ? (current?.total ?? 0) + next.total
      : current?.total
  if (input === undefined && output === undefined && total === undefined)
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

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
  const currentInput = asFiniteNumber(current?.input)
  const currentOutput = asFiniteNumber(current?.output)
  const currentTotal = asFiniteNumber(current?.total)
  const nextInput = asFiniteNumber(next?.input)
  const nextOutput = asFiniteNumber(next?.output)
  const nextTotal = asFiniteNumber(next?.total)
  const input = keepMonotonicUsageValue(currentInput, nextInput)
  const output = keepMonotonicUsageValue(currentOutput, nextOutput)
  const total = keepMonotonicUsageValue(currentTotal, nextTotal)
  if (input === undefined && output === undefined && total === undefined)
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

export const isSameUsage = (
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total

export const buildContinuePrompt = (
  template: string,
  latestOutput: string,
  nextRound: number,
): string =>
  renderPromptTemplate(template, {
    done_marker: DONE_MARKER,
    latest_output: latestOutput.trim(),
    next_round: String(nextRound),
    max_rounds: String(MAX_RUN_ROUNDS),
  })
