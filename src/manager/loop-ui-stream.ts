import { parseActions } from '../actions/protocol/parse.js'
import { notifyUiSignal } from '../orchestrator/core/ui-signal.js'
import { nowIso } from '../shared/utils.js'

import { stripFocusBlock } from './focus-extract.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TokenUsage } from '../types/index.js'

export const createUiStreamId = (
  inputsCursor: number,
  resultsCursor: number,
): string => `manager-stream-${Date.now()}-${inputsCursor}-${resultsCursor}`

export const startUiStream = (
  runtime: RuntimeState,
  streamId: string,
): void => {
  const stamp = nowIso()
  runtime.uiStream = {
    id: streamId,
    role: 'assistant',
    text: '',
    createdAt: stamp,
    updatedAt: stamp,
  }
}

const isSameUsage = (
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total

const asUsageNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const sanitizeUsage = (
  usage: TokenUsage | undefined,
): TokenUsage | undefined => {
  if (!usage) return undefined
  const input = asUsageNumber(usage.input)
  const output = asUsageNumber(usage.output)
  const total = asUsageNumber(usage.total)
  if (input === undefined && output === undefined && total === undefined)
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

const keepMonotonicUsageValue = (
  current: number | undefined,
  next: number | undefined,
): number | undefined => {
  if (next === undefined) return current
  if (current === undefined) return next
  return Math.max(current, next)
}

const mergeStreamUsage = (
  current: TokenUsage | undefined,
  next: TokenUsage,
): TokenUsage | undefined => {
  const normalizedNext = sanitizeUsage(next)
  if (!normalizedNext) return sanitizeUsage(current)
  const normalizedCurrent = sanitizeUsage(current)
  if (!normalizedCurrent) return normalizedNext
  const input = keepMonotonicUsageValue(
    normalizedCurrent.input,
    normalizedNext.input,
  )
  const output = keepMonotonicUsageValue(
    normalizedCurrent.output,
    normalizedNext.output,
  )
  const total = keepMonotonicUsageValue(
    normalizedCurrent.total,
    normalizedNext.total,
  )
  if (input === undefined && output === undefined && total === undefined)
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

export const setUiStreamText = (
  runtime: RuntimeState,
  streamId: string,
  nextText: string,
): void => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return
  if (stream.text === nextText) return
  stream.text = nextText
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime)
}

export const resetUiStream = (
  runtime: RuntimeState,
  streamId: string,
): void => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return
  stream.text = ''
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime)
}

export const setUiStreamUsage = (
  runtime: RuntimeState,
  streamId: string,
  nextUsage: TokenUsage,
): TokenUsage | undefined => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return undefined
  const mergedUsage = mergeStreamUsage(stream.usage, nextUsage)
  if (isSameUsage(stream.usage, mergedUsage)) return stream.usage
  if (mergedUsage) stream.usage = mergedUsage
  else if ('usage' in stream) delete stream.usage
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime)
  return mergedUsage
}

export const stopUiStream = (runtime: RuntimeState, streamId: string): void => {
  if (runtime.uiStream?.id !== streamId) return
  runtime.uiStream = null
}

export const toVisibleAssistantText = (rawOutput: string): string => {
  if (!rawOutput) return ''
  const stripped = stripFocusBlock(rawOutput)
  return parseActions(stripped).text
}
