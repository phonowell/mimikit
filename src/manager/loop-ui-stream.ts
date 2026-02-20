import { parseActions } from '../actions/protocol/parse.js'
import { notifyUiSignal } from '../orchestrator/core/ui-signal.js'
import { isSameUsage, mergeUsageMonotonic } from '../shared/token-usage.js'
import { nowIso } from '../shared/utils.js'

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
    role: 'agent',
    text: '',
    createdAt: stamp,
    updatedAt: stamp,
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
  notifyUiSignal(runtime, 'stream')
}

export const resetUiStream = (
  runtime: RuntimeState,
  streamId: string,
): void => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return
  stream.text = ''
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime, 'stream')
}

export const setUiStreamUsage = (
  runtime: RuntimeState,
  streamId: string,
  nextUsage: TokenUsage,
): TokenUsage | undefined => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return undefined
  const mergedUsage = mergeUsageMonotonic(stream.usage, nextUsage)
  if (isSameUsage(stream.usage, mergedUsage)) return stream.usage
  if (mergedUsage) stream.usage = mergedUsage
  else if ('usage' in stream) delete stream.usage
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime, 'stream')
  return mergedUsage
}

export const stopUiStream = (runtime: RuntimeState, streamId: string): void => {
  if (runtime.uiStream?.id !== streamId) return
  runtime.uiStream = null
}

export const toVisibleAgentText = (rawOutput: string): string => {
  if (!rawOutput) return ''
  return parseActions(rawOutput).text
}
