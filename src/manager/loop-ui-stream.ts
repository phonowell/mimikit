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
  if ('usage' in stream) delete stream.usage
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime)
}

export const setUiStreamUsage = (
  runtime: RuntimeState,
  streamId: string,
  nextUsage: TokenUsage,
): void => {
  const stream = runtime.uiStream
  if (stream?.id !== streamId) return
  if (isSameUsage(stream.usage, nextUsage)) return
  stream.usage = nextUsage
  stream.updatedAt = nowIso()
  notifyUiSignal(runtime)
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
